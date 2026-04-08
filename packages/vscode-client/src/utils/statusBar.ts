/**
 * Consolidated Status Bar Manager
 * 
 * Shows a single smart status bar item that displays the most relevant info
 * but ALWAYS links to the quick actions menu (except during recording).
 * 
 * Display priority:
 * - Recording: ● REC 0:45 (links to stop)
 * - Coverage + Issues: Pre-CR ⚠3 | 78%
 * - Coverage only: Pre-CR ✓ 78%
 * - Issues only: Pre-CR ⚠ 3
 * - Snapshot: Pre-CR ✓ (branch saved)
 * - Normal: Pre-CR ✓
 * 
 * Now powered by centralized state management.
 */

import * as vscode from 'vscode';
import { state, ExtensionState } from './state';

let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Initialize the status bar and subscribe to state changes
 */
export function initStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'Pre-CR Suite';
  context.subscriptions.push(statusBarItem);
  
  // Subscribe to all state changes
  context.subscriptions.push(
    state.subscribeAll(() => updateDisplay())
  );
  
  updateDisplay();
  statusBarItem.show();
  
  return statusBarItem;
}

/**
 * Update recording state (convenience wrapper)
 */
export function setRecording(isRecording: boolean, time?: string, hits?: number) {
  state.setDebug({
    isRecording,
    elapsedTime: time || '0s',
    hitCount: hits || 0,
    startTime: isRecording ? new Date() : null
  });
}

/**
 * Update recording time (called by timer)
 */
export function updateRecordingTime(time: string, hits?: number) {
  const debug = state.get('debug');
  if (debug.isRecording) {
    state.setDebug({
      elapsedTime: time,
      hitCount: hits !== undefined ? hits : debug.hitCount
    });
  }
}

/**
 * Update issue count (convenience wrapper)
 */
export function setIssueCount(count: number) {
  state.setSecurity({ issueCount: count });
}

/**
 * Update coverage percentage (convenience wrapper)
 */
export function setCoverage(percent: number | null) {
  state.setCoverage({
    percent,
    isLoaded: percent !== null,
    isVisible: true
  });
}

/**
 * Clear coverage (convenience wrapper)
 */
export function clearCoverage() {
  state.setCoverage({
    percent: null,
    isLoaded: false,
    fileCount: 0,
    lastLoadedFile: null
  });
}

/**
 * Set snapshot indicator for current branch (convenience wrapper)
 */
export function setSnapshot(branch: string) {
  state.setContext({
    currentBranch: branch,
    hasSnapshot: true
  });
}

/**
 * Clear snapshot indicator (convenience wrapper)
 */
export function clearSnapshot() {
  state.setContext({
    hasSnapshot: false,
    snapshotDescription: null
  });
}

/**
 * Update the status bar display based on current state
 * 
 * Key change: Always link to quick actions menu (except during recording)
 * so users can always access all features.
 */
function updateDisplay() {
  if (!statusBarItem) return;

  const s = state.getState();

  // Special case: Recording takes full control
  if (s.debug.isRecording) {
    statusBarItem.text = `$(circle-filled) REC ${s.debug.elapsedTime}`;
    if (s.debug.hitCount > 0) {
      statusBarItem.text += ` (${s.debug.hitCount} hits)`;
    }
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    statusBarItem.tooltip = 'Click to stop debug capture';
    statusBarItem.command = 'preCr.stopDebugCapture';
    return;
  }

  // Build status text with all relevant info
  const parts: string[] = [];
  const tooltipParts: string[] = ['Pre-CR Suite - Click for quick actions'];
  
  // Coverage info
  if (s.coverage.isLoaded && s.coverage.percent !== null) {
    const percent = s.coverage.percent;
    const icon = percent >= 80 ? '$(check)' : percent >= 50 ? '$(warning)' : '$(error)';
    parts.push(`${icon} ${percent.toFixed(0)}%`);
    tooltipParts.push(`Coverage: ${percent.toFixed(1)}% (${s.coverage.fileCount} files)`);
  }
  
  // Security issues
  if (s.security.issueCount > 0) {
    parts.push(`$(warning) ${s.security.issueCount}`);
    tooltipParts.push(`${s.security.issueCount} security issue${s.security.issueCount !== 1 ? 's' : ''} found`);
  }
  
  // Snapshot indicator
  if (s.context.hasSnapshot && s.context.currentBranch) {
    tooltipParts.push(`Context saved for "${s.context.currentBranch}"`);
  }

  // Compose final text
  if (parts.length > 0) {
    statusBarItem.text = `Pre-CR ${parts.join(' | ')}`;
  } else if (s.context.hasSnapshot) {
    statusBarItem.text = `$(bookmark) Pre-CR`;
  } else {
    statusBarItem.text = '$(check) Pre-CR';
  }
  
  // Set colors based on most urgent status
  if (s.security.issueCount > 0) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.color = undefined;
  } else if (s.coverage.isLoaded && s.coverage.percent !== null && s.coverage.percent < 50) {
    statusBarItem.backgroundColor = undefined;
    statusBarItem.color = new vscode.ThemeColor('errorForeground');
  } else {
    statusBarItem.backgroundColor = undefined;
    statusBarItem.color = undefined;
  }
  
  statusBarItem.tooltip = tooltipParts.join('\n');
  // ALWAYS link to quick actions menu so users can access all features
  statusBarItem.command = 'preCr.showQuickActions';
}

/**
 * Get the status bar item (for direct manipulation if needed)
 */
export function getStatusBarItem(): vscode.StatusBarItem | undefined {
  return statusBarItem;
}
