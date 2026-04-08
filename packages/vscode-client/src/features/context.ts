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

export function registerContextFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.captureContext', () => captureContext(client)),
    vscode.commands.registerCommand('preCr.restoreContext', (snapshot?: any) => restoreContext(client, snapshot)),
    vscode.commands.registerCommand('preCr.whereWasI', () => whereWasI(client))
  );

  // Initialize context manager
  initContextManager(client);
}

/**
 * Initialize context manager
 */
async function initContextManager(client: LanguageClient) {
  const config = vscode.workspace.getConfiguration('preCr.context');

  try {
    await client.sendRequest('$/preCr/initContextManager', {
      config: {
        autoCaptureOnBranchSwitch: config.get('autoCaptureOnBranchSwitch'),
        autoRestoreOnBranchReturn: config.get('autoRestoreOnBranchReturn')
      }
    });
    
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
 * Check if snapshot exists for branch and update status bar
 */
async function checkForExistingSnapshot(client: LanguageClient, branch: string) {
  try {
    const result = await client.sendRequest('$/preCr/getContextSummary', { branch });
    const summary = (result as any).summary;
    
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
async function captureContext(client: LanguageClient) {
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
    
    const result = await client.sendRequest('$/preCr/captureContext', {
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

    const snapshot = (result as any).snapshot;
    if (snapshot) {
      notify.showSuccess(`Context saved for "${branch}"`);
      statusBar.setSnapshot(branch);
    } else {
      throw new Error((result as any).error);
    }

  } catch (error) {
    notify.showError(`Failed to save context: ${error}`);
  }
}

/**
 * Restore a context snapshot
 */
async function restoreContext(client: LanguageClient, snapshotToRestore?: any) {
  let snapshot = snapshotToRestore;

  if (!snapshot) {
    // Get available snapshots
    const result = await client.sendRequest('$/preCr/listSnapshots', {});
    const snapshots = (result as any).snapshots || [];

    if (snapshots.length === 0) {
      notify.showInfo('No saved contexts found');
      return;
    }

    // Let user pick one
    const items: (vscode.QuickPickItem & { snapshot: any })[] = snapshots.map((s: any) => ({
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
    const fullResult = await client.sendRequest('$/preCr/getLatestSnapshot', {
      branch: selected.snapshot.branch
    });
    snapshot = (fullResult as any).snapshot;
  }

  if (!snapshot) {
    notify.showWarning('Could not load snapshot');
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
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceRoot) continue;

      const fileUri = vscode.Uri.joinPath(workspaceRoot, file.path);
      
      // Find if file is already open
      const openEditor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.fsPath === fileUri.fsPath
      );
      
      if (openEditor) {
        const position = new vscode.Position(file.cursor.line, file.cursor.character);
        openEditor.selection = new vscode.Selection(position, position);
        openEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        restoredCount++;
      }
    }
    
    notify.showSuccess(`Restored cursor positions in ${restoredCount} file(s)`);
    return;
  }

  // Full restore - open files and restore positions
  await notify.showProgress('Restoring context...', async () => {
    for (const file of snapshot.files || []) {
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) continue;

        const fileUri = vscode.Uri.joinPath(workspaceRoot, file.path);
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, {
          viewColumn: file.isActive ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
          preserveFocus: !file.isActive
        });

        // Restore cursor position
        const position = new vscode.Position(file.cursor.line, file.cursor.character);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

      } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
        // File might not exist anymore
      }
    }
  });

  notify.showSuccess(`Restored context from "${snapshot.branch}"`);
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
    const result = await client.sendRequest('$/preCr/getContextSummary', { branch });
    const summary = (result as any).summary;

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
    const items: (vscode.QuickPickItem & { action: string })[] = summary.quickActions.map((action: string) => ({
      label: action,
      action
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: summary.summary
    });

    if (selected) {
      // Handle action
      if (selected.action.startsWith('Open ')) {
        const match = selected.action.match(/Open (.+):(\d+)/);
        if (match) {
          const [, filePath, line] = match;
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
          if (workspaceRoot) {
            const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const editor = await vscode.window.showTextDocument(doc);
            const position = new vscode.Position(parseInt(line) - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
          }
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
function getCurrentEditorContext() {
  const editors = vscode.window.visibleTextEditors;
  const activeEditor = vscode.window.activeTextEditor;

  return {
    files: editors.map(editor => ({
      path: vscode.workspace.asRelativePath(editor.document.uri),
      cursor: {
        line: editor.selection.active.line,
        character: editor.selection.active.character
      },
      scrollTop: editor.visibleRanges[0]?.start.line || 0,
      isDirty: editor.document.isDirty,
      isActive: editor === activeEditor
    }))
  };
}
