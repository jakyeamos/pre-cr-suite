import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import type { PreCrCheckResult, ProjectHealth } from '@pre-cr/core';

import * as notify from '../utils/notifications';
import { state } from '../utils/state';
import { sendBetaRequestWithNotify } from '../utils/lsp';
import * as webview from '../utils/webview';

let outputChannel: vscode.OutputChannel;
let isRunning = false;

function findProjectRoot(startPath: string): string {
  let current = startPath;

  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.pre-cr.json'))) {
      return current;
    }

    if (fs.existsSync(path.join(current, 'package.json')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }

    current = path.dirname(current);
  }

  return startPath;
}

function getWorkspaceRoot(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    notify.showError('No workspace folder open');
    return null;
  }

  return findProjectRoot(workspaceFolders[0].uri.fsPath);
}

export function registerPreCrCheckFeature(
  context: vscode.ExtensionContext,
  client: LanguageClient
): void {
  outputChannel = vscode.window.createOutputChannel('Pre-CR Check');
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.runPreCrCheck', async () => {
      await runPreCrCheck(client);
    }),
    vscode.commands.registerCommand('preCr.runFullCoverageCheck', async () => {
      await runPreCrCheck(client);
    }),
    vscode.commands.registerCommand('preCr.quickCoverageCheck', async () => {
      await refreshCoverage(client);
    }),
    vscode.commands.registerCommand('preCr.configureTestCommand', async () => {
      await openProjectConfig(client);
    }),
    vscode.commands.registerCommand('preCr.fixSetup', async () => {
      await showProjectHealth(client, true);
    })
  );
}

async function runPreCrCheck(client: LanguageClient): Promise<void> {
  if (isRunning) {
    notify.showWarning('Pre-CR Check is already running');
    return;
  }

  if (!getWorkspaceRoot()) {
    return;
  }

  isRunning = true;
  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine('== Pre-CR Check ==');

  try {
    const response = await sendBetaRequestWithNotify(client, '$/preCr/runPreCrCheck', {}, 'Pre-CR check');
    if (!response?.result) {
      return;
    }

    renderCheckOutput(response.result);
    applyCoverageState(response.result);

    if (response.result.coverageCheck) {
      await showUncoveredAsDiagnostics(response.result.coverageCheck.uncoveredDetails);
      const summary = response.result.coverageCheck;
      const message = summary.passed
        ? `Coverage ${summary.coveragePercent.toFixed(1)}% on changed lines`
        : `Coverage ${summary.coveragePercent.toFixed(1)}% is below ${summary.threshold}%`;
      if (summary.passed) {
        notify.showSuccess(message, 5000);
      } else {
        const action = await notify.showWarning(message, undefined, 'Fix Setup', 'Show Details');
        if (action === 'Fix Setup') {
          await showProjectHealth(client, true);
        } else if (action === 'Show Details') {
          outputChannel.show(true);
        }
      }
      return;
    }

    const action = await notify.showWarning('Pre-CR check could not complete. Review project health for setup issues.', undefined, 'Fix Setup', 'Show Details');
    if (action === 'Fix Setup') {
      await showProjectHealth(client, true);
    } else if (action === 'Show Details') {
      outputChannel.show(true);
    }
  } finally {
    isRunning = false;
  }
}

async function refreshCoverage(client: LanguageClient): Promise<void> {
  const refresh = await sendBetaRequestWithNotify(client, '$/preCr/refreshCoverage', {}, 'Refresh coverage');
  if (!refresh) {
    return;
  }

  if (!refresh.success || !refresh.summary) {
    state.setCoverage({
      isLoaded: false,
      percent: null,
      fileCount: 0,
      lastLoadedFile: null
    });
    const action = await notify.showWarning('No configured coverage report is available yet.', undefined, 'Fix Setup');
    if (action === 'Fix Setup') {
      await showProjectHealth(client, true);
    }
    return;
  }

  state.setCoverage({
    isLoaded: true,
    percent: refresh.summary.linePercentage,
    fileCount: refresh.summary.totalLines > 0 ? 1 : 0,
    lastLoadedFile: refresh.coveragePath
  });

  notify.showSuccess(`Coverage refreshed: ${refresh.summary.linePercentage.toFixed(1)}%`, 4000);
}

async function showProjectHealth(client: LanguageClient, openPanel = false): Promise<void> {
  const result = await sendBetaRequestWithNotify(client, '$/preCr/getProjectHealth', {}, 'Project health');
  if (!result) {
    return;
  }

  if (!openPanel) {
    const blockingIssues = result.health.issues.filter((issue) => issue.severity === 'error').length;
    if (blockingIssues === 0) {
      notify.showSuccess('Project health looks good', 4000);
      return;
    }
  }

  const panel = webview.createWebviewPanel(
    'preCrProjectHealth',
    'Pre-CR Setup Health',
    vscode.ViewColumn.Two
  );

  panel.webview.html = buildProjectHealthHtml(panel.webview, result.health);
}

async function openProjectConfig(client: LanguageClient): Promise<void> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const configPath = path.join(workspaceRoot, '.pre-cr.json');
  if (fs.existsSync(configPath)) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    await vscode.window.showTextDocument(document);
    return;
  }

  const health = await sendBetaRequestWithNotify(client, '$/preCr/getProjectHealth', {}, 'Project health');
  const coveragePaths = health?.health.config.coveragePaths ?? ['coverage/lcov.info'];
  const template = JSON.stringify({
    version: 1,
    testCommand: health?.health.framework.command ?? 'pnpm test -- --coverage',
    coveragePaths,
    coverageFormat: health?.health.config.coverageFormat ?? 'auto',
    threshold: health?.health.config.threshold ?? 80,
    excludePatterns: health?.health.config.excludePatterns ?? ['**/*.test.*', '**/*.spec.*'],
    checks: {
      coverage: true,
      security: false,
      checklist: false
    }
  }, null, 2);

  const document = await vscode.workspace.openTextDocument({
    language: 'json',
    content: template
  });
  await vscode.window.showTextDocument(document);
  notify.showInfo('Save this file as .pre-cr.json at the repo root to make VS Code and Neovim use the same workflow.');
}

function renderCheckOutput(result: PreCrCheckResult): void {
  outputChannel.appendLine('');
  outputChannel.appendLine(formatHealthBlock(result.health));
  outputChannel.appendLine('');

  if (result.testRun) {
    outputChannel.appendLine('Test Run');
    outputChannel.appendLine(`  Framework: ${result.testRun.framework ?? 'unknown'}`);
    outputChannel.appendLine(`  Command: ${result.testRun.command ?? 'n/a'}`);
    outputChannel.appendLine(`  Exit Code: ${result.testRun.exitCode}`);
    outputChannel.appendLine(`  Duration: ${(result.testRun.duration / 1000).toFixed(1)}s`);
    if (result.testRun.coveragePath) {
      outputChannel.appendLine(`  Coverage: ${result.testRun.coveragePath}`);
    }
    if (result.testRun.error) {
      outputChannel.appendLine(`  Error: ${result.testRun.error}`);
    }
    outputChannel.appendLine('');

    if (result.testRun.stdout.trim()) {
      outputChannel.appendLine('stdout');
      outputChannel.appendLine(result.testRun.stdout.trim());
      outputChannel.appendLine('');
    }

    if (result.testRun.stderr.trim()) {
      outputChannel.appendLine('stderr');
      outputChannel.appendLine(result.testRun.stderr.trim());
      outputChannel.appendLine('');
    }
  }

  if (result.coverageCheck) {
    outputChannel.appendLine('Coverage Result');
    outputChannel.appendLine(`  Passed: ${result.coverageCheck.passed ? 'yes' : 'no'}`);
    outputChannel.appendLine(`  Coverage: ${result.coverageCheck.coveragePercent.toFixed(1)}%`);
    outputChannel.appendLine(`  Threshold: ${result.coverageCheck.threshold}%`);
    outputChannel.appendLine(`  Changed Lines: ${result.coverageCheck.summary.totalChangedLines}`);
    outputChannel.appendLine(`  Covered Lines: ${result.coverageCheck.summary.coveredLines}`);
    outputChannel.appendLine(`  Uncovered Lines: ${result.coverageCheck.summary.uncoveredLines}`);
    outputChannel.appendLine('');

    if (result.coverageCheck.uncoveredDetails.length > 0) {
      outputChannel.appendLine('Uncovered Lines');
      for (const detail of result.coverageCheck.uncoveredDetails) {
        outputChannel.appendLine(`  - ${detail.file}:${detail.line} (${detail.reason})`);
      }
    }
  }
}

function applyCoverageState(result: PreCrCheckResult): void {
  if (!result.coverageCheck) {
    return;
  }

  state.setCoverage({
    isLoaded: true,
    percent: result.coverageCheck.coveragePercent,
    fileCount: result.coverageCheck.fileBreakdown.length,
    lastLoadedFile: result.coveragePath
  });
}

function formatHealthBlock(health: ProjectHealth): string {
  const lines = [
    'Project Health',
    `  Ready: ${health.ready ? 'yes' : 'no'}`,
    `  Config: ${health.configPath ?? 'defaults only'}`,
    `  Framework: ${health.framework.name ?? 'not resolved'}`,
    `  Coverage: ${health.coverage.path ?? 'not loaded'}`
  ];

  for (const warning of health.warnings) {
    lines.push(`  Warning: ${warning}`);
  }

  for (const issue of health.issues) {
    lines.push(`  ${issue.severity.toUpperCase()}: ${issue.message}`);
    if (issue.hint) {
      lines.push(`    ${issue.hint}`);
    }
  }

  return lines.join('\n');
}

function buildProjectHealthHtml(webviewInstance: vscode.Webview, health: ProjectHealth): string {
  const issueCards = health.issues.length > 0
    ? health.issues.map((issue) => `
      <div class="card ${issue.severity}">
        <h3>${webview.escapeHtml(issue.message)}</h3>
        ${issue.hint ? `<p>${webview.escapeHtml(issue.hint)}</p>` : ''}
        ${issue.suggestedCommand ? `<pre>${webview.escapeHtml(issue.suggestedCommand)}</pre>` : ''}
      </div>
    `).join('')
    : '<div class="card success"><h3>Ready for beta workflow</h3><p>The repo-configured coverage flow is available in this workspace.</p></div>';

  const warnings = health.warnings.map((warning) => `<li>${webview.escapeHtml(warning)}</li>`).join('');
  const coverageText = health.coverage.summary
    ? `${health.coverage.summary.linePercentage.toFixed(1)}% across ${health.coverage.summary.totalLines} lines`
    : 'No coverage summary loaded yet';

  return webview.buildWebviewHtml({
    webview: webviewInstance,
    title: 'Pre-CR Setup Health',
    additionalStyles: `
      .grid { display: grid; gap: 16px; }
      .card.error { border-left: 4px solid var(--vscode-errorForeground); }
      .card.warning { border-left: 4px solid var(--vscode-editorWarning-foreground); }
      .card.success { border-left: 4px solid var(--vscode-testing-iconPassed); }
      pre { background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; overflow-x: auto; }
      .meta { color: var(--vscode-descriptionForeground); }
    `,
    body: `
      <h1>Pre-CR Setup Health</h1>
      <div class="grid">
        <div class="card">
          <h3>Repo Config</h3>
          <p>${webview.escapeHtml(health.configPath ?? 'No .pre-cr.json yet')}</p>
          <p class="meta">Framework: ${webview.escapeHtml(health.framework.command ?? 'not resolved')}</p>
          <p class="meta">Coverage: ${webview.escapeHtml(coverageText)}</p>
        </div>
        ${issueCards}
        ${warnings ? `<div class="card"><h3>Warnings</h3><ul>${warnings}</ul></div>` : ''}
      </div>
    `
  });
}

async function showUncoveredAsDiagnostics(details: Array<{ file: string; line: number }>): Promise<void> {
  const collection = vscode.languages.createDiagnosticCollection('preCr-coverage');
  const grouped = new Map<string, vscode.Diagnostic[]>();

  for (const detail of details) {
    const existing = grouped.get(detail.file) ?? [];
    existing.push(new vscode.Diagnostic(
      new vscode.Range(detail.line - 1, 0, detail.line - 1, 1000),
      'Line not covered by tests',
      vscode.DiagnosticSeverity.Warning
    ));
    grouped.set(detail.file, existing);
  }

  for (const [file, diagnostics] of grouped) {
    const matches = await vscode.workspace.findFiles(`**/${path.basename(file)}`, undefined, 1);
    if (matches.length > 0) {
      collection.set(matches[0], diagnostics);
    }
  }

  setTimeout(() => {
    collection.clear();
    collection.dispose();
  }, 60000);
}
