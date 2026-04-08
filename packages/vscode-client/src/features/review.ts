/**
 * Review Optimization Feature Module
 * 
 * Handles:
 * - Review time estimation
 * - Flaky test detection
 * - Reviewer suggestions
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import * as notify from '../utils/notifications';
import * as git from '../utils/git';

export function registerReviewFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.estimateReviewTime', () => estimateReviewTime(client)),
    vscode.commands.registerCommand('preCr.showFlakyTests', () => showFlakyTests(client))
  );

  // Register flaky tests tree view
  const treeProvider = new FlakyTestsTreeProvider(client);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('preCr.flakyTests', treeProvider)
  );

  // Initialize flaky test detective
  initFlakyDetective(client);
}

/**
 * Initialize the flaky test detective
 */
async function initFlakyDetective(client: LanguageClient) {
  const config = vscode.workspace.getConfiguration('preCr.flakyTests');
  
  if (!config.get('enabled')) return;

  try {
    await client.sendRequest('$/preCr/initFlakyDetective', {
      config: {
        minRuns: config.get('minRuns'),
        flakinessThreshold: config.get('threshold')
      }
    });
  } catch (error) {
    console.error('Failed to initialize flaky detective:', error);
  }
}

/**
 * Estimate review time for current changes
 */
async function estimateReviewTime(client: LanguageClient) {
  const changes = await git.getChangedFilesWithContent();

  if (changes.length === 0) {
    notify.showInfo('No changed files detected');
    return;
  }

  try {
    const result = await client.sendRequest('$/preCr/estimateReviewTime', {
      changes
    });

    const estimate = (result as any).estimate;
    if (!estimate) {
      throw new Error((result as any).error);
    }

    // Show result with option to copy title prefix
    const action = await notify.showInfo(
      `Estimated review time: ${estimate.formatted} (${estimate.confidence} confidence)`,
      undefined,
      'Copy Title Prefix',
      'Show Details'
    );

    if (action === 'Copy Title Prefix') {
      await vscode.env.clipboard.writeText(estimate.titlePrefix);
      notify.showSuccess('Copied to clipboard');
    } else if (action === 'Show Details') {
      showReviewTimeDetails(estimate);
    }

  } catch (error) {
    notify.showError(`Estimation failed: ${error}`);
  }
}

/**
 * Show flaky tests panel
 */
async function showFlakyTests(client: LanguageClient) {
  try {
    const result = await client.sendRequest('$/preCr/getFlakyTestReport', {});
    const report = (result as any).report;

    if (!report) {
      notify.showInfo('No flaky test data available. Run tests first.');
      return;
    }

    if (report.flakyCount === 0) {
      notify.showSuccess(`No flaky tests! Health: ${report.healthScore}/100`);
      return;
    }

    showFlakyTestReport(report);

  } catch (error) {
    notify.showError(`Failed to get flaky tests: ${error}`);
  }
}

/**
 * Show review time details
 */
function showReviewTimeDetails(estimate: any) {
  const panel = vscode.window.createWebviewPanel(
    'preCrReviewTime',
    'Review Time Estimate',
    vscode.ViewColumn.Two,
    {}
  );

  const filesHtml = (estimate.fileBreakdown || []).map((f: any) => `
    <tr>
      <td>${f.path}</td>
      <td>${f.category}</td>
      <td>${f.complexity}</td>
      <td>${f.linesChanged}</td>
      <td>${f.estimatedMinutes} min</td>
    </tr>
  `).join('');

  const warningsHtml = (estimate.warnings || []).map((w: string) => `
    <div class="warning">⚠️ ${w}</div>
  `).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    .total { font-size: 2em; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
    th { background: var(--vscode-editor-background); }
    .warning { 
      padding: 10px; 
      margin: 5px 0; 
      background: rgba(255, 152, 0, 0.1);
      border-left: 3px solid #ff9800;
      border-radius: 4px;
    }
    .prefix {
      background: var(--vscode-textCodeBlock-background);
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <h1>Review Time Estimate</h1>
  
  <div class="total">
    <strong>${estimate.formatted}</strong>
    <small>(${estimate.confidence} confidence)</small>
  </div>

  <h2>Suggested PR Title Prefix</h2>
  <div class="prefix">${estimate.titlePrefix}</div>

  ${warningsHtml ? `<h2>Warnings</h2>${warningsHtml}` : ''}

  <h2>File Breakdown</h2>
  <table>
    <tr>
      <th>File</th>
      <th>Category</th>
      <th>Complexity</th>
      <th>Lines</th>
      <th>Time</th>
    </tr>
    ${filesHtml}
  </table>
</body>
</html>`;
}

/**
 * Show flaky test report
 */
function showFlakyTestReport(report: any) {
  const panel = vscode.window.createWebviewPanel(
    'preCrFlakyTests',
    'Flaky Tests Report',
    vscode.ViewColumn.Two,
    {}
  );

  const testsHtml = (report.flakyTests || []).map((t: any) => `
    <div class="test">
      <div class="test-name">${t.name}</div>
      <div class="test-file">${t.file}</div>
      <div class="test-stats">
        <span class="score">Flakiness: ${(t.flakinessScore * 100).toFixed(0)}%</span>
        <span>Runs: ${t.totalRuns}</span>
        <span>Failures: ${t.failures}</span>
      </div>
    </div>
  `).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .summary-item { 
      padding: 15px 25px; 
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }
    .test {
      padding: 15px;
      margin: 10px 0;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      border-left: 3px solid #ff9800;
    }
    .test-name { font-weight: bold; font-size: 1.1em; }
    .test-file { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .test-stats { margin-top: 10px; display: flex; gap: 15px; }
    .score { color: #ff9800; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Flaky Tests Report</h1>
  
  <div class="summary">
    <div class="summary-item">
      <strong>Health Score</strong><br>
      <span style="font-size: 2em;">${report.healthScore}/100</span>
    </div>
    <div class="summary-item">
      <strong>Flaky Tests</strong><br>
      <span style="font-size: 2em;">${report.flakyCount}</span>
    </div>
    <div class="summary-item">
      <strong>Total Tracked</strong><br>
      <span style="font-size: 2em;">${report.totalTests}</span>
    </div>
  </div>

  <h2>Flaky Tests</h2>
  ${testsHtml || '<p>No flaky tests detected</p>'}

  ${report.recommendations?.length > 0 ? `
    <h2>Recommendations</h2>
    <ul>
      ${report.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
    </ul>
  ` : ''}
</body>
</html>`;
}

/**
 * Tree view provider for flaky tests
 */
class FlakyTestsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
      const result = await this.client.sendRequest('$/preCr/getFlakyTests', {});
      const tests = (result as any).tests || [];

      if (tests.length === 0) {
        const item = new vscode.TreeItem('No flaky tests detected');
        item.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
        return [item];
      }

      return tests.map((t: any) => {
        const item = new vscode.TreeItem(t.name);
        item.description = `${(t.flakinessScore * 100).toFixed(0)}% flaky`;
        item.tooltip = `${t.file}\nRuns: ${t.totalRuns}, Failures: ${t.failures}`;
        item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
        return item;
      });

    } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
      const item = new vscode.TreeItem('Run tests to detect flaky tests');
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }
  }
}
