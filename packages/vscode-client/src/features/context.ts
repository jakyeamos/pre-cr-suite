/**
 * Context Preservation Feature Module
 *
 * Handles:
 * - Capturing context snapshots
 * - Restoring context on branch switch
 * - "Where was I?" summaries
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import * as notify from '../utils/notifications';
import * as statusBar from '../utils/statusBar';
import * as git from '../utils/git';

interface ContextSummary {
  summary: string;
  quickActions: string[];
}

interface ContextSummaryResponse {
  summary?: ContextSummary;
}

interface CaptureContextResponse {
  snapshot?: ContextSnapshot;
  error?: string;
}

interface ListSnapshotsResponse {
  snapshots?: ContextSnapshotSummary[];
}

interface LatestSnapshotResponse {
  snapshot?: ContextSnapshot;
}

interface ExportSnapshotsResponse {
  snapshots?: ContextSnapshot[];
  error?: string;
}

interface ImportSnapshotsResponse {
  imported?: number;
  error?: string;
}

interface ContextSnapshotSummary {
  branch: string;
  description?: string;
  filesCount: number;
  timestamp: string | number | Date;
}

export interface ContextSnapshotFile {
  path: string;
  cursor: {
    line: number;
    character: number;
  };
  isActive?: boolean;
}

export interface ContextSnapshot {
  branch: string;
  files?: ContextSnapshotFile[];
  [key: string]: unknown;
}

export const CONTEXT_SNAPSHOT_STORAGE_KEY = 'preCr.contextSnapshots.v1';

export function registerContextFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.captureContext', () => captureContext(context, client)),
    vscode.commands.registerCommand('preCr.restoreContext', (snapshot?: ContextSnapshot) => restoreContext(client, snapshot)),
    vscode.commands.registerCommand('preCr.whereWasI', () => whereWasI(client))
  );

  // Initialize context manager
  void initContextManager(context, client);
}

/**
 * Initialize context manager
 */
async function initContextManager(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  const config = vscode.workspace.getConfiguration('preCr.context');

  try {
    await client.sendRequest('$/preCr/initContextManager', {
      config: {
        autoCaptureOnBranchSwitch: config.get('autoCaptureOnBranchSwitch'),
        autoRestoreOnBranchReturn: config.get('autoRestoreOnBranchReturn')
      }
    });

    await importPersistedSnapshots(context, client);

    // Check if there's an existing snapshot for current branch
    const branch = await git.getCurrentBranch();
    if (branch) {
      checkForExistingSnapshot(client, branch);
    }
  } catch (error) {
    console.error('Failed to initialize context manager:', error);
  }
}

/**
 * Restore durable workspace snapshots into the new language-server process.
 */
export async function importPersistedSnapshots(
  context: vscode.ExtensionContext,
  client: Pick<LanguageClient, 'sendRequest'>
): Promise<number> {
  const snapshots = context.workspaceState.get<ContextSnapshot[]>(
    CONTEXT_SNAPSHOT_STORAGE_KEY,
    []
  ) || [];

  if (snapshots.length === 0) return 0;

  const result = await client.sendRequest<ImportSnapshotsResponse>(
    '$/preCr/importContextSnapshots',
    { snapshots }
  );

  if (result.error) throw new Error(result.error);
  return result.imported || 0;
}

/**
 * Persist the server's complete snapshot set in VS Code workspace storage.
 */
export async function persistContextSnapshots(
  context: vscode.ExtensionContext,
  client: Pick<LanguageClient, 'sendRequest'>
): Promise<number> {
  const result = await client.sendRequest<ExportSnapshotsResponse>(
    '$/preCr/exportContextSnapshots',
    {}
  );

  if (result.error) throw new Error(result.error);

  const snapshots = result.snapshots || [];
  await context.workspaceState.update(CONTEXT_SNAPSHOT_STORAGE_KEY, snapshots);
  return snapshots.length;
}

/**
 * Check if snapshot exists for branch and update status bar
 */
async function checkForExistingSnapshot(client: LanguageClient, branch: string) {
  try {
    const result = await client.sendRequest<ContextSummaryResponse>('$/preCr/getContextSummary', { branch });
    const summary = result.summary;

    if (summary) {
      statusBar.setSnapshot(branch);
    } else {
      statusBar.clearSnapshot();
    }
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    // Ignore errors - snapshot check is optional
  }
}

/**
 * Capture current context snapshot
 */
async function captureContext(
  extensionContext: vscode.ExtensionContext,
  client: LanguageClient
) {
  const branch = await git.getCurrentBranch();
  if (!branch) {
    notify.showWarning('Could not determine current branch');
    return;
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Description for this snapshot (optional)',
    placeHolder: 'e.g., Working on login validation'
  });

  try {
    const context = getCurrentEditorContext();

    const result = await client.sendRequest<CaptureContextResponse>('$/preCr/captureContext', {
      branch,
      description,
      files: context.files,
      git: {
        branch,
        modifiedFiles: await git.getModifiedFiles(),
        stagedFiles: await git.getStagedFiles(),
        headCommit: await git.getHeadCommit()
      }
    });

    const snapshot = result.snapshot;
    if (snapshot) {
      await persistContextSnapshots(extensionContext, client);
      notify.showSuccess(`Context saved for "${branch}"`);
      statusBar.setSnapshot(branch);
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    notify.showError(`Failed to save context: ${error}`);
  }
}

/**
 * Restore a context snapshot
 */
async function restoreContext(client: LanguageClient, snapshotToRestore?: ContextSnapshot) {
  let snapshot = snapshotToRestore;

  if (!snapshot) {
    // Get available snapshots
    const result = await client.sendRequest<ListSnapshotsResponse>('$/preCr/listSnapshots', {});
    const snapshots = result.snapshots || [];

    if (snapshots.length === 0) {
      notify.showInfo('No saved contexts found');
      return;
    }

    // Let user pick one
    const items: (vscode.QuickPickItem & { snapshot: ContextSnapshotSummary })[] = snapshots.map((s) => ({
      label: s.branch,
      description: s.description || `${s.filesCount} files`,
      detail: new Date(s.timestamp).toLocaleString(),
      snapshot: s
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select context to restore'
    });

    if (!selected) return;

    // Get full snapshot
    const fullResult = await client.sendRequest<LatestSnapshotResponse>('$/preCr/getLatestSnapshot', {
      branch: selected.snapshot.branch
    });
    snapshot = fullResult.snapshot;
  }

  if (!snapshot) {
    notify.showWarning('Could not load snapshot');
    return;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) {
    notify.showWarning('Open a workspace before restoring context');
    return;
  }

  // Ask how to restore
  const restoreMode = await vscode.window.showQuickPick([
    {
      label: '$(files) Full Restore',
      description: 'Open all files and restore cursor positions',
      value: 'full'
    },
    {
      label: '$(location) Cursor Only',
      description: 'Only restore cursor positions in already-open files',
      value: 'cursor'
    }
  ], {
    placeHolder: 'How do you want to restore?'
  });

  if (!restoreMode) return;

  if (restoreMode.value === 'cursor') {
    // Only restore cursor positions in already-open files
    let restoredCount = 0;

    for (const file of snapshot.files || []) {
      const resolvedPath = git.validatePathInWorkspace(file.path, workspaceRoot.fsPath);
      if (!resolvedPath) continue;

      const fileUri = vscode.Uri.file(resolvedPath);

      // Find if file is already open
      const openEditor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.fsPath === fileUri.fsPath
      );

      if (openEditor) {
        const position = clampCursorToDocument(openEditor.document, file.cursor);
        openEditor.selection = new vscode.Selection(position, position);
        openEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        restoredCount++;
      }
    }

    if (restoredCount === 0 && (snapshot.files?.length || 0) > 0) {
      notify.showWarning('No cursor positions restored; open a saved file and try again');
    } else {
      notify.showSuccess(`Restored cursor positions in ${restoredCount} file(s)`);
    }
    return;
  }

  // Full restore - open files and restore positions
  let restoredCount = 0;
  let skippedCount = 0;
  await notify.showProgress('Restoring context...', async () => {
    for (const file of snapshot.files || []) {
      try {
        const resolvedPath = git.validatePathInWorkspace(file.path, workspaceRoot.fsPath);
        if (!resolvedPath) {
          skippedCount++;
          continue;
        }

        const fileUri = vscode.Uri.file(resolvedPath);
        if (!(await workspaceFileExists(fileUri))) {
          skippedCount++;
          continue;
        }
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, {
          viewColumn: file.isActive ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
          preserveFocus: !file.isActive
        });

        // Restore cursor position
        const position = clampCursorToDocument(doc, file.cursor);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        restoredCount++;

      } catch (error) {
        console.debug('Pre-CR: Snapshot file could not be restored:', error);
        // File might not exist anymore
        skippedCount++;
      }
    }
  });

  if (skippedCount > 0) {
    notify.showWarning(formatRestoreOutcome(snapshot.branch, restoredCount, skippedCount));
  } else {
    notify.showSuccess(formatRestoreOutcome(snapshot.branch, restoredCount, skippedCount));
  }
}

export async function workspaceFileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export function clampCursorToDocument(
  document: Pick<vscode.TextDocument, 'lineCount' | 'lineAt'>,
  cursor: { line: number; character: number }
): vscode.Position {
  const maximumLine = Math.max(0, document.lineCount - 1);
  const line = Math.min(Math.max(0, cursor.line), maximumLine);
  const maximumCharacter = document.lineCount > 0
    ? document.lineAt(line).text.length
    : 0;
  const character = Math.min(Math.max(0, cursor.character), maximumCharacter);
  return new vscode.Position(line, character);
}

export function formatRestoreOutcome(
  branch: string,
  restoredCount: number,
  skippedCount: number
): string {
  if (skippedCount > 0) {
    return `Restored ${restoredCount} file(s) from "${branch}"; skipped ${skippedCount} missing or stale file(s)`;
  }

  return `Restored ${restoredCount} file(s) from "${branch}"`;
}

export function parseOpenAction(
  action: string
): { filePath: string; zeroBasedLine: number } | undefined {
  const match = action.match(/^Open (.+):(\d+)$/);
  if (!match) return undefined;

  return {
    filePath: match[1],
    zeroBasedLine: Math.max(0, Number.parseInt(match[2], 10) - 1)
  };
}

/**
 * Show "Where was I?" summary
 */
async function whereWasI(client: LanguageClient) {
  const branch = await git.getCurrentBranch();
  if (!branch) {
    notify.showWarning('Could not determine current branch');
    return;
  }

  try {
    const result = await client.sendRequest<ContextSummaryResponse>('$/preCr/getContextSummary', { branch });
    const summary = result.summary;

    if (!summary) {
      // Offer to create a snapshot
      const action = await notify.showInfo(
        `No saved context for "${branch}". Save one now?`,
        undefined,
        'Save Snapshot'
      );

      if (action === 'Save Snapshot') {
        vscode.commands.executeCommand('preCr.captureContext');
      }
      return;
    }

    // Show quick pick with actions
    const items: (vscode.QuickPickItem & { action: string })[] = [
      ...summary.quickActions
        .filter((action: string) => action.startsWith('Open '))
        .map((action: string) => ({ label: action, action })),
      {
        label: '$(folder-opened) Restore saved context',
        description: 'Reopen saved files and cursor positions',
        action: 'restore'
      },
      {
        label: '$(shield) Open Quick Actions',
        description: 'Continue with coverage, setup, or the main check',
        action: 'quickActions'
      },
      {
        label: '$(play) Run Pre-CR Check',
        description: 'Verify changed-line readiness',
        action: 'runPreCrCheck'
      }
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: summary.summary
    });

    if (selected) {
      if (selected.action === 'restore') {
        await vscode.commands.executeCommand('preCr.restoreContext');
        return;
      }
      if (selected.action === 'quickActions') {
        await vscode.commands.executeCommand('preCr.showQuickActions');
        return;
      }
      if (selected.action === 'runPreCrCheck') {
        await vscode.commands.executeCommand('preCr.runPreCrCheck');
        return;
      }

      const openAction = parseOpenAction(selected.action);
      if (openAction) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) return;

        const resolvedPath = git.validatePathInWorkspace(
          openAction.filePath,
          workspaceRoot.fsPath
        );
        if (!resolvedPath) {
          notify.showWarning('Saved file is outside the current workspace');
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath));
          const editor = await vscode.window.showTextDocument(doc);
          const position = clampCursorToDocument(doc, {
            line: openAction.zeroBasedLine,
            character: 0
          });
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position));
        } catch (error) {
          console.debug('Pre-CR: Saved context file could not be opened:', error);
          notify.showWarning('Saved file is missing or stale');
        }
      }
    }

  } catch (error) {
    notify.showError(`Failed to get context: ${error}`);
  }
}

/**
 * Get current editor context
 */
export function getCurrentEditorContext() {
  const visibleEditors = new Map(
    vscode.window.visibleTextEditors.map(editor => [editor.document.uri.toString(), editor])
  );
  const openDocuments = new Map(
    vscode.workspace.textDocuments.map(document => [document.uri.toString(), document])
  );
  const activeEditor = vscode.window.activeTextEditor;
  const files = new Map<string, {
    path: string;
    cursor: { line: number; character: number };
    scrollTop: number;
    isDirty: boolean;
    isActive: boolean;
  }>();

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const uri = tab.input instanceof vscode.TabInputText
        ? tab.input.uri
        : tab.input instanceof vscode.TabInputTextDiff
          ? tab.input.modified
          : undefined;
      if (!uri) continue;
      if (uri.scheme !== 'file' || !vscode.workspace.getWorkspaceFolder(uri)) continue;

      const key = uri.toString();
      const editor = visibleEditors.get(key);
      const document = editor?.document || openDocuments.get(key);
      const isActive = tab.isActive || editor === activeEditor;
      const existing = files.get(key);

      if (existing && (!isActive || existing.isActive)) continue;

      files.set(key, {
        path: vscode.workspace.asRelativePath(uri),
        cursor: editor
          ? {
              line: editor.selection.active.line,
              character: editor.selection.active.character
            }
          : { line: 0, character: 0 },
        scrollTop: editor?.visibleRanges[0]?.start.line || 0,
        isDirty: document?.isDirty || false,
        isActive
      });
    }
  }

  return {
    files: [...files.values()]
  };
}
