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
  type FileCoverage,
  type GetCoverageDecorationsResult,
  type GetCoverageSummaryResult,
  type GetProjectHealthResult,
  type RefreshCoverageResult,
  type RunPreCrCheckResult,
  type WorkspaceCoverage,
  LineCoverageStatus,
  lineCoverageToDecoration,
  loadProjectConfig,
  loadWorkspaceCoverage,
  getProjectHealth as buildProjectHealth,
  runWorkspacePreCrCheck
} from '@pre-cr/core';

interface CoverageSettings {
  showDiagnostics: boolean;
  showCodeLens: boolean;
}

interface CoverageControllerContext {
  connection: Connection;
  documents: TextDocuments<TextDocument>;
  getCoverageSettings: () => CoverageSettings;
  getWorkspaceRoot: () => string | null;
  getCoverage: () => WorkspaceCoverage | null;
  getCoveragePath: () => string | null;
  setCoverageState: (coverage: WorkspaceCoverage | null, coveragePath: string | null) => void;
}

export interface CoverageController {
  loadCoverage: () => boolean;
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
    setCoverageState
  } = context;

  function getFileCoverage(uri: string): FileCoverage | undefined {
    const coverage = getCoverage();
    if (!coverage) {
      return undefined;
    }

    const filePath = URI.parse(uri).fsPath;

    let fileCoverage = coverage.files.get(filePath);
    if (fileCoverage) {
      return fileCoverage;
    }

    fileCoverage = coverage.files.get(path.normalize(filePath));
    if (fileCoverage) {
      return fileCoverage;
    }

    const fileName = path.basename(filePath);
    for (const [coveragePath, entry] of coverage.files) {
      if (path.basename(coveragePath) === fileName) {
        return entry;
      }
    }

    return undefined;
  }

  function loadCoverage(): boolean {
    const workspaceRoot = getWorkspaceRoot();
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
      setCoverageState(null, null);
      return false;
    }

    setCoverageState(result.coverage, result.coveragePath);
    connection.console.info(
      `Coverage loaded: ${result.coverage.summary.linePercentage}% lines, ` +
      `${result.coverage.files.size} files`
    );
    connection.sendNotification('$/preCr/coverageChanged', {
      summary: result.coverage.summary
    });
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
      '$/preCr/getCoverageDecorations',
      (params: { textDocument: { uri: string } }): GetCoverageDecorationsResult => {
        const fileCoverage = getFileCoverage(params.textDocument.uri);
        if (!fileCoverage) {
          return { decorations: [] };
        }

        const document = documents.get(params.textDocument.uri);
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

    connection.onRequest('$/preCr/getCoverageSummary', (): GetCoverageSummaryResult => {
      return {
        summary: getCoverage()?.summary ?? null,
        coveragePath: getCoveragePath()
      };
    });

    connection.onRequest('$/preCr/getCoverage', (params: { uri: string }) => {
      const fileCoverage = getFileCoverage(params.uri);
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

    const refreshCoverageRequest = (): RefreshCoverageResult => ({
      success: loadCoverage(),
      coveragePath: getCoveragePath(),
      summary: getCoverage()?.summary ?? null
    });

    connection.onRequest('$/preCr/refreshCoverage', refreshCoverageRequest);
    connection.onRequest('$/preCr/loadCoverage', refreshCoverageRequest);

    connection.onRequest('$/preCr/getProjectHealth', async (): Promise<GetProjectHealthResult> => {
      const workspaceRoot = getWorkspaceRoot();
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

      return {
        health: await buildProjectHealth(workspaceRoot, getCoverage())
      };
    });

    connection.onRequest('$/preCr/runPreCrCheck', async (): Promise<RunPreCrCheckResult> => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        return { result: null, error: 'No workspace root' };
      }

      const result = await runWorkspacePreCrCheck(workspaceRoot);
      if (result.result?.coveragePath) {
        loadCoverage();
      }

      return result;
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
