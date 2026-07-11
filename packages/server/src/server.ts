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
  WorkspaceSession,
  WorkspaceSessionManager,
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
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
const sessionManager = new WorkspaceSessionManager();
let activeSessionKey: string | null = null;
let trustedExecution = false;

function getActiveSession(): WorkspaceSession | null {
  return activeSessionKey ? sessionManager.get(activeSessionKey) : null;
}

function getSessionForRequest(params?: unknown): WorkspaceSession | null {
  if (typeof params === 'object' && params !== null && !Array.isArray(params)) {
    const workspaceUri = (params as Record<string, unknown>).workspaceUri;
    if (workspaceUri !== undefined) {
      return typeof workspaceUri === 'string' ? sessionManager.get(workspaceUri) : null;
    }
  }

  return getActiveSession();
}

const requestState: ServerRequestState = {
  get workspaceRoot() {
    return getActiveSession()?.workspaceRoot ?? null;
  },
  get globalSettings() {
    return globalSettings;
  },
  get coverage() {
    return getActiveSession()?.coverage ?? null;
  },
  get trustedExecution() {
    return getActiveSession()?.trustedExecution ?? false;
  }
};

const coverageController = createCoverageController({
  connection,
  documents,
  getCoverageSettings: () => globalSettings.coverage,
  getWorkspaceRoot: (params) => getSessionForRequest(params)?.workspaceRoot ?? null,
  getCoverage: (params) => getSessionForRequest(params)?.coverage ?? null,
  getCoveragePath: (params) => getSessionForRequest(params)?.coveragePath ?? null,
  getTrustedExecution: (params) => getSessionForRequest(params)?.trustedExecution ?? false,
  getSessionForUri: (uri) => {
    const session = sessionManager.getForUri(uri);
    return session
      ? {
        workspaceRoot: session.workspaceRoot,
        coverage: session.coverage,
        coveragePath: session.coveragePath,
        trustedExecution: session.trustedExecution
      }
      : null;
  },
  setCoverageState: (nextCoverage, nextCoveragePath, workspaceRoot) => {
    const session = workspaceRoot ? sessionManager.get(workspaceRoot) : getActiveSession();
    if (session) {
      session.coverage = nextCoverage;
      session.coveragePath = nextCoveragePath;
    }
  },
  setSessionState: (workspaceRoot, update) => {
    sessionManager.update(workspaceRoot, update);
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
  const workspaceRoots = params.workspaceFolders && params.workspaceFolders.length > 0
    ? params.workspaceFolders.map((folder) => URI.parse(folder.uri).fsPath)
    : params.rootUri
      ? [URI.parse(params.rootUri).fsPath]
      : [];

  sessionManager.clear();
  activeSessionKey = null;
  for (const root of workspaceRoots) {
    const session = sessionManager.getOrCreate(root, trustedExecution);
    if (!activeSessionKey) {
      activeSessionKey = session.key;
    }
  }

  const activeSession = getActiveSession();
  connection.console.info(`Pre-CR Server initializing. Workspace: ${activeSession?.workspaceRoot ?? null}; trusted execution: ${trustedExecution}`);

  for (const session of sessionManager.values()) {
    coverageController.loadCoverage(session.workspaceRoot);
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
    connection.workspace.onDidChangeWorkspaceFolders((event) => {
      for (const folder of event.removed) {
        const removed = sessionManager.get(folder.uri);
        if (removed?.key === activeSessionKey) {
          activeSessionKey = null;
        }
        sessionManager.delete(folder.uri);
      }
      for (const folder of event.added) {
        const session = sessionManager.getOrCreate(folder.uri, trustedExecution);
        if (!activeSessionKey) {
          activeSessionKey = session.key;
        }
      }
      if (!activeSessionKey) {
        activeSessionKey = sessionManager.values()[0]?.key ?? null;
      }
      connection.console.info(`Workspace folder change detected (${sessionManager.values().length} sessions)`);
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
