/**
 * Security Utility Tests
 *
 * Tests for path sanitization and security functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const extensionHarness = vi.hoisted(() => {
  let workspaceTrusted = false;
  let trustGrantedHandler: (() => void) | undefined;

  const outputChannel = {
    append: vi.fn(),
    appendLine: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    hide: vi.fn(),
    show: vi.fn()
  };
  const createOutputChannel = vi.fn(() => outputChannel);
  const showWarningMessage = vi.fn().mockResolvedValue(undefined);
  const executeCommand = vi.fn().mockResolvedValue(undefined);
  const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
  const getConfiguration = vi.fn(() => ({
    get: vi.fn()
  }));
  const onDidGrantWorkspaceTrust = vi.fn((handler: () => void) => {
    trustGrantedHandler = handler;
    return { dispose: vi.fn() };
  });
  const createLanguageClient = vi.fn();
  const startLanguageClient = vi.fn().mockResolvedValue(undefined);

  const workspace = {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    get isTrusted(): boolean {
      return workspaceTrusted;
    },
    getConfiguration,
    onDidGrantWorkspaceTrust
  };

  return {
    workspace,
    outputChannel,
    createOutputChannel,
    showWarningMessage,
    executeCommand,
    registerCommand,
    getConfiguration,
    onDidGrantWorkspaceTrust,
    createLanguageClient,
    startLanguageClient,
    setWorkspaceTrusted(value: boolean): void {
      workspaceTrusted = value;
    },
    grantWorkspaceTrust(): void {
      if (!trustGrantedHandler) {
        throw new Error('Expected the extension to register a workspace-trust handler.');
      }

      trustGrantedHandler();
    },
    reset(): void {
      workspaceTrusted = false;
      trustGrantedHandler = undefined;
      outputChannel.append.mockClear();
      outputChannel.appendLine.mockClear();
      createOutputChannel.mockClear();
      showWarningMessage.mockClear();
      executeCommand.mockClear();
      registerCommand.mockClear();
      getConfiguration.mockClear();
      onDidGrantWorkspaceTrust.mockClear();
      createLanguageClient.mockClear();
      startLanguageClient.mockClear();
    }
  };
});

// Mock vscode before imports
vi.mock('vscode', () => ({
  workspace: extensionHarness.workspace,
  window: {
    createOutputChannel: extensionHarness.createOutputChannel,
    showWarningMessage: extensionHarness.showWarningMessage
  },
  commands: {
    executeCommand: extensionHarness.executeCommand,
    registerCommand: extensionHarness.registerCommand
  },
  extensions: {
    getExtension: vi.fn(() => null)
  }
}));

vi.mock('vscode-languageclient/node', () => {
  class MockLanguageClient {
    constructor(...arguments_: unknown[]) {
      extensionHarness.createLanguageClient(...arguments_);
    }

    async start(): Promise<void> {
      await extensionHarness.startLanguageClient();
    }

    stop(): Promise<void> {
      return Promise.resolve();
    }

    sendNotification = vi.fn();
    sendRequest = vi.fn();
  }

  return {
    LanguageClient: MockLanguageClient,
    TransportKind: {
      ipc: 1
    }
  };
});

vi.mock('../features/coverage', () => ({ registerCoverageFeatures: vi.fn() }));
vi.mock('../features/checklist', () => ({ registerChecklistFeatures: vi.fn() }));
vi.mock('../features/docgen', () => ({ registerDocgenFeatures: vi.fn() }));
vi.mock('../features/review', () => ({ registerReviewFeatures: vi.fn() }));
vi.mock('../features/context', () => ({ registerContextFeatures: vi.fn() }));
vi.mock('../features/debug', () => ({
  isDebugCapturing: vi.fn(() => false),
  registerDebugFeatures: vi.fn()
}));
vi.mock('../features/dashboard', () => ({ registerDashboardFeature: vi.fn() }));
vi.mock('../features/preCrCheck', () => ({ registerPreCrCheckFeature: vi.fn() }));
vi.mock('../features/readiness', () => ({ registerReadinessFeature: vi.fn() }));
vi.mock('../utils/notifications', () => ({
  showInfo: vi.fn(),
  showWarning: vi.fn()
}));
vi.mock('../utils/statusBar', () => ({ initStatusBar: vi.fn() }));
vi.mock('../utils/state', () => ({
  initState: vi.fn(),
  state: {
    addRecentAction: vi.fn(),
    getRecentActions: vi.fn(() => []),
    setLspConnected: vi.fn()
  }
}));

import { sanitizePath, validatePathInWorkspace, escapeShellArg } from '../utils/git';

describe('Security Utilities', () => {
  describe('sanitizePath', () => {
    it('should return empty string for empty input', () => {
      expect(sanitizePath('')).toBe('');
    });

    it('should remove null bytes', () => {
      expect(sanitizePath('file\0.txt')).toBe('file.txt');
    });

    it('should remove path traversal attempts', () => {
      expect(sanitizePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizePath('foo/../bar')).toBe('foo/bar'); // .. removed, slashes collapsed
      expect(sanitizePath('..\\..\\windows')).toBe('windows');
    });

    it('should remove shell metacharacters', () => {
      expect(sanitizePath('file`rm -rf`.txt')).toBe('filerm -rf.txt');
      expect(sanitizePath('file$HOME.txt')).toBe('fileHOME.txt');
      expect(sanitizePath('file|cat.txt')).toBe('filecat.txt');
      expect(sanitizePath('file;echo.txt')).toBe('fileecho.txt');
      expect(sanitizePath('file&background.txt')).toBe('filebackground.txt');
      expect(sanitizePath('file<input.txt')).toBe('fileinput.txt');
      expect(sanitizePath('file>output.txt')).toBe('fileoutput.txt');
    });

    it('should normalize path separators', () => {
      expect(sanitizePath('path\\to\\file.txt')).toBe('path/to/file.txt');
    });

    it('should remove leading slashes', () => {
      expect(sanitizePath('/absolute/path.txt')).toBe('absolute/path.txt');
      expect(sanitizePath('///multiple/slashes.txt')).toBe('multiple/slashes.txt');
    });

    it('should handle normal paths unchanged (except normalization)', () => {
      expect(sanitizePath('src/utils/file.ts')).toBe('src/utils/file.ts');
      expect(sanitizePath('package.json')).toBe('package.json');
    });

    it('should handle complex attack strings', () => {
      const attack = '../../../etc/passwd\0;rm -rf /`whoami`';
      const sanitized = sanitizePath(attack);
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('\0');
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('`');
    });
  });

  describe('validatePathInWorkspace', () => {
    const workspaceRoot = '/home/user/project';

    it('should accept paths within workspace', () => {
      const result = validatePathInWorkspace('src/index.ts', workspaceRoot);
      expect(result).toBe('/home/user/project/src/index.ts');
    });

    it('should reject path traversal attempts', () => {
      const result = validatePathInWorkspace('../../../etc/passwd', workspaceRoot);
      expect(result).toBeNull();
    });

    it('should reject absolute paths', () => {
      expect(validatePathInWorkspace('/etc/passwd', workspaceRoot)).toBeNull();
      expect(validatePathInWorkspace('C:/Windows/system.ini', workspaceRoot)).toBeNull();
    });

    it('should enforce the workspace path boundary', () => {
      expect(validatePathInWorkspace('src/index.ts', '/home/user/pro')).toBe('/home/user/pro/src/index.ts');
      expect(validatePathInWorkspace('../project-evil/file.ts', '/home/user/project')).toBeNull();
    });

    it('should handle nested paths', () => {
      const result = validatePathInWorkspace('src/utils/helpers/index.ts', workspaceRoot);
      expect(result).toBe('/home/user/project/src/utils/helpers/index.ts');
    });
  });

  describe('escapeShellArg', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
    });

    it('should escape single quotes', () => {
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
    });

    it('should handle empty strings', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should safely escape shell metacharacters', () => {
      expect(escapeShellArg('$(whoami)')).toBe("'$(whoami)'");
      expect(escapeShellArg('`rm -rf /`')).toBe("'`rm -rf /`'");
      expect(escapeShellArg('file; cat /etc/passwd')).toBe("'file; cat /etc/passwd'");
    });

    it('should handle paths with spaces', () => {
      expect(escapeShellArg('/path/to/my file.txt')).toBe("'/path/to/my file.txt'");
    });
  });
});

function createExtensionContext() {
  return {
    asAbsolutePath: (relativePath: string) => `/mock/extension/${relativePath}`,
    extensionPath: '/mock/extension',
    subscriptions: [] as Array<{ dispose: () => void }>
  };
}

describe('Workspace trust', () => {
  beforeEach(() => {
    vi.resetModules();
    extensionHarness.reset();
  });

  it('does not launch the language server or repository configuration while untrusted', async () => {
    extensionHarness.setWorkspaceTrusted(false);
    const { activate } = await import('../extension');
    const context = createExtensionContext();

    await activate(context as never);

    expect(extensionHarness.createLanguageClient).not.toHaveBeenCalled();
    expect(extensionHarness.startLanguageClient).not.toHaveBeenCalled();
    expect(extensionHarness.onDidGrantWorkspaceTrust).toHaveBeenCalledOnce();
    expect(extensionHarness.showWarningMessage).toHaveBeenCalledWith(
      'Pre-CR will not run repository-configured commands until this workspace is trusted.'
    );

    extensionHarness.grantWorkspaceTrust();

    expect(extensionHarness.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });
});
