/**
 * Dashboard Webview
 * 
 * Provides a unified view of all Pre-CR Suite status:
 * - Coverage summary
 * - Security scan results
 * - Context/snapshot status
 * - Debug session info
 * - Quick actions
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { state, ExtensionState } from '../utils/state';
import { escapeHtml, generateNonce } from '../utils/webview';

let dashboardPanel: vscode.WebviewPanel | undefined;
let stateSubscription: vscode.Disposable | undefined;

export function registerDashboardFeature(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.showDashboard', () => {
      showDashboard(context, client);
    })
  );
}

/**
 * Show or focus the dashboard panel
 */
function showDashboard(context: vscode.ExtensionContext, client: LanguageClient) {
  if (dashboardPanel) {
    dashboardPanel.reveal();
    return;
  }

  dashboardPanel = vscode.window.createWebviewPanel(
    'preCrDashboard',
    'Pre-CR Suite Dashboard',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  // Update content initially
  updateDashboardContent(client);

  // Subscribe to state changes
  stateSubscription = state.subscribeAll(() => {
    updateDashboardContent(client);
  });

  // Handle messages from webview
  dashboardPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'runSecurityScan':
          vscode.commands.executeCommand('preCr.quickSecurityScan');
          break;
        case 'loadCoverage':
          vscode.commands.executeCommand('preCr.loadCoverage');
          break;
        case 'generateDocs':
          vscode.commands.executeCommand('preCr.generateDocs');
          break;
        case 'runChecklist':
          vscode.commands.executeCommand('preCr.runChecklist');
          break;
        case 'captureContext':
          vscode.commands.executeCommand('preCr.captureContext');
          break;
        case 'restoreContext':
          vscode.commands.executeCommand('preCr.restoreContext');
          break;
        case 'startDebug':
          vscode.commands.executeCommand('preCr.startDebugCapture');
          break;
        case 'stopDebug':
          vscode.commands.executeCommand('preCr.stopDebugCapture');
          break;
        case 'openSettings':
          vscode.commands.executeCommand('preCr.openSettings');
          break;
        case 'refresh':
          updateDashboardContent(client);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  // Clean up on close
  dashboardPanel.onDidDispose(() => {
    dashboardPanel = undefined;
    stateSubscription?.dispose();
    stateSubscription = undefined;
  });
}

/**
 * Update dashboard content based on current state
 */
function updateDashboardContent(client: LanguageClient) {
  if (!dashboardPanel) return;

  const currentState = state.getState();
  dashboardPanel.webview.html = getDashboardHtml(currentState);
}

/**
 * Generate dashboard HTML
 */
function getDashboardHtml(s: ExtensionState): string {
  const nonce = generateNonce();

  // Coverage card
  const coverageStatus = s.coverage.isLoaded
    ? `<span class="status-badge ${getStatusClass(s.coverage.percent || 0)}">${s.coverage.percent?.toFixed(0)}%</span>`
    : '<span class="status-badge neutral">Not loaded</span>';
  
  const coverageDetails = s.coverage.isLoaded
    ? `<p>${s.coverage.fileCount} files analyzed</p>`
    : '<p>Load a coverage file to see results</p>';

  // Security card
  const securityStatus = s.security.issueCount > 0
    ? `<span class="status-badge bad">${s.security.issueCount} issue${s.security.issueCount !== 1 ? 's' : ''}</span>`
    : s.security.lastScanTime
      ? '<span class="status-badge good">No issues</span>'
      : '<span class="status-badge neutral">Not scanned</span>';

  const securityDetails = s.security.lastScanTime
    ? `<p>Last scan: ${formatTime(s.security.lastScanTime)} (${s.security.lastScanScope})</p>`
    : '<p>Run a security scan to check for issues</p>';

  // Context card
  const contextStatus = s.context.hasSnapshot
    ? '<span class="status-badge good">Saved</span>'
    : '<span class="status-badge neutral">No snapshot</span>';

  const contextDetails = s.context.currentBranch
    ? `<p>Branch: <code>${escapeHtml(s.context.currentBranch)}</code></p>`
    : '<p>Not in a git repository</p>';

  // Debug card
  const debugStatus = s.debug.isRecording
    ? `<span class="status-badge recording">Recording ${s.debug.elapsedTime}</span>`
    : '<span class="status-badge neutral">Idle</span>';

  const debugDetails = s.debug.isRecording
    ? `<p>${s.debug.hitCount} breakpoint hits captured</p>`
    : '<p>Start a debug capture session</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Pre-CR Dashboard</title>
  <style nonce="${nonce}">
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border-color: var(--vscode-panel-border);
      --accent-color: var(--vscode-button-background);
      --good-color: #4caf50;
      --warning-color: #ff9800;
      --bad-color: #f44336;
      --recording-color: #e53935;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 20px;
      line-height: 1.5;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .card-header h2 {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-icon {
      opacity: 0.7;
    }

    .card-body {
      color: var(--text-secondary);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .card-body p {
      margin: 4px 0;
    }

    .card-body code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
    }

    .card-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .status-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 12px;
      text-transform: uppercase;
    }

    .status-badge.good {
      background: rgba(76, 175, 80, 0.2);
      color: var(--good-color);
    }

    .status-badge.warning {
      background: rgba(255, 152, 0, 0.2);
      color: var(--warning-color);
    }

    .status-badge.bad {
      background: rgba(244, 67, 54, 0.2);
      color: var(--bad-color);
    }

    .status-badge.neutral {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .status-badge.recording {
      background: rgba(229, 57, 53, 0.2);
      color: var(--recording-color);
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    button {
      font-family: inherit;
      font-size: 12px;
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      transition: background 0.2s;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    button.danger {
      background: var(--bad-color);
      color: white;
    }

    .quick-actions {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
    }

    .quick-actions h3 {
      font-size: 14px;
      margin-bottom: 12px;
      color: var(--text-secondary);
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .lsp-status {
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .lsp-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--good-color);
    }

    .lsp-dot.disconnected {
      background: var(--bad-color);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      <span>⚡</span>
      Pre-CR Suite
    </h1>
    <div class="header-actions">
      <div class="lsp-status">
        <span class="lsp-dot ${s.isLspConnected ? '' : 'disconnected'}"></span>
        LSP ${s.isLspConnected ? 'Connected' : 'Disconnected'}
      </div>
      <button class="secondary" onclick="refresh()">↻ Refresh</button>
      <button class="secondary" onclick="openSettings()">⚙ Settings</button>
    </div>
  </div>

  <div class="grid">
    <!-- Coverage Card -->
    <div class="card">
      <div class="card-header">
        <h2><span class="card-icon">📊</span> Coverage</h2>
        ${coverageStatus}
      </div>
      <div class="card-body">
        ${coverageDetails}
      </div>
      <div class="card-actions">
        <button onclick="loadCoverage()">Load Coverage</button>
      </div>
    </div>

    <!-- Security Card -->
    <div class="card">
      <div class="card-header">
        <h2><span class="card-icon">🛡️</span> Security</h2>
        ${securityStatus}
      </div>
      <div class="card-body">
        ${securityDetails}
      </div>
      <div class="card-actions">
        <button onclick="runSecurityScan()">Run Scan</button>
      </div>
    </div>

    <!-- Context Card -->
    <div class="card">
      <div class="card-header">
        <h2><span class="card-icon">📍</span> Context</h2>
        ${contextStatus}
      </div>
      <div class="card-body">
        ${contextDetails}
      </div>
      <div class="card-actions">
        <button onclick="captureContext()">Save Snapshot</button>
        ${s.context.hasSnapshot ? '<button class="secondary" onclick="restoreContext()">Restore</button>' : ''}
      </div>
    </div>

    <!-- Debug Card -->
    <div class="card">
      <div class="card-header">
        <h2><span class="card-icon">🐛</span> Debug Capture</h2>
        ${debugStatus}
      </div>
      <div class="card-body">
        ${debugDetails}
      </div>
      <div class="card-actions">
        ${s.debug.isRecording 
          ? '<button class="danger" onclick="stopDebug()">Stop Recording</button>'
          : '<button onclick="startDebug()">Start Capture</button>'
        }
      </div>
    </div>
  </div>

  <div class="quick-actions">
    <h3>Quick Actions</h3>
    <div class="action-buttons">
      <button onclick="runChecklist()">📋 PR Checklist</button>
      <button onclick="generateDocs()">📝 Generate Docs</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function runSecurityScan() {
      vscode.postMessage({ command: 'runSecurityScan' });
    }

    function loadCoverage() {
      vscode.postMessage({ command: 'loadCoverage' });
    }

    function generateDocs() {
      vscode.postMessage({ command: 'generateDocs' });
    }

    function runChecklist() {
      vscode.postMessage({ command: 'runChecklist' });
    }

    function captureContext() {
      vscode.postMessage({ command: 'captureContext' });
    }

    function restoreContext() {
      vscode.postMessage({ command: 'restoreContext' });
    }

    function startDebug() {
      vscode.postMessage({ command: 'startDebug' });
    }

    function stopDebug() {
      vscode.postMessage({ command: 'stopDebug' });
    }

    function openSettings() {
      vscode.postMessage({ command: 'openSettings' });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
}

/**
 * Get status class based on percentage
 */
function getStatusClass(percent: number): string {
  if (percent >= 80) return 'good';
  if (percent >= 50) return 'warning';
  return 'bad';
}

/**
 * Format time relative to now
 */
function formatTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}
