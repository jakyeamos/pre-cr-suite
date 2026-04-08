/**
 * Coverage Feature Module
 * 
 * Handles:
 * - Loading coverage files
 * - Displaying line decorations
 * - Coverage tree view
 * - Status bar updates
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import type { CoverageFileResult, GetCoverageSummaryResult } from '@pre-cr/core';
import * as notify from '../utils/notifications';
import * as statusBar from '../utils/statusBar';
import * as git from '../utils/git';
import { state } from '../utils/state';
import { sendBetaRequestWithNotify } from '../utils/lsp';
import * as webview from '../utils/webview';

// Decoration types for coverage
let coveredDecoration: vscode.TextEditorDecorationType;
let uncoveredDecoration: vscode.TextEditorDecorationType;
let partialDecoration: vscode.TextEditorDecorationType;

interface CoverageViewData {
  fileName: string;
  lineRate: number;
  coveredLines: number;
  totalLines: number;
  uncoveredLines: number[];
}

interface ChangedFileCoverageView {
  file: string;
  coverage: number | null;
  coveredLines: number;
  totalLines: number;
}

export function registerCoverageFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  // Create decoration types
  createDecorations();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.loadCoverage', () => loadCoverage(client)),
    vscode.commands.registerCommand('preCr.clearCoverage', () => clearCoverage()),
    vscode.commands.registerCommand('preCr.toggleCoverageOverlay', () => toggleCoverageOverlay(client)),
    vscode.commands.registerCommand('preCr.showCoverageSummary', () => showCoverageSummary(client)),
    vscode.commands.registerCommand('preCr.showFileCoverage', () => showFileCoverage(client)),
    vscode.commands.registerCommand('preCr.checkChangesCoverage', () => checkChangesCoverage(client))
  );

  // Register tree view
  const treeProvider = new CoverageTreeProvider(client);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('preCr.coverage', treeProvider)
  );

  // Update decorations when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        updateDecorations(editor, client);
      }
    })
  );

  // Update decorations when document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === e.document) {
        updateDecorations(editor, client);
      }
    })
  );

  // Watch for coverage file changes
  const config = vscode.workspace.getConfiguration('preCr.coverage');
  if (config.get('autoLoad')) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/coverage/**');
    watcher.onDidChange(() => loadCoverage(client));
    watcher.onDidCreate(() => loadCoverage(client));
    context.subscriptions.push(watcher);
  }

  // Set context for when we have coverage
  vscode.commands.executeCommand('setContext', 'preCr.hasCoverage', false);
}

/**
 * Create decoration types based on configuration
 */
function createDecorations() {
  const config = vscode.workspace.getConfiguration('preCr.coverage.decorations');

  coveredDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: config.get('covered') || 'rgba(0, 255, 0, 0.1)',
    isWholeLine: true,
    overviewRulerColor: 'green',
    overviewRulerLane: vscode.OverviewRulerLane.Left
  });

  uncoveredDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: config.get('uncovered') || 'rgba(255, 0, 0, 0.1)',
    isWholeLine: true,
    overviewRulerColor: 'red',
    overviewRulerLane: vscode.OverviewRulerLane.Left
  });

  partialDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: config.get('partial') || 'rgba(255, 255, 0, 0.1)',
    isWholeLine: true,
    overviewRulerColor: 'yellow',
    overviewRulerLane: vscode.OverviewRulerLane.Left
  });
}

/**
 * Load coverage from file
 */
async function loadCoverage(client: LanguageClient) {
  const result = await sendBetaRequestWithNotify(client, '$/preCr/refreshCoverage', {}, 'Refresh coverage');
  if (!result) {
    return;
  }

  if (!result.success || !result.summary) {
    notify.showWarning('No configured coverage report is available yet.');
    return;
  }

  state.setCoverage({
    isLoaded: true,
    percent: result.summary.linePercentage,
    fileCount: result.summary.totalLines > 0 ? 1 : 0,
    isVisible: true,
    lastLoadedFile: result.coveragePath
  });

  vscode.commands.executeCommand('setContext', 'preCr.hasCoverage', true);
  statusBar.setCoverage(result.summary.linePercentage);

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    await updateDecorations(editor, client);
  }

  vscode.commands.executeCommand('preCr.coverage.refresh');
  notify.showSuccess(`Coverage refreshed: ${result.summary.linePercentage.toFixed(1)}%`, 4000);
}

/**
 * Toggle coverage overlay visibility (without clearing data)
 */
function toggleCoverageOverlay(client: LanguageClient) {
  const coverage = state.get('coverage');
  
  if (!coverage.isLoaded) {
    notify.showInfo('No coverage data loaded. Load coverage first.');
    return;
  }

  const nowVisible = !coverage.isVisible;
  state.setCoverage({ isVisible: nowVisible });

  if (nowVisible) {
    // Show decorations
    statusBar.setCoverage(coverage.percent);
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      void updateDecorations(editor, client);
    }
    notify.showInfo('Coverage overlay shown');
  } else {
    // Hide decorations but keep data
    statusBar.clearCoverage();
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(coveredDecoration, []);
      editor.setDecorations(uncoveredDecoration, []);
      editor.setDecorations(partialDecoration, []);
    }
    notify.showInfo('Coverage overlay hidden (data preserved)');
  }
}

/**
 * Clear coverage data and decorations
 */
function clearCoverage() {
  state.setCoverage({
    isLoaded: false,
    percent: null,
    fileCount: 0,
    isVisible: true,
    lastLoadedFile: null
  });
  vscode.commands.executeCommand('setContext', 'preCr.hasCoverage', false);
  
  // Clear status bar
  statusBar.clearCoverage();

  // Clear decorations from all editors
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(coveredDecoration, []);
    editor.setDecorations(uncoveredDecoration, []);
    editor.setDecorations(partialDecoration, []);
  }

  notify.showSuccess('Coverage cleared');
}

/**
 * Update decorations for an editor
 */
async function updateDecorations(editor: vscode.TextEditor, client: LanguageClient) {
  // Don't show decorations if toggled off
  const coverage = state.get('coverage');
  if (!coverage.isVisible) {
    return;
  }

  const uri = editor.document.uri.toString();

  try {
    const result = await sendBetaRequestWithNotify(client, '$/preCr/getCoverageDecorations', {
      textDocument: { uri }
    }, 'Coverage decorations');
    const decorations = result?.decorations ?? [];

    const covered: vscode.Range[] = [];
    const uncovered: vscode.Range[] = [];
    const partial: vscode.Range[] = [];

    for (const dec of decorations) {
      const range = new vscode.Range(
        dec.range.start.line,
        dec.range.start.character,
        dec.range.end.line,
        dec.range.end.character
      );

      switch (dec.status) {
        case 'covered':
          covered.push(range);
          break;
        case 'uncovered':
          uncovered.push(range);
          break;
        case 'partial':
          partial.push(range);
          break;
      }
    }

    editor.setDecorations(coveredDecoration, covered);
    editor.setDecorations(uncoveredDecoration, uncovered);
    editor.setDecorations(partialDecoration, partial);

  } catch (error) {
    console.error('Error updating decorations:', error);
  }
}

/**
 * Show coverage summary in a quick pick or notification
 */
async function showCoverageSummary(client: LanguageClient) {
  const result = await sendBetaRequestWithNotify(client, '$/preCr/getCoverageSummary', {}, 'Coverage summary');
  if (!result?.summary) {
    const action = await notify.showWarning('No coverage data is loaded yet.', undefined, 'Refresh Coverage');
    if (action === 'Refresh Coverage') {
      await loadCoverage(client);
    }
    return;
  }

  const summary = result.summary;
  const action = await notify.showInfo(
    `Coverage ${summary.linePercentage.toFixed(1)}% lines, ${summary.branchPercentage.toFixed(1)}% branches`,
    undefined,
    'Show Details'
  );

  if (action !== 'Show Details') {
    return;
  }

  const panel = webview.createWebviewPanel('preCrCoverage', 'Coverage Summary', vscode.ViewColumn.Two);
  panel.webview.html = getCoverageSummaryHtml(panel.webview, result);
}

/**
 * Generate HTML for coverage summary webview
 */
function getCoverageSummaryHtml(webviewInstance: vscode.Webview, result: GetCoverageSummaryResult): string {
  const summary = result.summary;
  if (!summary) {
    return webview.buildInfoWebview(webviewInstance, 'Coverage Summary', [
      { heading: 'No coverage loaded', content: 'Refresh coverage or run the Pre-CR check first.' }
    ]);
  }

  const rows = [
    ['Lines', `${summary.linePercentage.toFixed(1)}%`, `${summary.coveredLines}/${summary.totalLines}`],
    ['Branches', `${summary.branchPercentage.toFixed(1)}%`, `${summary.coveredBranches}/${summary.totalBranches}`],
    ['Functions', `${summary.functionPercentage.toFixed(1)}%`, `${summary.coveredFunctions}/${summary.totalFunctions}`]
  ];

  return webview.buildWebviewHtml({
    webview: webviewInstance,
    title: 'Coverage Summary',
    body: `
      <h1>Coverage Summary</h1>
      <div class="card">
        <p>${webview.escapeHtml(result.coveragePath ?? 'Configured coverage file')}</p>
      </div>
      <table>
        <thead>
          <tr><th>Metric</th><th>Coverage</th><th>Counts</th></tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${webview.escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `
  });
}

/**
 * Show coverage for current file
 */
async function showFileCoverage(client: LanguageClient) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    notify.showWarning('No active file');
    return;
  }

  try {
    const result = await sendBetaRequestWithNotify(client, '$/preCr/getCoverage', {
      uri: editor.document.uri.toString()
    }, 'File coverage');
    const coverage = result?.coverage;
    
    if (!coverage) {
      const action = await notify.showWarning(
        'No coverage data for this file. Load coverage first?',
        undefined,
        'Load Coverage'
      );
      if (action === 'Load Coverage') {
        await loadCoverage(client);
      }
      return;
    }

    // Calculate stats
    const coveredLines = Object.values(coverage.lines).filter((value) => value > 0).length;
    const totalLines = Object.keys(coverage.lines).length;
    const lineRate = totalLines > 0 ? (coveredLines / totalLines * 100) : 0;

    // Update decorations
    void updateDecorations(editor, client);

    // Show summary
    const panel = webview.createWebviewPanel('preCrFileCoverage', `Coverage: ${path.basename(editor.document.fileName)}`, vscode.ViewColumn.Two);

    panel.webview.html = getFileCoverageHtml(panel.webview, {
      fileName: editor.document.fileName,
      lineRate,
      coveredLines,
      totalLines,
      uncoveredLines: getUncoveredLineNumbers(coverage)
    });

  } catch (error) {
    notify.showError(`Error getting file coverage: ${error}`);
  }
}

/**
 * Check coverage for git changes
 */
async function checkChangesCoverage(client: LanguageClient) {
  const changedFiles = await git.getChangedFiles();
  
  if (changedFiles.length === 0) {
    notify.showInfo('No changed files detected');
    return;
  }

  try {
    const results: ChangedFileCoverageView[] = [];
    let totalCovered = 0;
    let totalLines = 0;

    for (const file of changedFiles) {
      const result = await sendBetaRequestWithNotify(client, '$/preCr/getCoverage', {
        uri: vscode.Uri.file(file.path).toString()
      }, 'Changed file coverage');
      const coverage = result?.coverage;
      if (coverage) {
        const coveredLines = Object.values(coverage.lines).filter((value) => value > 0).length;
        const fileLines = Object.keys(coverage.lines).length;
        totalCovered += coveredLines;
        totalLines += fileLines;

        results.push({
          file: file.path,
          coverage: fileLines > 0 ? (coveredLines / fileLines * 100) : 0,
          coveredLines,
          totalLines: fileLines
        });
      } else {
        results.push({
          file: file.path,
          coverage: null,
          coveredLines: 0,
          totalLines: 0
        });
      }
    }

    const overallRate = totalLines > 0 ? (totalCovered / totalLines * 100) : 0;

    // Show results
    const panel = webview.createWebviewPanel('preCrChangesCoverage', 'Coverage: Changed Files', vscode.ViewColumn.Two);

    panel.webview.html = getChangesCoverageHtml(panel.webview, results, overallRate);

  } catch (error) {
    notify.showError(`Error checking changes coverage: ${error}`);
  }
}

/**
 * Get uncovered line numbers
 */
function getUncoveredLineNumbers(coverage: CoverageFileResult['coverage']): number[] {
  if (!coverage) {
    return [];
  }
  const uncovered: number[] = [];
  for (const [line, count] of Object.entries(coverage.lines)) {
    if (count === 0) {
      uncovered.push(parseInt(line, 10));
    }
  }
  return uncovered.sort((a, b) => a - b);
}

/**
 * HTML for file coverage view
 */
function getFileCoverageHtml(webviewInstance: vscode.Webview, data: CoverageViewData): string {
  const rateClass = data.lineRate >= 80 ? 'good' : data.lineRate >= 50 ? 'warning' : 'bad';
  const uncoveredHtml = data.uncoveredLines.length > 0
    ? data.uncoveredLines.map((lineNumber) => `<span class="line-num">${lineNumber}</span>`).join(', ')
    : '<em>All lines covered!</em>';

  return webview.buildWebviewHtml({
    webview: webviewInstance,
    title: `Coverage: ${path.basename(data.fileName)}`,
    additionalStyles: `
      .big-stat { font-size: 3em; font-weight: bold; margin: 20px 0; }
      .good { color: #4caf50; }
      .warning { color: #ff9800; }
      .bad { color: #f44336; }
      .line-num {
        display: inline-block;
        background: var(--vscode-editor-background);
        padding: 2px 8px;
        margin: 2px;
        border-radius: 4px;
      }
    `,
    body: `
      <h1>${webview.escapeHtml(path.basename(data.fileName))}</h1>
      <div class="big-stat ${rateClass}">${data.lineRate.toFixed(1)}%</div>
      <p>${data.coveredLines} of ${data.totalLines} lines covered</p>
      <h2>Uncovered Lines</h2>
      <div>${uncoveredHtml}</div>
    `
  });
}

/**
 * HTML for changes coverage view
 */
function getChangesCoverageHtml(
  webviewInstance: vscode.Webview,
  results: ChangedFileCoverageView[],
  overallRate: number
): string {
  const rateClass = overallRate >= 80 ? 'good' : overallRate >= 50 ? 'warning' : 'bad';
  
  const filesHtml = results.map(r => {
    const fileClass = r.coverage === null ? 'unknown' : r.coverage >= 80 ? 'good' : r.coverage >= 50 ? 'warning' : 'bad';
    return `
      <div class="file ${fileClass}">
        <span class="name">${webview.escapeHtml(r.file)}</span>
        <span class="rate">${webview.escapeHtml(r.coverage !== null ? `${r.coverage.toFixed(0)}%` : 'No data')}</span>
      </div>
    `;
  }).join('');

  return webview.buildWebviewHtml({
    webview: webviewInstance,
    title: 'Coverage: Changed Files',
    additionalStyles: `
      .big-stat { font-size: 3em; font-weight: bold; margin: 20px 0; }
      .good { color: #4caf50; }
      .warning { color: #ff9800; }
      .bad { color: #f44336; }
      .unknown { color: var(--vscode-descriptionForeground); }
      .file {
        display: flex;
        justify-content: space-between;
        padding: 10px;
        margin: 5px 0;
        background: var(--vscode-editor-background);
        border-radius: 4px;
      }
      .file.good { border-left: 3px solid #4caf50; }
      .file.warning { border-left: 3px solid #ff9800; }
      .file.bad { border-left: 3px solid #f44336; }
      .file.unknown { border-left: 3px solid #666; }
      .rate { font-weight: bold; }
    `,
    body: `
      <h1>Changed Files Coverage</h1>
      <div class="big-stat ${rateClass}">${overallRate.toFixed(1)}%</div>
      <p>Overall coverage for ${results.length} changed file(s)</p>
      <h2>Files</h2>
      ${filesHtml}
    `
  });
}

/**
 * Tree view provider for coverage
 */
class CoverageTreeProvider implements vscode.TreeDataProvider<CoverageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CoverageTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private client: LanguageClient) {
    // Register refresh command
    vscode.commands.registerCommand('preCr.coverage.refresh', () => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CoverageTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CoverageTreeItem): Promise<CoverageTreeItem[]> {
    if (!element) {
      // Root level - get all files with coverage
      try {
        const result = await sendBetaRequestWithNotify(this.client, '$/preCr/getCoverageSummary', {}, 'Coverage summary');
        const summary = result?.summary;

        if (!summary) {
          return [new CoverageTreeItem('No coverage loaded', '', 0, vscode.TreeItemCollapsibleState.None)];
        }

        return [
          new CoverageTreeItem(
            `Lines: ${summary.linePercentage.toFixed(1)}%`,
            `${summary.coveredLines}/${summary.totalLines}`,
            summary.linePercentage,
            vscode.TreeItemCollapsibleState.None
          ),
          new CoverageTreeItem(
            `Branches: ${summary.branchPercentage.toFixed(1)}%`,
            `${summary.coveredBranches}/${summary.totalBranches}`,
            summary.branchPercentage,
            vscode.TreeItemCollapsibleState.None
          ),
          new CoverageTreeItem(
            `Functions: ${summary.functionPercentage.toFixed(1)}%`,
            '',
            summary.functionPercentage,
            vscode.TreeItemCollapsibleState.None
          )
        ];
      } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
        return [new CoverageTreeItem('Error loading coverage', '', 0, vscode.TreeItemCollapsibleState.None)];
      }
    }

    return [];
  }
}

class CoverageTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly detail: string,
    public readonly percentage: number,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.description = detail;
    
    // Set icon based on percentage
    if (percentage >= 80) {
      this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    } else if (percentage >= 50) {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
    } else if (percentage > 0) {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    } else {
      this.iconPath = new vscode.ThemeIcon('circle-outline');
    }
  }
}
