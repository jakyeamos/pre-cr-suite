import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number
    ) {}
  }
  class TabInputText {
    constructor(public readonly uri: { scheme: string; toString(): string }) {}
  }
  class TabInputTextDiff {
    constructor(
      public readonly original: { scheme: string; toString(): string },
      public readonly modified: { scheme: string; toString(): string }
    ) {}
  }
  class TreeItem {
    public description?: string;
    public command?: unknown;
    public iconPath?: unknown;

    constructor(
      public readonly label: string,
      public readonly collapsibleState: number
    ) {}
  }

  return {
    Position,
    TabInputText,
    TabInputTextDiff,
    TreeItem,
    TreeItemCollapsibleState: { None: 0 },
    window: {
      visibleTextEditors: [],
      activeTextEditor: undefined,
      tabGroups: {
        all: []
      }
    },
    workspace: {
      workspaceFolders: [],
      textDocuments: [],
      fs: {
        stat: vi.fn()
      },
      getWorkspaceFolder: vi.fn(),
      asRelativePath: vi.fn((uri: { path?: string }) => uri.path || '')
    },
    commands: {
      registerCommand: vi.fn(),
      executeCommand: vi.fn()
    }
  };
});

vi.mock('vscode-languageclient/node', () => ({}));
vi.mock('../utils/notifications', () => ({}));
vi.mock('../utils/statusBar', () => ({}));
vi.mock('../utils/git', () => ({
  validatePathInWorkspace: vi.fn()
}));

import * as vscode from 'vscode';

import {
  CONTEXT_SNAPSHOT_STORAGE_KEY,
  clampCursorToDocument,
  formatRestoreOutcome,
  getCurrentEditorContext,
  importPersistedSnapshots,
  parseOpenAction,
  persistContextSnapshots,
  workspaceFileExists
} from '../features/context';

function createExtensionContext(stored: unknown[] = []) {
  return {
    workspaceState: {
      get: vi.fn((_key: string, defaultValue: unknown[]) =>
        stored.length > 0 ? stored : defaultValue
      ),
      update: vi.fn().mockResolvedValue(undefined)
    }
  };
}

describe('durable context snapshot contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.window.visibleTextEditors as vscode.TextEditor[]).splice(0);
    vscode.window.activeTextEditor = undefined;
    (vscode.window.tabGroups.all as vscode.TabGroup[]).splice(0);
    (vscode.workspace.textDocuments as vscode.TextDocument[]).splice(0);
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({} as never);
  });

  it('treats an empty workspace snapshot store as a normal first-run state', async () => {
    const context = createExtensionContext();
    const client = { sendRequest: vi.fn() };

    await expect(
      importPersistedSnapshots(context as never, client as never)
    ).resolves.toBe(0);
    expect(client.sendRequest).not.toHaveBeenCalled();
  });

  it('imports saved workspace snapshots into a restarted server process', async () => {
    const snapshots = [{ id: 'ctx_1', branch: 'feature/demo', files: [] }];
    const context = createExtensionContext(snapshots);
    const client = {
      sendRequest: vi.fn().mockResolvedValue({ imported: 1 })
    };

    await expect(
      importPersistedSnapshots(context as never, client as never)
    ).resolves.toBe(1);
    expect(client.sendRequest).toHaveBeenCalledWith(
      '$/preCr/importContextSnapshots',
      { snapshots }
    );
  });

  it('persists the complete server snapshot set after manual or branch capture', async () => {
    const snapshots = [{ id: 'ctx_2', branch: 'feature/return', files: [] }];
    const context = createExtensionContext();
    const client = {
      sendRequest: vi.fn().mockResolvedValue({ snapshots })
    };

    await expect(
      persistContextSnapshots(context as never, client as never)
    ).resolves.toBe(1);
    expect(context.workspaceState.update).toHaveBeenCalledWith(
      CONTEXT_SNAPSHOT_STORAGE_KEY,
      snapshots
    );
  });

  it('keeps displayed line numbers one-based while restoring zero-based cursors', () => {
    expect(parseOpenAction('Open src/editor.ts:39')).toEqual({
      filePath: 'src/editor.ts',
      zeroBasedLine: 38
    });
    expect(parseOpenAction('Review 2 changed files')).toBeUndefined();
  });

  it('clamps stale cursor positions to the current document bounds', () => {
    const document = {
      lineCount: 2,
      lineAt: (line: number) => ({ text: line === 0 ? 'short' : 'last line' })
    };

    expect(
      clampCursorToDocument(document as never, {
        line: 200,
        character: 200
      })
    ).toMatchObject({ line: 1, character: 9 });
  });

  it('checks the workspace filesystem instead of trusting cached editor documents', async () => {
    const uri = { scheme: 'file', path: 'src/missing.ts' };
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValueOnce(new Error('missing'));

    await expect(workspaceFileExists(uri as never)).resolves.toBe(false);
  });

  it('makes partial restoration visible instead of reporting unconditional success', () => {
    expect(formatRestoreOutcome('feature/demo', 2, 1)).toBe(
      'Restored 2 file(s) from "feature/demo"; skipped 1 missing or stale file(s)'
    );
    expect(formatRestoreOutcome('feature/demo', 3, 0)).toBe(
      'Restored 3 file(s) from "feature/demo"'
    );
  });

  it('captures every open text tab instead of only the visible editor pane', () => {
    const uri = (path: string) => ({
      scheme: 'file',
      path,
      toString: () => `file://${path}`
    });
    const activeUri = uri('src/session.ts');
    const inactiveUri = uri('src/continuity.ts');
    const activeDocument = { uri: activeUri, isDirty: true };
    const inactiveDocument = { uri: inactiveUri, isDirty: false };
    const activeEditor = {
      document: activeDocument,
      selection: { active: { line: 10, character: 9 } },
      visibleRanges: [{ start: { line: 6 } }]
    };

    (vscode.window.visibleTextEditors as vscode.TextEditor[]).push(activeEditor as never);
    vscode.window.activeTextEditor = activeEditor as never;
    (vscode.workspace.textDocuments as vscode.TextDocument[]).push(
      activeDocument as never,
      inactiveDocument as never
    );
    (vscode.window.tabGroups.all as vscode.TabGroup[]).push({
      tabs: [
        { input: new vscode.TabInputText(activeUri as never), isActive: true },
        { input: new vscode.TabInputText(inactiveUri as never), isActive: false }
      ]
    } as never);

    expect(getCurrentEditorContext()).toEqual({
      files: [
        {
          path: 'src/session.ts',
          cursor: { line: 10, character: 9 },
          scrollTop: 6,
          isDirty: true,
          isActive: true
        },
        {
          path: 'src/continuity.ts',
          cursor: { line: 0, character: 0 },
          scrollTop: 0,
          isDirty: false,
          isActive: false
        }
      ]
    });
  });

  it('deduplicates a file shown in multiple editor groups', () => {
    const fileUri = {
      scheme: 'file',
      path: 'src/session.ts',
      toString: () => 'file://src/session.ts'
    };
    (vscode.window.tabGroups.all as vscode.TabGroup[]).push(
      {
        tabs: [{ input: new vscode.TabInputText(fileUri as never), isActive: false }]
      } as never,
      {
        tabs: [{ input: new vscode.TabInputText(fileUri as never), isActive: true }]
      } as never
    );

    expect(getCurrentEditorContext().files).toHaveLength(1);
    expect(getCurrentEditorContext().files[0]).toMatchObject({
      path: 'src/session.ts',
      isActive: true
    });
  });

  it('captures the modified side of an open text diff tab', () => {
    const originalUri = {
      scheme: 'git',
      path: 'src/session.ts',
      toString: () => 'git://src/session.ts'
    };
    const modifiedUri = {
      scheme: 'file',
      path: 'src/session.ts',
      toString: () => 'file://src/session.ts'
    };
    const document = { uri: modifiedUri, isDirty: false };

    (vscode.workspace.textDocuments as vscode.TextDocument[]).push(document as never);
    (vscode.window.tabGroups.all as vscode.TabGroup[]).push({
      tabs: [{
        input: new vscode.TabInputTextDiff(originalUri as never, modifiedUri as never),
        isActive: true
      }]
    } as never);

    expect(getCurrentEditorContext()).toEqual({
      files: [{
        path: 'src/session.ts',
        cursor: { line: 0, character: 0 },
        scrollTop: 0,
        isDirty: false,
        isActive: true
      }]
    });
  });
});
