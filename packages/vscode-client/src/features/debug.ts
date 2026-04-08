/**
 * Debug Intelligence Feature Module
 * 
 * Handles:
 * - Debug session capture
 * - Session analysis
 * - Pattern detection
 * - Debug sessions tree view
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import * as notify from '../utils/notifications';
import * as statusBar from '../utils/statusBar';
import * as webview from '../utils/webview';

let isCapturing = false;
let captureStartTime: number | undefined;
let captureTimerInterval: NodeJS.Timeout | undefined;
let breakpointHitCount = 0;

/** Check if currently capturing a debug session */
export function isDebugCapturing(): boolean {
  return isCapturing;
}

export function registerDebugFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  // Set initial capture state
  vscode.commands.executeCommand('setContext', 'preCr.isCapturing', false);

  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.startDebugCapture', () => startDebugCapture(client)),
    vscode.commands.registerCommand('preCr.stopDebugCapture', () => stopDebugCapture(client)),
    vscode.commands.registerCommand('preCr.discardDebugCapture', () => discardDebugCapture(client)),
    vscode.commands.registerCommand('preCr.analyzeDebugSession', () => analyzeDebugSession(client))
  );

  // Register tree view
  const treeProvider = new DebugSessionsTreeProvider(client);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('preCr.debugSessions', treeProvider)
  );

  // Cleanup timer on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (captureTimerInterval) {
        clearInterval(captureTimerInterval);
        captureTimerInterval = undefined;
      }
    }
  });

  // Initialize debug manager
  initDebugManager(client);

  // Hook into debug events
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(session => onDebugStart(client, session)),
    vscode.debug.onDidTerminateDebugSession(session => onDebugEnd(client, session)),
    vscode.debug.onDidReceiveDebugSessionCustomEvent(e => onDebugEvent(client, e))
  );
}

/**
 * Initialize debug manager
 */
async function initDebugManager(client: LanguageClient) {
  const config = vscode.workspace.getConfiguration('preCr.debug');

  try {
    await client.sendRequest('$/preCr/initDebugManager', {
      config: {
        captureConsole: config.get('captureConsole'),
        maxBreakpointHits: config.get('maxBreakpointHits')
      }
    });
  } catch (error) {
    console.error('Failed to initialize debug manager:', error);
  }
}

/**
 * Start debug capture
 */
async function startDebugCapture(client: LanguageClient) {
  const sessionName = await vscode.window.showInputBox({
    prompt: 'Name for this debug session',
    placeHolder: 'e.g., Debugging login issue'
  });

  if (!sessionName) return;

  const activeSession = vscode.debug.activeDebugSession;
  const debugType = activeSession?.type || 'manual';

  try {
    const result = await client.sendRequest('$/preCr/startDebugSession', {
      name: sessionName,
      debugType,
      launchConfig: activeSession?.configuration
    });

    const session = (result as any).session;
    if (session) {
      isCapturing = true;
      captureStartTime = Date.now();
      breakpointHitCount = 0;
      vscode.commands.executeCommand('setContext', 'preCr.isCapturing', true);
      startCaptureTimer();
      notify.showSuccess(`Started capturing: ${sessionName}`);
    } else {
      throw new Error((result as any).error);
    }

  } catch (error) {
    notify.showError(`Failed to start capture: ${error}`);
  }
}

/**
 * Stop debug capture and save session
 */
async function stopDebugCapture(client: LanguageClient) {
  try {
    const result = await client.sendRequest('$/preCr/endDebugSession', {
      outcome: 'success'
    });

    const session = (result as any).session;
    stopCaptureTimer();

    if (session) {
      const action = await notify.showInfo(
        `Debug session captured (${Math.round(session.duration / 1000)}s)`,
        undefined,
        'Analyze'
      );

      if (action === 'Analyze') {
        analyzeSession(client, session.id);
      }
    }

  } catch (error) {
    notify.showError(`Failed to stop capture: ${error}`);
    stopCaptureTimer();
  }
}

/**
 * Discard debug capture without saving
 */
async function discardDebugCapture(client: LanguageClient) {
  const confirm = await vscode.window.showWarningMessage(
    'Discard this debug session without saving?',
    { modal: true },
    'Discard'
  );

  if (confirm !== 'Discard') return;

  try {
    await client.sendRequest('$/preCr/endDebugSession', {
      outcome: 'discarded'
    });
    stopCaptureTimer();
    notify.showInfo('Debug session discarded');
  } catch (error) {
    stopCaptureTimer();
  }
}

/**
 * Start the capture timer
 */
function startCaptureTimer() {
  captureTimerInterval = setInterval(() => {
    if (captureStartTime) {
      const elapsed = Math.floor((Date.now() - captureStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = minutes > 0 
        ? `${minutes}:${seconds.toString().padStart(2, '0')}`
        : `${seconds}s`;
      statusBar.updateRecordingTime(timeStr, breakpointHitCount);
    }
  }, 1000);
  statusBar.setRecording(true, '0s', 0);
}

/**
 * Stop the capture timer
 */
function stopCaptureTimer() {
  isCapturing = false;
  vscode.commands.executeCommand('setContext', 'preCr.isCapturing', false);
  if (captureTimerInterval) {
    clearInterval(captureTimerInterval);
    captureTimerInterval = undefined;
  }
  captureStartTime = undefined;
  breakpointHitCount = 0;
  statusBar.setRecording(false);
}

/**
 * Analyze a debug session
 */
async function analyzeDebugSession(client: LanguageClient) {
  // Get list of sessions
  const result = await client.sendRequest('$/preCr/listDebugSessions', {});
  const sessions = (result as any).sessions || [];

  if (sessions.length === 0) {
    notify.showInfo('No debug sessions recorded');
    return;
  }

  // Let user pick one
  const items: (vscode.QuickPickItem & { sessionId: string })[] = sessions.map((s: any) => ({
    label: s.name,
    description: s.debugType,
    detail: `${new Date(s.startTime).toLocaleString()} - ${s.breakpointHits} hits, ${s.exceptions} exceptions`,
    sessionId: s.id
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select session to analyze'
  });

  if (selected) {
    analyzeSession(client, selected.sessionId);
  }
}

/**
 * Analyze a specific session
 */
async function analyzeSession(client: LanguageClient, sessionId: string) {
  try {
    const result = await client.sendRequest('$/preCr/analyzeDebugSession', { sessionId });
    const analysis = (result as any).analysis;

    if (!analysis) {
      throw new Error((result as any).error);
    }

    showAnalysisReport(analysis);

  } catch (error) {
    notify.showError(`Analysis failed: ${error}`);
  }
}

/**
 * Handle debug session start
 */
function onDebugStart(client: LanguageClient, session: vscode.DebugSession) {
  if (!isCapturing) return;

  // Could auto-start capture here if configured
  console.log(`Debug session started: ${session.name}`);
}

/**
 * Handle debug session end
 */
function onDebugEnd(client: LanguageClient, session: vscode.DebugSession) {
  if (isCapturing) {
    // Ask user if they want to stop capture
    notify.showInfo(
      'Debug session ended. What would you like to do?',
      undefined,
      'Save & Analyze',
      'Discard'
    ).then(action => {
      if (action === 'Save & Analyze') {
        stopDebugCapture(client);
      } else if (action === 'Discard') {
        discardDebugCapture(client);
      }
    });
  }
}

/**
 * Handle custom debug events
 */
async function onDebugEvent(client: LanguageClient, event: vscode.DebugSessionCustomEvent) {
  if (!isCapturing) return;

  // Handle stopped events (breakpoints, exceptions)
  if (event.event === 'stopped') {
    const body = event.body;
    
    if (body.reason === 'breakpoint' || body.reason === 'step') {
      breakpointHitCount++;
      // Record step
      await client.sendRequest('$/preCr/recordDebugStep', {
        type: body.reason === 'breakpoint' ? 'breakpoint' : 'step-over',
        location: {
          file: 'unknown', // Would need to query stack trace
          line: 0
        }
      });
    } else if (body.reason === 'exception') {
      // Record exception
      await client.sendRequest('$/preCr/recordException', {
        type: body.exceptionId || 'Error',
        message: body.description || 'Unknown error',
        stackTrace: []
      });
    }
  }
}

/**
 * Show analysis report
 */
function showAnalysisReport(analysis: any) {
  const panel = webview.createWebviewPanel(
    'preCrDebugAnalysis',
    'Debug Session Analysis',
    vscode.ViewColumn.Two
  );

  // Build patterns HTML with escaping
  const patternsHtml = (analysis.patterns || []).map((p: any) => `
    <div class="pattern ${webview.escapeHtml(p.confidence)}">
      <div class="pattern-type">${webview.escapeHtml(p.type)}</div>
      <div class="pattern-desc">${webview.escapeHtml(p.description)}</div>
      <div class="pattern-suggestion">💡 ${webview.escapeHtml(p.suggestion)}</div>
    </div>
  `).join('');

  // Build hot spots HTML with escaping
  const hotSpotsHtml = (analysis.hotSpots || []).slice(0, 5).map((h: any) => `
    <tr>
      <td>${webview.escapeHtml(h.file)}</td>
      <td>${h.line}</td>
      <td>${h.hitCount}</td>
    </tr>
  `).join('');

  // Build recommendations HTML with escaping
  const recsHtml = (analysis.recommendations || []).map((r: string) => `
    <li>${webview.escapeHtml(r)}</li>
  `).join('');

  const additionalStyles = `
    .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
    .summary-item { 
      padding: 15px 25px; 
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      min-width: 120px;
    }
    .summary-item strong { display: block; margin-bottom: 8px; }
    .pattern {
      padding: 15px;
      margin: 10px 0;
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }
    .pattern.high { border-left: 3px solid var(--vscode-editorError-foreground); }
    .pattern.medium { border-left: 3px solid var(--vscode-editorWarning-foreground); }
    .pattern.low { border-left: 3px solid var(--vscode-editorInfo-foreground); }
    .pattern-type { font-weight: bold; text-transform: uppercase; font-size: 0.9em; }
    .pattern-desc { margin: 10px 0; }
    .pattern-suggestion { 
      color: var(--vscode-textLink-foreground);
      font-style: italic;
    }
  `;

  const body = `
    <h1>Debug Session Analysis</h1>

    <div class="summary">
      <div class="summary-item">
        <strong>Duration</strong>
        ${Math.round(analysis.duration / 1000)}s
      </div>
      <div class="summary-item">
        <strong>Breakpoint Hits</strong>
        ${analysis.breakpointHitCount}
      </div>
      <div class="summary-item">
        <strong>Files Visited</strong>
        ${analysis.filesVisited?.length || 0}
      </div>
      <div class="summary-item">
        <strong>Patterns Found</strong>
        ${analysis.patterns?.length || 0}
      </div>
    </div>

    ${analysis.patterns?.length > 0 ? `
      <h2>Detected Patterns</h2>
      ${patternsHtml}
    ` : ''}

    ${analysis.hotSpots?.length > 0 ? `
      <h2>Hot Spots</h2>
      <table>
        <thead><tr><th>File</th><th>Line</th><th>Hits</th></tr></thead>
        <tbody>${hotSpotsHtml}</tbody>
      </table>
    ` : ''}

    ${analysis.recommendations?.length > 0 ? `
      <h2>Recommendations</h2>
      <ul>${recsHtml}</ul>
    ` : ''}
  `;

  panel.webview.html = webview.buildWebviewHtml({
    webview: panel.webview,
    title: 'Debug Session Analysis',
    body,
    additionalStyles
  });
}

/**
 * Tree view provider for debug sessions
 */
class DebugSessionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private client: LanguageClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    try {
      const result = await this.client.sendRequest('$/preCr/listDebugSessions', {});
      const sessions = (result as any).sessions || [];

      if (sessions.length === 0) {
        const item = new vscode.TreeItem('No debug sessions recorded');
        item.iconPath = new vscode.ThemeIcon('debug');
        return [item];
      }

      return sessions.map((s: any) => {
        const item = new vscode.TreeItem(s.name);
        item.description = `${s.breakpointHits} hits`;
        item.tooltip = `${s.debugType} - ${new Date(s.startTime).toLocaleString()}`;
        item.iconPath = new vscode.ThemeIcon(
          s.outcome === 'error' ? 'debug-disconnect' : 'debug-alt',
          s.outcome === 'error' ? new vscode.ThemeColor('testing.iconFailed') : undefined
        );
        item.command = {
          command: 'preCr.analyzeDebugSession',
          title: 'Analyze',
          arguments: [s.id]
        };
        return item;
      });

    } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
      return [];
    }
  }
}
