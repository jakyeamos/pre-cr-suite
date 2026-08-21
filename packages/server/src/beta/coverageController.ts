import * as path from 'path';

import {
  type CodeLens,
  type CodeLensParams,
  type Connection,
  DiagnosticSeverity,
  DiagnosticTag,
  type Hover,
  MarkupKind,
  type TextDocumentPositionParams,
  type TextDocuments
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import {
  DEFAULT_PRE_CR_CONFIG,
  PRE_CR_METHODS,
  PRE_CR_NOTIFICATIONS,
  assertRequestParams,
  buildReadinessEnvelope,
  type FileCoverage,
  type GetCoverageDecorationsResult,
  type GetCoverageSummaryResult,
  type GetProjectHealthResult,
  type RefreshCoverageResult,
  type RunPreCrCheckResult,
  type WorkspaceCoverage,
  type WorkspaceSessionUpdate,
  LineCoverageStatus,
  lineCoverageToDecoration,
  loadProjectConfig,
  loadWorkspaceCoverage,
  getProjectHealth as buildProjectHealth,
  runWorkspacePreCrCheck,
  isRunPreCrCheckParams,
  isWorkspaceRequestParams,
  isGetCoverageDecorationsParams,
  isGetCoverageParams,
  resolveWorkspacePath
} from '@pre-cr/core';

interface CoverageSettings {
  showDiagnostics: boolean;
  showCodeLens: boolean;
}

interface CoverageControllerContext {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  getCoverageSettings: () => CoverageSettings;
  getWorkspaceRoot: (params?: unknown) => string | null;
  getCoverage: (params?: unknown) => WorkspaceCoverage | null;
  getCoveragePath: (params?: unknown) => string | null;
  getTrustedExecution: (params?: unknown) => boolean;
  getSessionForUri?: (uri: string) => {
    workspaceRoot: string;
    coverage: WorkspaceCoverage | null;
    coveragePath: string | null;
    trustedExecution: boolean;
  } | null;
  setCoverageState: (coverage: WorkspaceCoverage | null, coveragePath: string | null, workspaceRoot?: string) => void;
  setSessionState?: (workspaceRoot: string, update: WorkspaceSessionUpdate) => void;
}

export interface CoverageController {
  loadCoverage: (workspaceRoot?: string) => boolean;
  validateTextDocument: (textDocument: TextDocument) => void;
  handleHover: (params: TextDocumentPositionParams) => Hover | null;
  handleCodeLens: (params: CodeLensParams) => CodeLens[];
  registerBetaRequests: () => void;
}

export function createCoverageController(context: CoverageControllerContext): CoverageController {
  const {
    connection,
    documents,
    getCoverageSettings,
    getWorkspaceRoot,
    getCoverage,
    getCoveragePath,
    getTrustedExecution,
    getSessionForUri,
    setCoverageState,
    setSessionState
  } = context;

  function getFileCoverage(uri: string): FileCoverage | undefined {
    const session = getSessionForUri?.(uri);
    const coverage = session ? session.coverage : getCoverage();
    if (!coverage) {
      return undefined;
    }

    let filePath: string;
    try {
      filePath = URI.parse(uri).fsPath;
    } catch {
      return undefined;
    }
    const workspaceRoot = session ? session.workspaceRoot : getWorkspaceRoot();
    const candidates = [filePath, path.normalize(filePath)];
    if (workspaceRoot) {
      const resolved = resolveWorkspacePath(workspaceRoot, filePath, {
        access: 'read',
        allowAbsolute: true
      });
      if (resolved.valid) {
        candidates.push(resolved.resolvedPath);
        if (resolved.realPath) {
          candidates.push(resolved.realPath);
        }
      }
    }

    for (const candidate of candidates) {
      const fileCoverage = coverage.files.get(candidate);
      if (fileCoverage) {
        return fileCoverage;
      }
    }

    return undefined;
  }

  function loadCoverage(workspaceRootOverride?: string): boolean {
    const workspaceRoot = workspaceRootOverride ?? getWorkspaceRoot();
    if (!workspaceRoot) {
      connection.console.warn('No workspace root, cannot load coverage');
      return false;
    }

    const result = loadWorkspaceCoverage(workspaceRoot, loadProjectConfig(workspaceRoot));

    if (!result.coverage) {
      if (result.error) {
        connection.console.error(`Failed to load coverage: ${result.error}`);
      } else {
        connection.console.info('No coverage file found');
      }
      setCoverageState(null, null, workspaceRoot);
      for (const document of documents.all()) {
        validateTextDocument(document);
      }
      return false;
    }

    setCoverageState(result.coverage, result.coveragePath, workspaceRoot);
    connection.console.info(
      `Coverage loaded: ${result.coverage.summary.linePercentage}% lines, ` +
      `${result.coverage.files.size} files`
    );
    connection.sendNotification(PRE_CR_NOTIFICATIONS.coverageChanged, {
      summary: result.coverage.summary
    });
    for (const document of documents.all()) {
      validateTextDocument(document);
    }
    return true;
  }

  function validateTextDocument(textDocument: TextDocument): void {
    if (!getCoverageSettings().showDiagnostics) {
      connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
      return;
    }

    const fileCoverage = getFileCoverage(textDocument.uri);
    if (!fileCoverage) {
      connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
      return;
    }

    const diagnostics = [];

    for (const [lineNumber, lineCov] of fileCoverage.lines) {
      const lineIndex = lineNumber - 1;
      const lineText = textDocument.getText({
        start: { line: lineIndex, character: 0 },
        end: { line: lineIndex, character: Number.MAX_SAFE_INTEGER }
      });

      if (lineCov.status === LineCoverageStatus.Uncovered) {
        if (!lineText.trim()) {
          continue;
        }

        diagnostics.push({
          severity: DiagnosticSeverity.Information,
          range: {
            start: { line: lineIndex, character: 0 },
            end: { line: lineIndex, character: lineText.length }
          },
          message: 'Line not covered by tests',
          source: 'pre-cr',
          code: 'uncovered-line',
          tags: [DiagnosticTag.Unnecessary]
        });
        continue;
      }

      if (lineCov.status === LineCoverageStatus.Partial) {
        const branches = lineCov.branches ?? [];
        const taken = branches.filter((branch) => branch.taken > 0).length;

        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: {
            start: { line: lineIndex, character: 0 },
            end: { line: lineIndex, character: lineText.length }
          },
          message: `Partial coverage: ${taken}/${branches.length} branches taken`,
          source: 'pre-cr',
          code: 'partial-coverage'
        });
      }
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  }

  function handleHover(params: TextDocumentPositionParams): Hover | null {
    const fileCoverage = getFileCoverage(params.textDocument.uri);
    if (!fileCoverage) {
      return null;
    }

    const lineCov = fileCoverage.lines.get(params.position.line + 1);
    if (!lineCov) {
      return null;
    }

    let content = `**Coverage:** ${lineCov.executionCount} execution${lineCov.executionCount !== 1 ? 's' : ''}\n\n`;

    if (lineCov.branches && lineCov.branches.length > 0) {
      const taken = lineCov.branches.filter((branch) => branch.taken > 0).length;
      content += `**Branches:** ${taken}/${lineCov.branches.length} covered\n\n`;
      content += '| Branch | Status | Hits |\n|--------|--------|------|\n';
      for (const branch of lineCov.branches) {
        const status = branch.taken > 0 ? '✅' : '❌';
        const type = branch.type ? ` (${branch.type})` : '';
        content += `| #${branch.branchId}${type} | ${status} | ${branch.taken} |\n`;
      }
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: content
      }
    };
  }

  function handleCodeLens(params: CodeLensParams): CodeLens[] {
    if (!getCoverageSettings().showCodeLens) {
      return [];
    }

    const fileCoverage = getFileCoverage(params.textDocument.uri);
    if (!fileCoverage) {
      return [];
    }

    const codeLenses: CodeLens[] = [
      {
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
        command: {
          title: `Coverage: ${fileCoverage.summary.linePercentage}% lines | ${fileCoverage.summary.branchPercentage}% branches`,
          command: ''
        }
      }
    ];

    for (const fn of fileCoverage.functions) {
      if (fn.lineNumber <= 0) {
        continue;
      }

      codeLenses.push({
        range: {
          start: { line: fn.lineNumber - 1, character: 0 },
          end: { line: fn.lineNumber - 1, character: 0 }
        },
        command: {
          title: `${fn.executionCount > 0 ? '✅' : '❌'} ${fn.executionCount} call${fn.executionCount !== 1 ? 's' : ''}`,
          command: ''
        }
      });
    }

    return codeLenses;
  }

  function registerBetaRequests(): void {
    connection.onRequest(
      PRE_CR_METHODS.getCoverageDecorations,
      (params: unknown): GetCoverageDecorationsResult => {
        const parsed = assertRequestParams(
          params,
          isGetCoverageDecorationsParams,
          PRE_CR_METHODS.getCoverageDecorations
        );
        const fileCoverage = getFileCoverage(parsed.textDocument.uri);
        if (!fileCoverage) {
          return { decorations: [] };
        }

        const document = documents.get(parsed.textDocument.uri);
        const decorations = [];

        for (const [, lineCov] of fileCoverage.lines) {
          if (lineCov.status === LineCoverageStatus.NotExecutable) {
            continue;
          }

          let lineLength = 80;
          if (document) {
            const lineIndex = lineCov.lineNumber - 1;
            if (lineIndex < document.lineCount) {
              const lineText = document.getText({
                start: { line: lineIndex, character: 0 },
                end: { line: lineIndex, character: Number.MAX_SAFE_INTEGER }
              });
              lineLength = lineText.length;
            }
          }

          decorations.push(lineCoverageToDecoration(lineCov, lineLength));
        }

        return { decorations };
      }
    );

    connection.onRequest(PRE_CR_METHODS.getCoverageSummary, (_params: unknown = {}): GetCoverageSummaryResult => {
      assertRequestParams(_params, isWorkspaceRequestParams, PRE_CR_METHODS.getCoverageSummary);
      return {
        summary: getCoverage(_params)?.summary ?? null,
        coveragePath: getCoveragePath(_params)
      };
    });

    connection.onRequest(PRE_CR_METHODS.getCoverage, (params: unknown) => {
      const parsed = assertRequestParams(params, isGetCoverageParams, PRE_CR_METHODS.getCoverage);
      const fileCoverage = getFileCoverage(parsed.uri);
      if (!fileCoverage) {
        return { coverage: null };
      }

      const lines: Record<number, number> = {};
      for (const [lineNumber, lineCov] of fileCoverage.lines) {
        lines[lineNumber] = lineCov.executionCount;
      }

      return {
        coverage: {
          path: fileCoverage.filePath,
          lines,
          summary: fileCoverage.summary
        }
      };
    });

    const refreshCoverageRequest = (_params: unknown = {}): RefreshCoverageResult => {
      assertRequestParams(_params, isWorkspaceRequestParams, PRE_CR_METHODS.refreshCoverage);
      const workspaceRoot = getWorkspaceRoot(_params);
      return {
        success: workspaceRoot ? loadCoverage(workspaceRoot) : false,
        coveragePath: getCoveragePath(_params),
        summary: getCoverage(_params)?.summary ?? null
      };
    };

    connection.onRequest(PRE_CR_METHODS.refreshCoverage, refreshCoverageRequest);
    connection.onRequest('$/preCr/loadCoverage', refreshCoverageRequest);

    connection.onRequest(PRE_CR_METHODS.getProjectHealth, async (_params: unknown = {}): Promise<GetProjectHealthResult> => {
      assertRequestParams(_params, isWorkspaceRequestParams, PRE_CR_METHODS.getProjectHealth);
      const workspaceRoot = getWorkspaceRoot(_params);
      if (!workspaceRoot) {
        return {
          health: {
            workspaceRoot: '',
            configPath: null,
            isLegacyConfig: false,
            config: DEFAULT_PRE_CR_CONFIG,
            framework: {
              name: null,
              command: null,
              source: 'none',
              configFile: null
            },
            coverage: {
              loaded: false,
              path: null,
              format: null,
              summary: null
            },
            issues: [
              {
                code: 'missing-git',
                severity: 'error',
                message: 'No workspace root is available for this session.'
              }
            ],
            warnings: [],
            ready: false
          }
        };
      }

      const health = await buildProjectHealth(workspaceRoot, getCoverage(_params));
      setSessionState?.(workspaceRoot, { health });
      return { health };
    });

    connection.onRequest(PRE_CR_METHODS.runPreCrCheck, async (_params: unknown = {}): Promise<RunPreCrCheckResult> => {
      const parsed = assertRequestParams(_params, isRunPreCrCheckParams, PRE_CR_METHODS.runPreCrCheck);
      const workspaceRoot = getWorkspaceRoot(parsed);
      if (!workspaceRoot) {
        return { result: null, error: 'No workspace root' };
      }

      const result = await runWorkspacePreCrCheck(workspaceRoot, {
        allowConfigExecution: getTrustedExecution(parsed),
        changeScope: parsed.scope ?? 'staged'
      });
      if (result.result?.coveragePath) {
        loadCoverage(workspaceRoot);
      }

      const hasBlockingIssue = result.result?.health.issues.some((issue) => issue.severity === 'error') ?? false;
      const hasWarningIssue = result.result?.health.issues.some((issue) => issue.severity === 'warning') ?? false;
      const coverageFailed = result.result?.coverageCheck
        ? !result.result.coverageCheck.passed
        : Boolean(result.result?.testRun);
      const qualityPassed = result.result?.qualityAdaptersPassed ?? false;
      const gateDecision = result.error || hasBlockingIssue || coverageFailed || !qualityPassed
        ? 'block'
        : hasWarningIssue || (result.result?.coverageCheck?.unsupportedFiles.length ?? 0) > 0
          ? 'warn'
          : 'pass';
      const ok = gateDecision !== 'block';
      const readiness = buildReadinessEnvelope(result, {
        scope: parsed.scope ?? 'staged',
        ok,
        gateDecision
      });
      setSessionState?.(workspaceRoot, {
        health: result.result?.health ?? null,
        lastResult: result.result ?? null,
        readiness: readiness.state
      });
      return {
        ...result,
        readiness
      };
    });
  }

  return {
    loadCoverage,
    validateTextDocument,
    handleHover,
    handleCodeLens,
    registerBetaRequests
  };
}
