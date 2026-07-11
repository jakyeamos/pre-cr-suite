/**
 * LSP Server Integration Tests
 *
 * Tests that the core modules can be imported and basic functionality works.
 */

import { describe, it, expect, vi } from 'vitest';

const serverHarness = vi.hoisted(() => {
  type InitializeHandler = (params: unknown) => unknown;
  type CoverageControllerContext = {
    getTrustedExecution: () => boolean;
  };

  let initializeHandler: InitializeHandler | undefined;
  let coverageControllerContext: CoverageControllerContext | undefined;

  return {
    reset(): void {
      initializeHandler = undefined;
      coverageControllerContext = undefined;
    },
    recordInitializeHandler(handler: InitializeHandler): void {
      initializeHandler = handler;
    },
    recordCoverageControllerContext(context: CoverageControllerContext): void {
      coverageControllerContext = context;
    },
    initialize(params: unknown): void {
      if (!initializeHandler) {
        throw new Error('Expected the server to register an initialize handler.');
      }

      initializeHandler(params);
    },
    getTrustedExecution(): boolean {
      if (!coverageControllerContext) {
        throw new Error('Expected the server to create a coverage controller.');
      }

      return coverageControllerContext.getTrustedExecution();
    }
  };
});

vi.mock('vscode-languageserver/node', () => {
  class MockTextDocuments {
    constructor(_textDocument: unknown) {}

    listen = vi.fn();
    all = () => [];
    onDidOpen = vi.fn();
    onDidChangeContent = vi.fn();
    onDidSave = vi.fn();
  }

  return {
    createConnection: () => ({
      console: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
        warn: vi.fn()
      },
      client: {
        register: vi.fn()
      },
      workspace: {
        onDidChangeWorkspaceFolders: vi.fn()
      },
      onCodeLens: vi.fn(),
      onDidChangeConfiguration: vi.fn(),
      onHover: vi.fn(),
      onInitialize: (handler: (params: unknown) => unknown) => {
        serverHarness.recordInitializeHandler(handler);
      },
      onInitialized: vi.fn(),
      onRequest: vi.fn(),
      sendDiagnostics: vi.fn(),
      sendNotification: vi.fn(),
      listen: vi.fn()
    }),
    ProposedFeatures: {
      all: {}
    },
    TextDocumentSyncKind: {
      Incremental: 2
    },
    TextDocuments: MockTextDocuments
  };
});

vi.mock('../beta/coverageController', () => ({
  createCoverageController: vi.fn((context: { getTrustedExecution: () => boolean }) => {
    serverHarness.recordCoverageControllerContext(context);
    return {
      loadCoverage: vi.fn(),
      validateTextDocument: vi.fn(),
      handleHover: vi.fn(() => null),
      handleCodeLens: vi.fn(() => []),
      registerBetaRequests: vi.fn()
    };
  })
}));
import {
  scanSecurity,
  analyzePRSize,
  FlakyTestDetective,
  ContextManager,
  DebugSessionManager,
} from '@pre-cr/core/experimental';

import {
  parseLcovContent,
  parseIstanbulContent,
} from '@pre-cr/core';

describe('Core Module Integration', () => {
  describe('Security Scanner', () => {
    it('should scan code and return findings structure', () => {
      const result = scanSecurity([{
        path: 'test.js',
        content: `eval(userInput);`
      }]);

      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('scannedFiles');
      expect(Array.isArray(result.findings)).toBe(true);
    });
  });

  describe('PR Size Analyzer', () => {
    it('should analyze PR size', () => {
      const result = analyzePRSize([
        { path: 'src/a.ts', additions: 100, deletions: 50, isNew: false, isDeleted: false, isRenamed: false },
        { path: 'src/b.ts', additions: 200, deletions: 0, isNew: true, isDeleted: false, isRenamed: false },
      ]);

      expect(result.linesChanged).toBe(350);
      expect(result.filesChanged).toBe(2);
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('Flaky Test Detective', () => {
    it('should track test results', () => {
      const detective = new FlakyTestDetective();

      detective.recordResult({
        testId: 'test-1',
        name: 'should work',
        file: 'test.spec.ts',
        passed: true,
        duration: 100,
        timestamp: new Date()
      });

      const flakyTests = detective.getFlakyTests();
      expect(Array.isArray(flakyTests)).toBe(true);
    });
  });

  describe('Context Manager', () => {
    it('should be instantiable', () => {
      const manager = new ContextManager();
      expect(manager).toBeDefined();
    });
  });

  describe('Debug Session Manager', () => {
    it('should manage debug sessions', () => {
      const manager = new DebugSessionManager();

      manager.startSession('Debug Test', 'node');

      const activeSession = manager.getActiveSession();
      expect(activeSession).toBeDefined();

      manager.endSession();

      const sessions = manager.getAllSessions();
      expect(sessions.length).toBe(1);
    });
  });

  describe('LCOV Parser', () => {
    it('should parse LCOV content', () => {
      const lcovContent = `
SF:src/index.ts
DA:1,5
DA:2,0
DA:3,10
LF:3
LH:2
end_of_record
      `;

      const result = parseLcovContent(lcovContent);

      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(1);
    });
  });

  describe('Istanbul Parser', () => {
    it('should parse Istanbul JSON content', () => {
      const istanbulContent = JSON.stringify({
        'src/index.ts': {
          path: 'src/index.ts',
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          s: { '0': 5 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {}
        }
      });

      const result = parseIstanbulContent(istanbulContent);

      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(1);
    });
  });
});

async function initializeServer(initializationOptions: unknown): Promise<boolean> {
  serverHarness.reset();
  vi.resetModules();

  await import('../server');
  serverHarness.initialize({
    capabilities: {},
    initializationOptions,
    rootUri: 'file:///workspace'
  });

  return serverHarness.getTrustedExecution();
}

describe('Server execution trust', () => {
  it('defaults to untrusted and accepts only an explicit true initialization option', async () => {
    await expect(initializeServer(undefined)).resolves.toBe(false);
    await expect(initializeServer({})).resolves.toBe(false);
    await expect(initializeServer({ trustedExecution: false })).resolves.toBe(false);
    await expect(initializeServer({ trustedExecution: 'true' })).resolves.toBe(false);
    await expect(initializeServer({ trustedExecution: true })).resolves.toBe(true);
  });
});
