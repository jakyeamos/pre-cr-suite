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
  DidChangeConfigurationNotification,
  type Hover,
  type CodeLens,
  type CodeLensParams,
  type TextDocumentPositionParams
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import {
  setLogger,
  Logger,
  WorkspaceCoverage,
} from '@pre-cr/core';

import { createCoverageController } from './beta/coverageController';
import { registerChecklistRequests } from './requests/checklistRequests';
import { registerContextRequests } from './requests/contextRequests';
import { registerDebugRequests } from './requests/debugRequests';
import { registerDocgenRequests } from './requests/docgenRequests';
import { registerReviewRequests } from './requests/reviewRequests';
import { defaultSettings, ServerRequestState, ServerSettings } from './serverSettings';

// ============================================================================
// Connection Setup
// ============================================================================

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ============================================================================
// Server State
// ============================================================================

let globalSettings: ServerSettings = defaultSettings;
let workspaceRoot: string | null = null;
let coverage: WorkspaceCoverage | null = null;
let coveragePath: string | null = null;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let trustedExecution = false;

const requestState: ServerRequestState = {
  get workspaceRoot() {
    return workspaceRoot;
  },
  get globalSettings() {
    return globalSettings;
  },
  get coverage() {
    return coverage;
  },
  get trustedExecution() {
    return trustedExecution;
  }
};

const coverageController = createCoverageController({
  connection,
  documents,
  getCoverageSettings: () => globalSettings.coverage,
  getWorkspaceRoot: () => workspaceRoot,
  getCoverage: () => coverage,
  getCoveragePath: () => coveragePath,
  getTrustedExecution: () => trustedExecution,
  setCoverageState: (nextCoverage, nextCoveragePath) => {
    coverage = nextCoverage;
    coveragePath = nextCoveragePath;
  }
});

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

setLogger(new LSPLogger());

// ============================================================================
// Initialization
// ============================================================================

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;

  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  trustedExecution = hasTrustedExecution(params.initializationOptions);

  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    workspaceRoot = URI.parse(params.workspaceFolders[0].uri).fsPath;
  } else if (params.rootUri) {
    workspaceRoot = URI.parse(params.rootUri).fsPath;
  }

  connection.console.info(`Pre-CR Server initializing. Workspace: ${workspaceRoot}; trusted execution: ${trustedExecution}`);

  if (workspaceRoot) {
    coverageController.loadCoverage();
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      codeLensProvider: {
        resolveProvider: false
      },
      experimental: {
        coverageProvider: true
      }
    }
  };
});

function hasTrustedExecution(initializationOptions: unknown): boolean {
  if (typeof initializationOptions !== 'object' || initializationOptions === null) {
    return false;
  }

  return (initializationOptions as Record<string, unknown>).trustedExecution === true;
}

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
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

  coverageController.loadCoverage();

  documents.all().forEach((document) => {
    coverageController.validateTextDocument(document);
  });
});

// ============================================================================
// Document Events
// ============================================================================

documents.onDidOpen((event) => {
  coverageController.validateTextDocument(event.document);
});

documents.onDidChangeContent((change) => {
  coverageController.validateTextDocument(change.document);
});

documents.onDidSave((_event) => {
  // Could trigger coverage reload here if the saved file is a test file
});

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  return coverageController.handleHover(params);
});

connection.onCodeLens((params: CodeLensParams): CodeLens[] => {
  return coverageController.handleCodeLens(params);
});

// ============================================================================
// Custom Methods
// ============================================================================

coverageController.registerBetaRequests();
registerChecklistRequests(connection, requestState);
registerDocgenRequests(connection, documents);
registerReviewRequests(connection, requestState);
registerContextRequests(connection);
registerDebugRequests(connection);

// ============================================================================
// Start Server
// ============================================================================

documents.listen(connection);
connection.listen();

connection.console.info('Pre-CR Language Server started');
