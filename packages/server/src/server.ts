#!/usr/bin/env node

/**
 * Pre-CR Suite Language Server
 * 
 * LSP server providing coverage visualization across all editors.
 * 
 * Communication: stdio (default), TCP, or WebSocket
 * Protocol: JSON-RPC 2.0 (LSP 3.17)
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Hover,
  MarkupKind,
  CodeLens,
  CodeLensParams,
  DidChangeConfigurationNotification,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import {
  parseLcovFile,
  parseIstanbulFile,
  WorkspaceCoverage,
  FileCoverage,
  LineCoverageStatus,
  CoverageDecoration,
  lineCoverageToDecoration,
  setLogger,
  Logger,
  // Checklist imports
  runChecklist,
  ChecklistResult,
  ChecklistInput,
  ChecklistConfig,
  FileChange,
  FileContent,
  SourceFile,
  DEFAULT_CHECKLIST_CONFIG,
  // Docgen imports
  generateDocs,
  extractItems,
  generateFunctionDoc,
  generateClassDoc,
  generateInterfaceDoc,
  generateTypeDoc,
  generateAIPrompt,
  DocGenConfig,
  DocGenResult,
  GeneratedDoc,
  ExtractedItems,
  DEFAULT_DOC_GEN_CONFIG,
  // Health monitor imports
  checkFileHealth,
  checkWorkspaceHealth,
  checkReadmeHealth,
  FileHealthReport,
  WorkspaceHealthReport,
  HealthMonitorConfig,
  DEFAULT_HEALTH_CONFIG,
  // Review optimization imports (Phase 3)
  estimateReviewTime,
  ReviewTimeEstimate,
  ReviewerInfo,
  FlakyTestDetective,
  FlakyTestReport,
  TestRunResult,
  parseJestResults,
  parseVitestResults,
  // Context preservation imports (Phase 4)
  ContextManager,
  ContextSnapshot,
  ContextSummary,
  ContextConfig,
  // Debug intelligence imports (Phase 5)
  DebugSessionManager,
  DebugSession,
  SessionAnalysis,
  DebugCaptureConfig,
  loadWorkspaceCoverage,
  loadProjectConfig,
  DEFAULT_PRE_CR_CONFIG,
  getProjectHealth as buildProjectHealth,
  runWorkspacePreCrCheck,
  type CoverageFileResult,
  type GetCoverageDecorationsResult,
  type GetCoverageSummaryResult,
  type GetProjectHealthResult,
  type RefreshCoverageResult,
  type RunPreCrCheckResult
} from '@pre-cr/core';

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Connection Setup
// ============================================================================

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ============================================================================
// Server State
// ============================================================================

interface ServerSettings {
  coverage: {
    lcovPath: string;
    istanbulJsonPath: string;
    preferredFormat: 'auto' | 'lcov' | 'istanbul';
    showDiagnostics: boolean;
    showCodeLens: boolean;
  };
  checklist: {
    enabled: boolean;
    prSize: {
      warnThreshold: number;
      errorThreshold: number;
      fileWarnThreshold: number;
    };
    security: {
      enabled: boolean;
    };
    docCoverage: {
      enabled: boolean;
      minCoverage: number;
    };
    testCoverage: {
      enabled: boolean;
      minNewCodeCoverage: number;
    };
  };
}

const defaultSettings: ServerSettings = {
  coverage: {
    lcovPath: 'coverage/lcov.info',
    istanbulJsonPath: 'coverage/coverage-final.json',
    preferredFormat: 'auto',
    showDiagnostics: true,
    showCodeLens: true
  },
  checklist: {
    enabled: true,
    prSize: {
      warnThreshold: 200,
      errorThreshold: 500,
      fileWarnThreshold: 10
    },
    security: {
      enabled: true
    },
    docCoverage: {
      enabled: true,
      minCoverage: 80
    },
    testCoverage: {
      enabled: true,
      minNewCodeCoverage: 80
    }
  }
};

let globalSettings: ServerSettings = defaultSettings;
let workspaceRoot: string | null = null;
let coverage: WorkspaceCoverage | null = null;
let coveragePath: string | null = null;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

// ============================================================================
// LSP Logger Adapter
// ============================================================================

class LSPLogger implements Logger {
  debug(message: string, data?: Record<string, unknown>): void {
    connection.console.log(`[DEBUG] ${message} ${data ? JSON.stringify(data) : ''}`);
  }
  
  info(message: string, data?: Record<string, unknown>): void {
    connection.console.info(`[INFO] ${message} ${data ? JSON.stringify(data) : ''}`);
  }
  
  warn(message: string, data?: Record<string, unknown>): void {
    connection.console.warn(`[WARN] ${message} ${data ? JSON.stringify(data) : ''}`);
  }
  
  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    connection.console.error(`[ERROR] ${message} ${error ? String(error) : ''} ${data ? JSON.stringify(data) : ''}`);
  }
}

// Set up logger
setLogger(new LSPLogger());

// ============================================================================
// Initialization
// ============================================================================

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  
  // Check client capabilities
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  
  // Get workspace root
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceRoot = URI.parse(params.workspaceFolders[0].uri).fsPath;
  } else if (params.rootUri) {
    workspaceRoot = URI.parse(params.rootUri).fsPath;
  }
  
  connection.console.info(`Pre-CR Server initializing. Workspace: ${workspaceRoot}`);
  
  // Load initial coverage
  if (workspaceRoot) {
    loadCoverage();
  }
  
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      codeLensProvider: {
        resolveProvider: false
      },
      // Custom capabilities
      experimental: {
        coverageProvider: true
      }
    }
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for configuration changes
    void connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.info('Workspace folder change detected');
    });
  }
  
  connection.console.info('Pre-CR Server initialized');
});

// ============================================================================
// Configuration
// ============================================================================

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset settings (will be fetched on demand)
  } else {
    globalSettings = (
      (change.settings?.preCr as ServerSettings) || defaultSettings
    );
  }
  
  // Reload coverage with new settings
  loadCoverage();
  
  // Re-validate all open documents
  documents.all().forEach(validateTextDocument);
});

// ============================================================================
// Coverage Loading
// ============================================================================

function loadCoverage(): boolean {
  if (!workspaceRoot) {
    connection.console.warn('No workspace root, cannot load coverage');
    return false;
  }

  const result = loadWorkspaceCoverage(workspaceRoot, loadProjectConfig(workspaceRoot));

  if (result.coverage) {
    coverage = result.coverage;
    coveragePath = result.coveragePath;
    connection.console.info(
      `Coverage loaded: ${coverage.summary.linePercentage}% lines, ` +
      `${coverage.files.size} files`
    );
    
    // Send notification to clients
    connection.sendNotification('$/preCr/coverageChanged', {
      summary: coverage.summary
    });
    
    return true;
  }

  if (result.error) {
    connection.console.error(`Failed to load coverage: ${result.error}`);
  } else {
    connection.console.info('No coverage file found');
  }

  coverage = null;
  coveragePath = null;
  return false;
}

// ============================================================================
// Document Events
// ============================================================================

documents.onDidOpen((event) => {
  validateTextDocument(event.document);
});

documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

documents.onDidSave((_event) => {
  // Could trigger coverage reload here if the saved file is a test file
});

// ============================================================================
// Diagnostics (Uncovered Lines as Warnings)
// ============================================================================

function validateTextDocument(textDocument: TextDocument): void {
  if (!globalSettings.coverage.showDiagnostics) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }
  
  const fileCoverage = getFileCoverage(textDocument.uri);
  if (!fileCoverage) {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
    return;
  }
  
  const diagnostics: Diagnostic[] = [];
  
  for (const [lineNumber, lineCov] of fileCoverage.lines) {
    if (lineCov.status === LineCoverageStatus.Uncovered) {
      const lineIndex = lineNumber - 1;
      const lineText = textDocument.getText({
        start: { line: lineIndex, character: 0 },
        end: { line: lineIndex, character: Number.MAX_SAFE_INTEGER }
      });
      
      // Skip empty lines
      if (!lineText.trim()) continue;
      
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
    } else if (lineCov.status === LineCoverageStatus.Partial) {
      const lineIndex = lineNumber - 1;
      const lineText = textDocument.getText({
        start: { line: lineIndex, character: 0 },
        end: { line: lineIndex, character: Number.MAX_SAFE_INTEGER }
      });
      
      const branches = lineCov.branches || [];
      const taken = branches.filter(b => b.taken > 0).length;
      const total = branches.length;
      
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: {
          start: { line: lineIndex, character: 0 },
          end: { line: lineIndex, character: lineText.length }
        },
        message: `Partial coverage: ${taken}/${total} branches taken`,
        source: 'pre-cr',
        code: 'partial-coverage'
      });
    }
  }
  
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

// ============================================================================
// Hover (Execution Count)
// ============================================================================

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const fileCoverage = getFileCoverage(params.textDocument.uri);
  if (!fileCoverage) {
    return null;
  }
  
  const lineNumber = params.position.line + 1; // Convert to 1-based
  const lineCov = fileCoverage.lines.get(lineNumber);
  
  if (!lineCov) {
    return null;
  }
  
  let content = `**Coverage:** ${lineCov.executionCount} execution${lineCov.executionCount !== 1 ? 's' : ''}\n\n`;
  
  if (lineCov.branches && lineCov.branches.length > 0) {
    const taken = lineCov.branches.filter(b => b.taken > 0).length;
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
});

// ============================================================================
// Code Lens (Coverage % Above Functions)
// ============================================================================

connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
  if (!globalSettings.coverage.showCodeLens) {
    return [];
  }
  
  const fileCoverage = getFileCoverage(params.textDocument.uri);
  if (!fileCoverage) {
    return [];
  }
  
  const codeLenses: CodeLens[] = [];
  
  // Add file-level coverage lens at top
  codeLenses.push({
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 }
    },
    command: {
      title: `Coverage: ${fileCoverage.summary.linePercentage}% lines | ${fileCoverage.summary.branchPercentage}% branches`,
      command: ''
    }
  });
  
  // Add function-level coverage
  for (const fn of fileCoverage.functions) {
    if (fn.lineNumber > 0) {
      const status = fn.executionCount > 0 ? '✅' : '❌';
      codeLenses.push({
        range: {
          start: { line: fn.lineNumber - 1, character: 0 },
          end: { line: fn.lineNumber - 1, character: 0 }
        },
        command: {
          title: `${status} ${fn.executionCount} call${fn.executionCount !== 1 ? 's' : ''}`,
          command: ''
        }
      });
    }
  }
  
  return codeLenses;
});

// ============================================================================
// Custom Methods
// ============================================================================

// Get coverage decorations for a file
connection.onRequest(
  '$/preCr/getCoverageDecorations',
  (params: { textDocument: { uri: string } }): GetCoverageDecorationsResult => {
    const fileCoverage = getFileCoverage(params.textDocument.uri);
    if (!fileCoverage) {
      return { decorations: [] };
    }
    
    const document = documents.get(params.textDocument.uri);
    const decorations: CoverageDecoration[] = [];
    
    for (const [, lineCov] of fileCoverage.lines) {
      if (lineCov.status === LineCoverageStatus.NotExecutable) {
        continue;
      }
      
      // Get line length from document or use default
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

// Get overall coverage summary
connection.onRequest(
  '$/preCr/getCoverageSummary',
  (): GetCoverageSummaryResult => {
    return {
      summary: coverage?.summary ?? null,
      coveragePath
    };
  }
);

// Get coverage data for a specific file
connection.onRequest(
  '$/preCr/getCoverage',
  (params: { uri: string }): CoverageFileResult => {
    const fileCoverage = getFileCoverage(params.uri);
    if (!fileCoverage) {
      return { coverage: null };
    }
    
    // Convert to format expected by client
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
  }
);

// Refresh coverage data
connection.onRequest(
  '$/preCr/refreshCoverage',
  (): RefreshCoverageResult => {
    const success = loadCoverage();
    return {
      success,
      coveragePath,
      summary: coverage?.summary ?? null
    };
  }
);

// Legacy coverage load alias
connection.onRequest(
  '$/preCr/loadCoverage',
  (): RefreshCoverageResult => {
    const success = loadCoverage();
    return {
      success,
      coveragePath,
      summary: coverage?.summary ?? null
    };
  }
);

connection.onRequest(
  '$/preCr/getProjectHealth',
  async (): Promise<GetProjectHealthResult> => {
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
      health: await buildProjectHealth(workspaceRoot, coverage)
    };
  }
);

connection.onRequest(
  '$/preCr/runPreCrCheck',
  async (): Promise<RunPreCrCheckResult> => {
    if (!workspaceRoot) {
      return { result: null, error: 'No workspace root' };
    }

    const result = await runWorkspacePreCrCheck(workspaceRoot);
    if (result.result?.coveragePath && loadCoverage()) {
      connection.sendNotification('$/preCr/coverageChanged', {
        summary: coverage?.summary ?? null
      });
    }

    return result;
  }
);

// Run PR checklist
interface RunChecklistParams {
  /** Files that have changed (from git diff) */
  changes: FileChange[];
  /** Optional: base branch coverage for delta calculation */
  baseCoveragePath?: string;
}

interface RunChecklistResponse {
  result: ChecklistResult | null;
  error?: string;
}

connection.onRequest(
  '$/preCr/runChecklist',
  async (params: RunChecklistParams): Promise<RunChecklistResponse> => {
    if (!workspaceRoot) {
      return { result: null, error: 'No workspace root' };
    }
    
    if (!globalSettings.checklist.enabled) {
      return { result: null, error: 'Checklist is disabled' };
    }
    
    try {
      // Build checklist config from settings
      const config: Partial<ChecklistConfig> = {
        prSize: globalSettings.checklist.prSize,
        docCoverage: {
          ...DEFAULT_CHECKLIST_CONFIG.docCoverage,
          minCoverage: globalSettings.checklist.docCoverage.minCoverage
        },
        testCoverageDelta: {
          ...DEFAULT_CHECKLIST_CONFIG.testCoverageDelta,
          minNewCodeCoverage: globalSettings.checklist.testCoverage.minNewCodeCoverage
        }
      };
      
      // Gather file contents for security scanning
      const files: FileContent[] = [];
      const sourceFiles: SourceFile[] = [];
      
      for (const change of params.changes) {
        if (change.isDeleted) continue;
        
        const filePath = path.join(workspaceRoot, change.path);
        
        try {
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            files.push({ path: change.path, content });
            sourceFiles.push({ 
              path: change.path, 
              content, 
              isNew: change.isNew 
            });
          }
        } catch (err) {
          // Skip files that can't be read
          connection.console.warn(`Could not read file: ${filePath}`);
        }
      }
      
      // Load base coverage if provided
      let baseCoverage: WorkspaceCoverage | undefined;
      if (params.baseCoveragePath) {
        const basePath = path.join(workspaceRoot, params.baseCoveragePath);
        if (fs.existsSync(basePath)) {
          const result = basePath.endsWith('.json')
            ? parseIstanbulFile(basePath, workspaceRoot)
            : parseLcovFile(basePath, workspaceRoot);
          if (result.success && result.data) {
            baseCoverage = result.data;
          }
        }
      }
      
      // Build input
      const input: ChecklistInput = {
        changes: params.changes,
        files,
        sourceFiles,
        headCoverage: coverage ?? undefined,
        baseCoverage
      };
      
      // Run checklist
      const result = runChecklist(input, config);
      
      return { result };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      connection.console.error(`Checklist error: ${errorMessage}`);
      return { result: null, error: errorMessage };
    }
  }
);

// Quick security scan (without full checklist)
connection.onRequest(
  '$/preCr/quickSecurityScan',
  async (params: { files: Array<{ path: string; content: string }> }): Promise<{
    hasIssues: boolean;
    findings: Array<{
      file: string;
      line: number;
      message: string;
      severity: string;
    }>;
  }> => {
    const { scanSecurity } = await import('@pre-cr/core');
    const result = scanSecurity(params.files);
    
    return {
      hasIssues: result.findings.length > 0,
      findings: result.findings.map(f => ({
        file: f.file,
        line: f.line,
        message: f.message,
        severity: f.severity
      }))
    };
  }
);

// Get documentation coverage for current files
connection.onRequest(
  '$/preCr/getDocCoverage',
  async (params: { files: Array<{ path: string; content: string }> }): Promise<{
    coverage: number;
    undocumented: Array<{ name: string; file: string; line: number; kind: string }>;
  }> => {
    const { analyzeDocCoverage } = await import('@pre-cr/core');
    const sourceFiles: SourceFile[] = params.files.map(f => ({
      path: f.path,
      content: f.content
    }));
    
    const result = analyzeDocCoverage(sourceFiles);
    
    return {
      coverage: result.coveragePercent,
      undocumented: result.undocumented.map(u => ({
        name: u.name,
        file: u.file,
        line: u.line,
        kind: u.kind
      }))
    };
  }
);

// ============================================================================
// Documentation Generator Methods
// ============================================================================

// Generate documentation for a file
interface GenerateDocsParams {
  /** URI of the file to generate docs for */
  textDocument: { uri: string };
  /** Optional configuration */
  config?: Partial<DocGenConfig>;
}

connection.onRequest(
  '$/preCr/generateDocs',
  async (params: GenerateDocsParams): Promise<{
    result: DocGenResult | null;
    error?: string;
  }> => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return { result: null, error: 'Document not found' };
      }
      
      const content = document.getText();
      const config = params.config || DEFAULT_DOC_GEN_CONFIG;
      
      const result = generateDocs(content, config);
      
      return { result };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { result: null, error: errorMessage };
    }
  }
);

// Generate documentation for a specific function/class at cursor
interface GenerateDocAtCursorParams {
  textDocument: { uri: string };
  position: { line: number; character: number };
  config?: Partial<DocGenConfig>;
}

connection.onRequest(
  '$/preCr/generateDocAtCursor',
  async (params: GenerateDocAtCursorParams): Promise<{
    doc: GeneratedDoc | null;
    error?: string;
  }> => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return { doc: null, error: 'Document not found' };
      }
      
      const content = document.getText();
      const items = extractItems(content);
      const targetLine = params.position.line + 1; // Convert 0-based to 1-based
      
      // Find the item at or after cursor position
      const allItems = [
        ...items.functions.map(f => ({ type: 'function' as const, item: f, line: f.line })),
        ...items.classes.map(c => ({ type: 'class' as const, item: c, line: c.line })),
        ...items.interfaces.map(i => ({ type: 'interface' as const, item: i, line: i.line })),
        ...items.types.map(t => ({ type: 'type' as const, item: t, line: t.line }))
      ].sort((a, b) => a.line - b.line);
      
      // Find nearest item at or after cursor
      const nearest = allItems.find(item => item.line >= targetLine);
      
      if (!nearest) {
        return { doc: null, error: 'No documentable item found at cursor' };
      }
      
      const config: DocGenConfig = { ...DEFAULT_DOC_GEN_CONFIG, ...params.config };
      let doc: GeneratedDoc;
      
      switch (nearest.type) {
        case 'function':
          doc = generateFunctionDoc(nearest.item, config);
          break;
        case 'class':
          doc = generateClassDoc(nearest.item, config);
          break;
        case 'interface':
          doc = generateInterfaceDoc(nearest.item, config);
          break;
        case 'type':
          doc = generateTypeDoc(nearest.item, config);
          break;
      }
      
      return { doc };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { doc: null, error: errorMessage };
    }
  }
);

// Get AI prompt for documentation generation
interface GetAIPromptParams {
  textDocument: { uri: string };
  position: { line: number; character: number };
}

connection.onRequest(
  '$/preCr/getAIDocPrompt',
  async (params: GetAIPromptParams): Promise<{
    prompt: { system: string; user: string } | null;
    error?: string;
  }> => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return { prompt: null, error: 'Document not found' };
      }
      
      const content = document.getText();
      const items = extractItems(content);
      const targetLine = params.position.line + 1;
      
      // Find function at cursor
      const fn = items.functions.find(f => 
        f.line === targetLine || f.line === targetLine + 1
      );
      
      if (!fn) {
        return { prompt: null, error: 'No function found at cursor' };
      }
      
      const prompt = generateAIPrompt(fn);
      
      return { 
        prompt: {
          system: prompt.system,
          user: prompt.user
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { prompt: null, error: errorMessage };
    }
  }
);

// Extract documentable items from a file
connection.onRequest(
  '$/preCr/extractItems',
  async (params: { textDocument: { uri: string } }): Promise<{
    items: ExtractedItems | null;
    error?: string;
  }> => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return { items: null, error: 'Document not found' };
      }
      
      const content = document.getText();
      const items = extractItems(content);
      
      return { items };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { items: null, error: errorMessage };
    }
  }
);

// ============================================================================
// Documentation Health Monitor Methods
// ============================================================================

// Check documentation health for a single file
connection.onRequest(
  '$/preCr/checkFileHealth',
  async (params: { 
    textDocument: { uri: string };
    config?: Partial<HealthMonitorConfig>;
  }): Promise<{
    report: FileHealthReport | null;
    error?: string;
  }> => {
    try {
      const document = documents.get(params.textDocument.uri);
      if (!document) {
        return { report: null, error: 'Document not found' };
      }
      
      const filePath = URI.parse(params.textDocument.uri).fsPath;
      const content = document.getText();
      
      const config = { ...DEFAULT_HEALTH_CONFIG, ...params.config };
      const report = checkFileHealth({ path: filePath, content }, config);
      
      return { report };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { report: null, error: errorMessage };
    }
  }
);

// Check documentation health for workspace
interface CheckWorkspaceHealthParams {
  /** File URIs to check */
  files: Array<{ uri: string }>;
  config?: Partial<HealthMonitorConfig>;
}

connection.onRequest(
  '$/preCr/checkWorkspaceHealth',
  async (params: CheckWorkspaceHealthParams): Promise<{
    report: WorkspaceHealthReport | null;
    error?: string;
  }> => {
    try {
      const sourceFiles: SourceFile[] = [];
      
      for (const fileRef of params.files) {
        const document = documents.get(fileRef.uri);
        if (document) {
          const filePath = URI.parse(fileRef.uri).fsPath;
          sourceFiles.push({
            path: filePath,
            content: document.getText()
          });
        }
      }
      
      if (sourceFiles.length === 0) {
        return { report: null, error: 'No files found' };
      }
      
      const config = { ...DEFAULT_HEALTH_CONFIG, ...params.config };
      const report = checkWorkspaceHealth(sourceFiles, config);
      
      return { report };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { report: null, error: errorMessage };
    }
  }
);

// Check README health
interface CheckReadmeHealthParams {
  /** README file URI */
  readmeUri: string;
  /** List of existing file paths */
  existingFiles: string[];
  /** Package.json content if available */
  packageJson?: {
    scripts?: Record<string, string>;
    version?: string;
  };
}

connection.onRequest(
  '$/preCr/checkReadmeHealth',
  async (params: CheckReadmeHealthParams): Promise<{
    issues: Array<{
      type: string;
      line: number;
      message: string;
      suggestion?: string;
    }>;
    error?: string;
  }> => {
    try {
      const document = documents.get(params.readmeUri);
      if (!document) {
        return { issues: [], error: 'README not found' };
      }
      
      const content = document.getText();
      const existingFiles = new Set(params.existingFiles);
      
      const issues = checkReadmeHealth(content, existingFiles, params.packageJson);
      
      return {
        issues: issues.map(i => ({
          type: i.type,
          line: i.line,
          message: i.message,
          suggestion: i.suggestion
        }))
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { issues: [], error: errorMessage };
    }
  }
);

// ============================================================================
// Review Optimization Methods (Phase 3)
// ============================================================================

// Flaky test detective instance (per workspace)
let flakyDetective: FlakyTestDetective | null = null;

// Estimate review time for a PR
interface EstimateReviewTimeParams {
  /** Changed files */
  changes: FileChange[];
  /** Optional: known reviewers for suggestions */
  reviewers?: ReviewerInfo[];
}

connection.onRequest(
  '$/preCr/estimateReviewTime',
  async (params: EstimateReviewTimeParams): Promise<{
    estimate: ReviewTimeEstimate | null;
    error?: string;
  }> => {
    try {
      // Optionally load file contents for complexity analysis
      const fileContents = new Map<string, string>();
      
      if (workspaceRoot) {
        for (const change of params.changes) {
          if (change.isDeleted) continue;
          
          const filePath = path.join(workspaceRoot, change.path);
          try {
            if (fs.existsSync(filePath)) {
              fileContents.set(change.path, fs.readFileSync(filePath, 'utf-8'));
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
      
      const estimate = estimateReviewTime(
        params.changes,
        fileContents.size > 0 ? fileContents : undefined,
        params.reviewers
      );
      
      return { estimate };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { estimate: null, error: errorMessage };
    }
  }
);

// Initialize flaky test detective
connection.onRequest(
  '$/preCr/initFlakyDetective',
  async (params: { config?: { minRuns?: number; flakinessThreshold?: number } }): Promise<{
    success: boolean;
  }> => {
    flakyDetective = new FlakyTestDetective(params.config);
    return { success: true };
  }
);

// Record test results for flaky detection
connection.onRequest(
  '$/preCr/recordTestResults',
  async (params: { 
    results: TestRunResult[];
    format?: 'raw' | 'jest' | 'vitest';
    rawOutput?: unknown;
  }): Promise<{
    recorded: number;
    error?: string;
  }> => {
    try {
      if (!flakyDetective) {
        flakyDetective = new FlakyTestDetective();
      }
      
      let results: TestRunResult[] = params.results;
      
      // Parse from test runner output if provided
      if (params.format === 'jest' && params.rawOutput) {
        results = parseJestResults(params.rawOutput as Parameters<typeof parseJestResults>[0]);
      } else if (params.format === 'vitest' && params.rawOutput) {
        results = parseVitestResults(params.rawOutput as Parameters<typeof parseVitestResults>[0]);
      }
      
      flakyDetective.recordResults(results);
      
      return { recorded: results.length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { recorded: 0, error: errorMessage };
    }
  }
);

// Get flaky test report
connection.onRequest(
  '$/preCr/getFlakyTestReport',
  async (): Promise<{
    report: FlakyTestReport | null;
    error?: string;
  }> => {
    try {
      if (!flakyDetective) {
        return { report: null, error: 'Flaky detective not initialized' };
      }
      
      const report = flakyDetective.generateReport();
      return { report };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { report: null, error: errorMessage };
    }
  }
);

// Get flaky tests list
connection.onRequest(
  '$/preCr/getFlakyTests',
  async (): Promise<{
    tests: Array<{
      testId: string;
      file: string;
      name: string;
      flakinessScore: number;
      totalRuns: number;
      failures: number;
    }>;
    error?: string;
  }> => {
    try {
      if (!flakyDetective) {
        return { tests: [], error: 'Flaky detective not initialized' };
      }
      
      const flakyTests = flakyDetective.getFlakyTests();
      
      return {
        tests: flakyTests.map(t => ({
          testId: t.testId,
          file: t.file,
          name: t.name,
          flakinessScore: t.flakinessScore,
          totalRuns: t.totalRuns,
          failures: t.failures
        }))
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { tests: [], error: errorMessage };
    }
  }
);

// Quarantine a flaky test
connection.onRequest(
  '$/preCr/quarantineTest',
  async (params: { testId: string }): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      if (!flakyDetective) {
        return { success: false, error: 'Flaky detective not initialized' };
      }
      
      flakyDetective.quarantine(params.testId);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMessage };
    }
  }
);

// Export flaky test history (for persistence)
connection.onRequest(
  '$/preCr/exportFlakyHistory',
  async (): Promise<{
    history: unknown[];
    error?: string;
  }> => {
    try {
      if (!flakyDetective) {
        return { history: [], error: 'Flaky detective not initialized' };
      }
      
      return { history: flakyDetective.exportHistory() };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { history: [], error: errorMessage };
    }
  }
);

// Import flaky test history
connection.onRequest(
  '$/preCr/importFlakyHistory',
  async (params: { history: unknown[] }): Promise<{
    imported: number;
    error?: string;
  }> => {
    try {
      if (!flakyDetective) {
        flakyDetective = new FlakyTestDetective();
      }
      
      flakyDetective.importHistory(params.history as Parameters<typeof flakyDetective.importHistory>[0]);
      return { imported: params.history.length };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { imported: 0, error: errorMessage };
    }
  }
);

// ============================================================================
// Context Preservation Methods (Phase 4)
// ============================================================================

// Context manager instance (per workspace)
let contextManager: ContextManager | null = null;

// Initialize context manager
connection.onRequest(
  '$/preCr/initContextManager',
  async (params: { config?: Partial<ContextConfig> }): Promise<{
    success: boolean;
  }> => {
    contextManager = new ContextManager(params.config);
    return { success: true };
  }
);

// Capture current context
connection.onRequest(
  '$/preCr/captureContext',
  async (params: {
    branch: string;
    description?: string;
    files: Array<{
      path: string;
      cursor: { line: number; character: number };
      scrollTop: number;
      isDirty: boolean;
      isActive: boolean;
    }>;
    breakpoints?: Array<{
      path: string;
      line: number;
      condition?: string;
      enabled: boolean;
    }>;
    terminals?: Array<{
      name: string;
      cwd?: string;
      history: string[];
      isActive: boolean;
    }>;
    git: {
      branch: string;
      modifiedFiles: string[];
      stagedFiles: string[];
      headCommit: string;
    };
  }): Promise<{
    snapshot: { id: string; branch: string; timestamp: string } | null;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        contextManager = new ContextManager();
      }
      
      const snapshot = contextManager.captureContext({
        branch: params.branch,
        description: params.description,
        files: params.files,
        breakpoints: params.breakpoints || [],
        terminals: params.terminals || [],
        searches: [],
        git: {
          ...params.git,
          untrackedFiles: [],
          hasConflicts: false
        },
        layout: {
          groups: [],
          panels: { terminal: false, output: false, problems: false, debugConsole: false },
          sidebar: { visible: true }
        }
      });
      
      return {
        snapshot: {
          id: snapshot.id,
          branch: snapshot.branch,
          timestamp: snapshot.timestamp.toISOString()
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { snapshot: null, error: errorMessage };
    }
  }
);

// Get latest snapshot for branch
connection.onRequest(
  '$/preCr/getLatestSnapshot',
  async (params: { branch: string }): Promise<{
    snapshot: ContextSnapshot | null;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        return { snapshot: null, error: 'Context manager not initialized' };
      }
      
      const snapshot = contextManager.getLatestSnapshot(params.branch);
      return { snapshot: snapshot || null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { snapshot: null, error: errorMessage };
    }
  }
);

// Handle branch switch
connection.onRequest(
  '$/preCr/onBranchSwitch',
  async (params: {
    fromBranch: string;
    toBranch: string;
    currentContext: {
      files: Array<{
        path: string;
        cursor: { line: number; character: number };
        scrollTop: number;
        isDirty: boolean;
        isActive: boolean;
      }>;
      git: {
        modifiedFiles: string[];
        stagedFiles: string[];
        headCommit: string;
      };
    };
  }): Promise<{
    captured?: { id: string; branch: string };
    toRestore?: ContextSnapshot;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        contextManager = new ContextManager();
      }
      
      const result = contextManager.onBranchSwitch(
        params.fromBranch,
        params.toBranch,
        {
          files: params.currentContext.files,
          breakpoints: [],
          terminals: [],
          searches: [],
          git: {
            branch: params.fromBranch,
            ...params.currentContext.git,
            untrackedFiles: [],
            hasConflicts: false
          },
          layout: {
            groups: [],
            panels: { terminal: false, output: false, problems: false, debugConsole: false },
            sidebar: { visible: true }
          }
        }
      );
      
      return {
        captured: result.captured ? {
          id: result.captured.id,
          branch: result.captured.branch
        } : undefined,
        toRestore: result.toRestore
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { error: errorMessage };
    }
  }
);

// Get "Where was I?" summary
connection.onRequest(
  '$/preCr/getContextSummary',
  async (params: { branch: string }): Promise<{
    summary: ContextSummary | null;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        return { summary: null, error: 'Context manager not initialized' };
      }
      
      const snapshot = contextManager.getLatestSnapshot(params.branch);
      if (!snapshot) {
        return { summary: null, error: 'No snapshot found for branch' };
      }
      
      const summary = contextManager.generateSummary(snapshot);
      return { summary };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { summary: null, error: errorMessage };
    }
  }
);

// List all snapshots for a branch
connection.onRequest(
  '$/preCr/listSnapshots',
  async (params: { branch?: string }): Promise<{
    snapshots: Array<{
      id: string;
      branch: string;
      timestamp: string;
      description?: string;
      filesCount: number;
    }>;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        return { snapshots: [], error: 'Context manager not initialized' };
      }
      
      let allSnapshots: ContextSnapshot[] = [];
      
      if (params.branch) {
        allSnapshots = contextManager.getSnapshots(params.branch);
      } else {
        allSnapshots = contextManager.exportSnapshots();
      }
      
      return {
        snapshots: allSnapshots.map(s => ({
          id: s.id,
          branch: s.branch,
          timestamp: s.timestamp.toISOString(),
          description: s.description,
          filesCount: s.files.length
        }))
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { snapshots: [], error: errorMessage };
    }
  }
);

// Delete a snapshot
connection.onRequest(
  '$/preCr/deleteSnapshot',
  async (params: { id: string }): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        return { success: false, error: 'Context manager not initialized' };
      }
      
      const deleted = contextManager.deleteSnapshot(params.id);
      return { success: deleted };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMessage };
    }
  }
);

// Export context snapshots
connection.onRequest(
  '$/preCr/exportContextSnapshots',
  async (): Promise<{
    snapshots: ContextSnapshot[];
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        return { snapshots: [], error: 'Context manager not initialized' };
      }
      
      return { snapshots: contextManager.exportSnapshots() };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { snapshots: [], error: errorMessage };
    }
  }
);

// Import context snapshots
connection.onRequest(
  '$/preCr/importContextSnapshots',
  async (params: { snapshots: ContextSnapshot[] }): Promise<{
    imported: number;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        contextManager = new ContextManager();
      }
      
      const imported = contextManager.importSnapshots(params.snapshots);
      return { imported };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { imported: 0, error: errorMessage };
    }
  }
);

// Get context manager stats
connection.onRequest(
  '$/preCr/getContextStats',
  async (): Promise<{
    stats: {
      totalSnapshots: number;
      branchCount: number;
      branches: string[];
    } | null;
    error?: string;
  }> => {
    try {
      if (!contextManager) {
        return { stats: null, error: 'Context manager not initialized' };
      }
      
      const stats = contextManager.getStats();
      const branches = contextManager.getBranches();
      
      return {
        stats: {
          totalSnapshots: stats.totalSnapshots,
          branchCount: stats.branchCount,
          branches
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { stats: null, error: errorMessage };
    }
  }
);

// ============================================================================
// Debug Intelligence Methods (Phase 5)
// ============================================================================

// Debug session manager instance
let debugManager: DebugSessionManager | null = null;

// Initialize debug manager
connection.onRequest(
  '$/preCr/initDebugManager',
  async (params: { config?: Partial<DebugCaptureConfig> }): Promise<{
    success: boolean;
  }> => {
    debugManager = new DebugSessionManager(params.config);
    return { success: true };
  }
);

// Start a debug session
connection.onRequest(
  '$/preCr/startDebugSession',
  async (params: {
    name: string;
    debugType: string;
    launchConfig?: Record<string, unknown>;
  }): Promise<{
    session: { id: string; name: string; startTime: string } | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        debugManager = new DebugSessionManager();
      }
      
      const session = debugManager.startSession(
        params.name,
        params.debugType,
        params.launchConfig
      );
      
      return {
        session: {
          id: session.id,
          name: session.name,
          startTime: session.startTime.toISOString()
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { session: null, error: errorMessage };
    }
  }
);

// End debug session
connection.onRequest(
  '$/preCr/endDebugSession',
  async (params: { outcome?: 'success' | 'error' | 'terminated' }): Promise<{
    session: { id: string; duration: number } | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { session: null, error: 'Debug manager not initialized' };
      }
      
      const session = debugManager.endSession(params.outcome);
      if (!session) {
        return { session: null, error: 'No active session' };
      }
      
      const duration = (session.endTime?.getTime() || Date.now()) - session.startTime.getTime();
      
      return {
        session: {
          id: session.id,
          duration
        }
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { session: null, error: errorMessage };
    }
  }
);

// Record breakpoint hit
connection.onRequest(
  '$/preCr/recordBreakpointHit',
  async (params: {
    location: { file: string; line: number; column?: number };
    hitCount: number;
    condition?: string;
    stackTrace: Array<{
      id: number;
      name: string;
      file: string;
      line: number;
      isUserCode: boolean;
    }>;
    scopes: Array<{
      name: string;
      variables: Array<{
        name: string;
        value: string;
        type: string;
        isPrimitive: boolean;
      }>;
    }>;
  }): Promise<{
    hitId: string | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { hitId: null, error: 'Debug manager not initialized' };
      }
      
      const hit = debugManager.recordBreakpointHit(params);
      return { hitId: hit?.id || null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { hitId: null, error: errorMessage };
    }
  }
);

// Record exception
connection.onRequest(
  '$/preCr/recordException',
  async (params: {
    type: string;
    message: string;
    stackTrace: Array<{
      id: number;
      name: string;
      file: string;
      line: number;
      isUserCode: boolean;
    }>;
  }): Promise<{
    recorded: boolean;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { recorded: false, error: 'Debug manager not initialized' };
      }
      
      debugManager.recordException(params);
      return { recorded: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { recorded: false, error: errorMessage };
    }
  }
);

// Record step
connection.onRequest(
  '$/preCr/recordDebugStep',
  async (params: {
    type: 'step-over' | 'step-into' | 'step-out' | 'continue';
    location: { file: string; line: number };
  }): Promise<{
    recorded: boolean;
  }> => {
    if (!debugManager) {
      return { recorded: false };
    }
    
    debugManager.recordStep(params.type, params.location);
    return { recorded: true };
  }
);

// Analyze session
connection.onRequest(
  '$/preCr/analyzeDebugSession',
  async (params: { sessionId: string }): Promise<{
    analysis: SessionAnalysis | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { analysis: null, error: 'Debug manager not initialized' };
      }
      
      const analysis = debugManager.analyzeSession(params.sessionId);
      return { analysis };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { analysis: null, error: errorMessage };
    }
  }
);

// Create reproducible scenario
connection.onRequest(
  '$/preCr/createDebugScenario',
  async (params: { sessionId: string }): Promise<{
    scenario: {
      breakpoints: Array<{ file: string; line: number; condition?: string }>;
      watchExpressions: string[];
      description: string;
    } | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { scenario: null, error: 'Debug manager not initialized' };
      }
      
      const scenario = debugManager.createScenario(params.sessionId);
      return { scenario };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { scenario: null, error: errorMessage };
    }
  }
);

// List debug sessions
connection.onRequest(
  '$/preCr/listDebugSessions',
  async (): Promise<{
    sessions: Array<{
      id: string;
      name: string;
      debugType: string;
      startTime: string;
      endTime?: string;
      outcome?: string;
      breakpointHits: number;
      exceptions: number;
    }>;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { sessions: [], error: 'Debug manager not initialized' };
      }
      
      const sessions = debugManager.getAllSessions();
      
      return {
        sessions: sessions.map(s => ({
          id: s.id,
          name: s.name,
          debugType: s.debugType,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime?.toISOString(),
          outcome: s.outcome,
          breakpointHits: s.breakpointHits.length,
          exceptions: s.exceptions.length
        }))
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { sessions: [], error: errorMessage };
    }
  }
);

// Get session details
connection.onRequest(
  '$/preCr/getDebugSession',
  async (params: { sessionId: string }): Promise<{
    session: DebugSession | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { session: null, error: 'Debug manager not initialized' };
      }
      
      const session = debugManager.getSession(params.sessionId);
      return { session: session || null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { session: null, error: errorMessage };
    }
  }
);

// Delete session
connection.onRequest(
  '$/preCr/deleteDebugSession',
  async (params: { sessionId: string }): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { success: false, error: 'Debug manager not initialized' };
      }
      
      const deleted = debugManager.deleteSession(params.sessionId);
      return { success: deleted };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMessage };
    }
  }
);

// Export session
connection.onRequest(
  '$/preCr/exportDebugSession',
  async (params: { sessionId: string }): Promise<{
    data: object | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        return { data: null, error: 'Debug manager not initialized' };
      }
      
      const data = debugManager.exportSession(params.sessionId);
      return { data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { data: null, error: errorMessage };
    }
  }
);

// Import session
connection.onRequest(
  '$/preCr/importDebugSession',
  async (params: { data: object }): Promise<{
    sessionId: string | null;
    error?: string;
  }> => {
    try {
      if (!debugManager) {
        debugManager = new DebugSessionManager();
      }
      
      const sessionId = debugManager.importSession(params.data);
      return { sessionId };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { sessionId: null, error: errorMessage };
    }
  }
);

// ============================================================================
// Helpers
// ============================================================================

function getFileCoverage(uri: string): FileCoverage | undefined {
  if (!coverage) {
    return undefined;
  }
  
  const filePath = URI.parse(uri).fsPath;
  
  // Try exact match
  let fileCov = coverage.files.get(filePath);
  if (fileCov) {
    return fileCov;
  }
  
  // Try normalized path
  const normalized = path.normalize(filePath);
  fileCov = coverage.files.get(normalized);
  if (fileCov) {
    return fileCov;
  }
  
  // Try matching by filename
  const fileName = path.basename(filePath);
  for (const [coveragePath, cov] of coverage.files) {
    if (path.basename(coveragePath) === fileName) {
      return cov;
    }
  }
  
  return undefined;
}

// ============================================================================
// Start Server
// ============================================================================

documents.listen(connection);
connection.listen();

connection.console.info('Pre-CR Language Server started');
