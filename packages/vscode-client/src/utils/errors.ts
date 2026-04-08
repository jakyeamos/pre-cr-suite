/**
 * Standardized Error Messages
 * 
 * Provides user-friendly, actionable error messages
 */

import * as vscode from 'vscode';
import * as notify from './notifications';

export const messages = {
  // Git errors
  gitNotFound: {
    message: 'Git not detected',
    detail: 'Pre-CR features require a git repository. Initialize git or open a git project.',
    action: 'Initialize Git',
    command: 'git.init'
  },
  branchNotFound: {
    message: 'Could not detect git branch',
    detail: 'Make sure you are in a git repository with at least one commit.',
  },
  noChangedFiles: {
    message: 'No changed files detected',
    detail: 'Make some changes to your code to use this feature.',
  },

  // Workspace errors
  noWorkspace: {
    message: 'No folder open',
    detail: 'Open a folder to use Pre-CR features.',
    action: 'Open Folder',
    command: 'vscode.openFolder'
  },
  noActiveEditor: {
    message: 'No file open',
    detail: 'Open a file to use this feature.',
  },

  // Coverage errors
  noCoverageData: {
    message: 'No coverage data loaded',
    detail: 'Run your tests with coverage enabled, then use "Load Coverage".',
    action: 'Load Coverage',
    command: 'preCr.loadCoverage'
  },
  noCoverageFiles: {
    message: 'Coverage loaded but no files matched',
    detail: 'Check that coverage paths in settings match your project structure.',
    action: 'Open Settings',
    command: 'preCr.openSettings'
  },
  coverageFileNotFound: {
    message: 'Coverage file not found',
    detail: 'Run your tests with coverage enabled. Looked in: coverage/, .coverage/',
  },

  // LSP errors  
  serverNotResponding: {
    message: 'Pre-CR server not responding',
    detail: 'Try reloading the window to restart the server.',
    action: 'Reload Window',
    command: 'workbench.action.reloadWindow'
  },
  serverError: (error: string) => ({
    message: 'Server error',
    detail: error,
  }),

  // Feature-specific
  noDocumentableItem: {
    message: 'No documentable item at cursor',
    detail: 'Move cursor to a function, class, or interface definition.',
  },
  noSnapshot: {
    message: 'No saved context for this branch',
    detail: 'Save a snapshot to restore it later.',
    action: 'Save Snapshot',
    command: 'preCr.captureContext'
  },
  noDebugSessions: {
    message: 'No debug sessions recorded',
    detail: 'Start a debug capture to record a session.',
    action: 'Start Capture',
    command: 'preCr.startDebugCapture'
  },
  noFlakyData: {
    message: 'No flaky test data available',
    detail: 'Run your tests multiple times to detect flaky tests.',
  },

  // File errors
  fileNotFound: (filename: string) => ({
    message: 'File not found',
    detail: `The file was moved or deleted: ${filename}`,
  }),
  fileReadError: (filename: string) => ({
    message: 'Could not read file',
    detail: `Unable to read: ${filename}`,
  }),
};

type MessageKey = keyof typeof messages;
type MessageValue = typeof messages[MessageKey];

/**
 * Show an error with optional action button
 */
export async function showError(
  key: MessageKey | { message: string; detail: string; action?: string; command?: string }
) {
  const msg = typeof key === 'string' ? messages[key] : key;
  
  if (typeof msg === 'function') {
    throw new Error('Use showErrorWithArg for parameterized messages');
  }

  const msgObj = msg as { message: string; detail: string; action?: string; command?: string };
  
  if (msgObj.action && msgObj.command) {
    const action = await notify.showError(
      `${msgObj.message}: ${msgObj.detail}`,
      undefined,
      msgObj.action
    );
    if (action === msgObj.action) {
      vscode.commands.executeCommand(msgObj.command);
    }
  } else {
    notify.showError(`${msgObj.message}: ${msgObj.detail}`);
  }
}

/**
 * Show a warning with optional action button
 */
export async function showWarning(
  key: MessageKey | { message: string; detail: string; action?: string; command?: string }
) {
  const msg = typeof key === 'string' ? messages[key] : key;
  
  if (typeof msg === 'function') {
    throw new Error('Use showWarningWithArg for parameterized messages');
  }

  const msgObj = msg as { message: string; detail: string; action?: string; command?: string };
  
  if (msgObj.action && msgObj.command) {
    const action = await notify.showWarning(
      `${msgObj.message}: ${msgObj.detail}`,
      undefined,
      msgObj.action
    );
    if (action === msgObj.action) {
      vscode.commands.executeCommand(msgObj.command);
    }
  } else {
    notify.showWarning(`${msgObj.message}: ${msgObj.detail}`);
  }
}

/**
 * Show info with optional action button
 */
export async function showInfo(
  key: MessageKey | { message: string; detail: string; action?: string; command?: string }
) {
  const msg = typeof key === 'string' ? messages[key] : key;
  
  if (typeof msg === 'function') {
    throw new Error('Use showInfoWithArg for parameterized messages');
  }

  const msgObj = msg as { message: string; detail: string; action?: string; command?: string };
  
  if (msgObj.action && msgObj.command) {
    const action = await notify.showInfo(
      `${msgObj.message}: ${msgObj.detail}`,
      undefined,
      msgObj.action
    );
    if (action === msgObj.action) {
      vscode.commands.executeCommand(msgObj.command);
    }
  } else {
    notify.showInfo(`${msgObj.message}: ${msgObj.detail}`);
  }
}
