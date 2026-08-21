import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  let workspaceTrusted = true;
  let experimentalEnabled = false;
  let trustHandler: (() => void) | undefined;
  let configurationHandler: ((event: { affectsConfiguration(section: string): boolean }) => void) | undefined;
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const workspaceStore = new Map<string, unknown>();
  const globalStore = new Map<string, unknown>();
  const languageClient = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn(),
    sendRequest: vi.fn().mockResolvedValue({})
  };
  const languageClientArgs: unknown[][] = [];
  const outputChannel = {
    append: vi.fn(),
    appendLine: vi.fn(),
    clear: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn()
  };
  const createOutputChannel = vi.fn(() => outputChannel);
  const showInformationMessage = vi.fn().mockResolvedValue('Reload Window');
  const showWarningMessage = vi.fn().mockResolvedValue(undefined);
  const executeCommand = vi.fn().mockResolvedValue(undefined);
  const registerCommand = vi.fn((command: string, callback: (...args: unknown[]) => unknown) => {
    commands.set(command, callback);
    return { dispose: vi.fn() };
  });
  const getConfiguration = vi.fn(() => ({
    get: vi.fn((key: string, defaultValue?: unknown) => (
      key === 'experimental.enabled' ? experimentalEnabled : defaultValue
    ))
  }));
  const onDidGrantWorkspaceTrust = vi.fn((handler: () => void) => {
    trustHandler = handler;
    return { dispose: vi.fn() };
  });
  const onDidChangeConfiguration = vi.fn((handler: (event: { affectsConfiguration(section: string): boolean }) => void) => {
    configurationHandler = handler;
    return { dispose: vi.fn() };
  });
  const createFileSystemWatcher = vi.fn(() => ({
    onDidChange: vi.fn(),
    onDidCreate: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn()
  }));

  return {
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      get isTrusted(): boolean {
        return workspaceTrusted;
      },
      getConfiguration,
      onDidGrantWorkspaceTrust,
      onDidChangeConfiguration,
      createFileSystemWatcher
    },
    window: {
      createOutputChannel,
      showInformationMessage,
      showWarningMessage,
      createStatusBarItem: vi.fn(() => ({
        text: '',
        tooltip: '',
        command: undefined,
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn()
      }))
    },
    commands: { registerCommand, executeCommand, getCommands: vi.fn().mockResolvedValue([]) },
    executeCommand,
    showInformationMessage,
    showWarningMessage,
    extensions: { getExtension: vi.fn(() => null) },
    languageClient,
    languageClientArgs,
    registeredCommands: commands,
    workspaceStore,
    globalStore,
    setWorkspaceTrusted(value: boolean): void {
      workspaceTrusted = value;
    },
    setExperimentalEnabled(value: boolean): void {
      experimentalEnabled = value;
    },
    grantTrust(): void {
      if (!trustHandler) throw new Error('Trust handler was not registered.');
      trustHandler();
    },
    fireConfigurationChange(section: string): void {
      if (!configurationHandler) throw new Error('Configuration handler was not registered.');
      configurationHandler({ affectsConfiguration: (candidate) => candidate === section });
    },
    reset(): void {
      workspaceTrusted = true;
      experimentalEnabled = false;
      trustHandler = undefined;
      configurationHandler = undefined;
      commands.clear();
      workspaceStore.clear();
      globalStore.clear();
      languageClientArgs.length = 0;
      languageClient.start.mockClear();
      languageClient.stop.mockClear();
      languageClient.sendNotification.mockClear();
      languageClient.sendRequest.mockClear();
      createOutputChannel.mockClear();
      showInformationMessage.mockClear();
      showWarningMessage.mockClear();
      executeCommand.mockClear();
      registerCommand.mockClear();
      getConfiguration.mockClear();
      onDidGrantWorkspaceTrust.mockClear();
      onDidChangeConfiguration.mockClear();
      createFileSystemWatcher.mockClear();
    }
  };
});

vi.mock('vscode', () => harness);

vi.mock('vscode-languageclient/node', () => ({
  LanguageClient: class MockLanguageClient {
    readonly start = harness.languageClient.start;
    readonly stop = harness.languageClient.stop;
    readonly sendNotification = harness.languageClient.sendNotification;
    readonly sendRequest = harness.languageClient.sendRequest;

    constructor(...args: unknown[]) {
      harness.languageClientArgs.push(args);
    }
  },
  TransportKind: { ipc: 1 }
}));

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
vi.mock('../utils/statusBar', () => ({ initStatusBar: vi.fn(() => undefined) }));

import { activate } from '../extension';
import { registerChecklistFeatures } from '../features/checklist';
import { registerContextFeatures } from '../features/context';
import { registerCoverageFeatures } from '../features/coverage';
import { registerDashboardFeature } from '../features/dashboard';
import { registerDebugFeatures } from '../features/debug';
import { registerDocgenFeatures } from '../features/docgen';
import { registerPreCrCheckFeature } from '../features/preCrCheck';
import { registerReadinessFeature } from '../features/readiness';
import { registerReviewFeatures } from '../features/review';
import { state } from '../utils/state';

function createExtensionContext() {
  return {
    asAbsolutePath: (relativePath: string) => `/mock/extension/${relativePath}`,
    extensionPath: '/mock/extension',
    subscriptions: [] as Array<{ dispose: () => void }>,
    globalState: {
      get: <T>(key: string, defaultValue?: T): T | undefined => (
        (harness.globalStore.has(key) ? harness.globalStore.get(key) : defaultValue) as T | undefined
      ),
      update: vi.fn(async (key: string, value: unknown) => {
        harness.globalStore.set(key, value);
      })
    },
    workspaceState: {
      get: <T>(key: string, defaultValue?: T): T | undefined => (
        (harness.workspaceStore.has(key) ? harness.workspaceStore.get(key) : defaultValue) as T | undefined
      ),
      update: vi.fn(async (key: string, value: unknown) => {
        harness.workspaceStore.set(key, value);
      })
    }
  };
}

describe('VS Code extension lifecycle', () => {
  beforeEach(() => {
    harness.reset();
    state.reset();
    vi.clearAllMocks();
  });

  it('starts only stable readiness features and restores the last result', async () => {
    harness.workspaceStore.set('preCr.readiness', {
      state: 'blocked',
      gateDecision: 'block',
      scope: 'staged',
      summary: 'Coverage is below threshold.',
      remediation: [{ code: 'coverage', message: 'Add coverage.' }],
      lastRunAt: 123
    });

    const context = createExtensionContext();
    await activate(context as never);

    expect(harness.languageClient.start).toHaveBeenCalledOnce();
    expect(registerCoverageFeatures).toHaveBeenCalledOnce();
    expect(registerPreCrCheckFeature).toHaveBeenCalledOnce();
    expect(registerReadinessFeature).toHaveBeenCalledOnce();
    expect(registerChecklistFeatures).not.toHaveBeenCalled();
    expect(registerDocgenFeatures).not.toHaveBeenCalled();
    expect(registerReviewFeatures).not.toHaveBeenCalled();
    expect(registerContextFeatures).not.toHaveBeenCalled();
    expect(registerDebugFeatures).not.toHaveBeenCalled();
    expect(registerDashboardFeature).not.toHaveBeenCalled();
    expect(state.get('readiness')).toMatchObject({ state: 'blocked', gateDecision: 'block' });

    const [, , , clientOptions] = harness.languageClientArgs[0] as [string, string, unknown, { initializationOptions: Record<string, unknown> }];
    expect(clientOptions.initializationOptions).toMatchObject({
      experimental: { enabled: false },
      trustedExecution: true
    });
    expect(harness.executeCommand).toHaveBeenCalledWith('setContext', 'preCr.experimentalEnabled', false);
  });

  it('enables the experimental lifecycle only with explicit trusted configuration', async () => {
    harness.setExperimentalEnabled(true);

    await activate(createExtensionContext() as never);

    expect(registerChecklistFeatures).toHaveBeenCalledOnce();
    expect(registerDocgenFeatures).toHaveBeenCalledOnce();
    expect(registerReviewFeatures).toHaveBeenCalledOnce();
    expect(registerContextFeatures).toHaveBeenCalledOnce();
    expect(registerDebugFeatures).toHaveBeenCalledOnce();
    expect(registerDashboardFeature).toHaveBeenCalledOnce();
    expect(harness.executeCommand).toHaveBeenCalledWith('setContext', 'preCr.experimentalEnabled', true);
    const [, , , clientOptions] = harness.languageClientArgs[0] as [string, string, unknown, { initializationOptions: Record<string, unknown> }];
    expect(clientOptions.initializationOptions).toMatchObject({ experimental: { enabled: true } });
  });

  it('reloads when the experimental setting changes after activation', async () => {
    await activate(createExtensionContext() as never);

    harness.fireConfigurationChange('preCr.experimental.enabled');
    await Promise.resolve();

    expect(harness.showInformationMessage).toHaveBeenCalledWith(
      'Experimental Pre-CR tools change after reload.',
      'Reload Window'
    );
    expect(harness.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  it('keeps setup and recovery guidance available while untrusted', async () => {
    harness.setWorkspaceTrusted(false);
    const context = createExtensionContext();

    await activate(context as never);

    expect(harness.languageClient.start).not.toHaveBeenCalled();
    expect(registerReadinessFeature).toHaveBeenCalledOnce();
    expect(harness.registeredCommands.has('preCr.runPreCrCheck')).toBe(true);
    expect(harness.registeredCommands.has('preCr.fixSetup')).toBe(true);

    await harness.registeredCommands.get('preCr.runPreCrCheck')!();
    expect(harness.showWarningMessage).toHaveBeenCalledWith(
      'Trust this workspace before running repository-configured Pre-CR checks.'
    );

    harness.grantTrust();
    expect(harness.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
  });
});
