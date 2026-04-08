/**
 * Checklist Feature Module
 * 
 * Handles:
 * - Running PR checklists
 * - Security scanning
 * - Checklist tree view
 * - Quick fixes
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import * as notify from '../utils/notifications';
import * as git from '../utils/git';
import * as webview from '../utils/webview';

// Store diagnostics collection globally so code actions can access it
let securityDiagnostics: vscode.DiagnosticCollection;

export function registerChecklistFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  // Load notification config
  notify.loadNotificationConfig();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.runChecklist', () => runChecklist(client, 'changes')),
    vscode.commands.registerCommand('preCr.runChecklistWorkspace', () => runChecklist(client, 'workspace')),
    vscode.commands.registerCommand('preCr.quickSecurityScan', () => securityScan(client, 'file')),
    vscode.commands.registerCommand('preCr.securityScanWorkspace', () => securityScan(client, 'workspace')),
    vscode.commands.registerCommand('preCr.securityScanChanges', () => securityScan(client, 'changes')),
    vscode.commands.registerCommand('preCr.nextIssue', () => navigateIssue('next')),
    vscode.commands.registerCommand('preCr.prevIssue', () => navigateIssue('prev'))
  );

  // Register tree view
  const treeProvider = new ChecklistTreeProvider(client);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('preCr.checklist', treeProvider)
  );

  // Create diagnostics collection for security issues
  securityDiagnostics = vscode.languages.createDiagnosticCollection('preCr.security');
  context.subscriptions.push(securityDiagnostics);

  // Register code action provider for ignore comments
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file', pattern: '**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}' },
      new SecurityIgnoreCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  // Auto-run checklist on save if configured
  const checklistConfig = vscode.workspace.getConfiguration('preCr.checklist');
  if (checklistConfig.get('autoRun')) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(() => {
        runChecklist(client, 'changes', true);
      })
    );
  }

  // Auto-run security scan on save if configured
  const securityConfig = vscode.workspace.getConfiguration('preCr.security');
  if (securityConfig.get('scanOnSave')) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        // Only scan code files
        const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'rb', 'php'];
        const ext = doc.fileName.split('.').pop()?.toLowerCase();
        if (ext && codeExtensions.includes(ext)) {
          securityScan(client, 'file', true); // silent mode
        }
      })
    );
  }

  // Listen for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('preCr.notifications')) {
        notify.loadNotificationConfig();
      }
    })
  );
}

/**
 * Navigate to next/previous security issue
 */
function navigateIssue(direction: 'next' | 'prev') {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    notify.showInfo('No active editor');
    return;
  }

  const uri = editor.document.uri;
  const diagnostics = securityDiagnostics.get(uri) || [];

  if (diagnostics.length === 0) {
    notify.showInfo('No security issues in this file');
    return;
  }

  const currentLine = editor.selection.active.line;
  
  // Sort diagnostics by line number
  const sorted = [...diagnostics].sort((a, b) => a.range.start.line - b.range.start.line);

  let target: vscode.Diagnostic | undefined;

  if (direction === 'next') {
    // Find first diagnostic after current line
    target = sorted.find(d => d.range.start.line > currentLine);
    // Wrap around if none found
    if (!target) {
      target = sorted[0];
    }
  } else {
    // Find last diagnostic before current line
    target = sorted.reverse().find(d => d.range.start.line < currentLine);
    // Wrap around if none found
    if (!target) {
      target = sorted[0]; // sorted is already reversed
    }
  }

  if (target) {
    const position = new vscode.Position(target.range.start.line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(target.range, vscode.TextEditorRevealType.InCenter);
    
    // Show the diagnostic message
    notify.showInfo(`[${(diagnostics.indexOf(target) + 1)}/${diagnostics.length}] ${target.message}`);
  }
}

/**
 * Code action provider for adding preCr-ignore comments
 */
class SecurityIgnoreCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Find Pre-CR security diagnostics in the current range
    const preCrDiagnostics = context.diagnostics.filter(
      d => d.source === 'Pre-CR Security'
    );

    for (const diagnostic of preCrDiagnostics) {
      const line = diagnostic.range.start.line;
      const patternId = diagnostic.code as string;

      // Action 1: Ignore this specific pattern on this line
      const ignoreInline = new vscode.CodeAction(
        `Ignore this ${patternId} warning`,
        vscode.CodeActionKind.QuickFix
      );
      ignoreInline.edit = new vscode.WorkspaceEdit();
      const lineText = document.lineAt(line).text;
      const lineEnd = new vscode.Position(line, lineText.length);
      ignoreInline.edit.insert(
        document.uri,
        lineEnd,
        ` // preCr-ignore:${patternId}`
      );
      ignoreInline.diagnostics = [diagnostic];
      ignoreInline.isPreferred = true;
      actions.push(ignoreInline);

      // Action 2: Ignore all warnings on this line
      const ignoreAll = new vscode.CodeAction(
        'Ignore all Pre-CR warnings on this line',
        vscode.CodeActionKind.QuickFix
      );
      ignoreAll.edit = new vscode.WorkspaceEdit();
      ignoreAll.edit.insert(
        document.uri,
        lineEnd,
        ' // preCr-ignore'
      );
      ignoreAll.diagnostics = [diagnostic];
      actions.push(ignoreAll);

      // Action 3: Add ignore-next-line above
      const ignoreNextLine = new vscode.CodeAction(
        `Add preCr-ignore-next-line for ${patternId}`,
        vscode.CodeActionKind.QuickFix
      );
      ignoreNextLine.edit = new vscode.WorkspaceEdit();
      const indent = lineText.match(/^(\s*)/)?.[1] || '';
      ignoreNextLine.edit.insert(
        document.uri,
        new vscode.Position(line, 0),
        `${indent}// preCr-ignore-next-line:${patternId}\n`
      );
      ignoreNextLine.diagnostics = [diagnostic];
      actions.push(ignoreNextLine);
    }

    return actions;
  }
}

/**
 * Run the PR checklist
 * @param mode 'changes' = git changes only, 'workspace' = all files
 */
async function runChecklist(client: LanguageClient, mode: 'changes' | 'workspace', silent = false) {
  let files: any[];

  if (mode === 'workspace') {
    files = await getWorkspaceFiles();
  } else {
    files = await git.getChangedFilesWithContent();
  }

  if (files.length === 0) {
    if (!silent) {
      if (mode === 'changes') {
        // Offer to run workspace scan instead
        const action = await notify.showInfo(
          'No changed files detected. Scan entire workspace instead?',
          undefined,
          'Scan Workspace',
          'Cancel'
        );
        if (action === 'Scan Workspace') {
          return runChecklist(client, 'workspace', silent);
        }
      } else {
        notify.showInfo('No files found in workspace');
      }
    }
    return;
  }

  try {
    await notify.showProgress(
      mode === 'workspace' ? 'Scanning Workspace...' : 'Running PR Checklist...',
      async (progress) => {
        progress.report({ message: `Analyzing ${files.length} files...` });
        
        const result = await client.sendRequest('$/preCr/runChecklist', {
          changes: files,
          config: vscode.workspace.getConfiguration('preCr.checklist'),
          mode
        });

        const checklist = (result as any).result;
        if (!checklist) {
          throw new Error((result as any).error || 'Unknown error');
        }

        // Show results
        showChecklistResults(checklist, mode);
      }
    );

  } catch (error) {
    notify.showError(`Checklist failed: ${error}`);
  }
}

/**
 * Run security scan
 * @param mode 'file' = current file, 'workspace' = all files, 'changes' = git changes
 */
async function securityScan(client: LanguageClient, mode: 'file' | 'workspace' | 'changes', silent = false) {
  let files: { path: string; content: string }[] = [];

  if (mode === 'file') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      if (!silent) notify.showWarning('No active file');
      return;
    }
    files = [{
      path: vscode.workspace.asRelativePath(editor.document.uri),
      content: editor.document.getText()
    }];
  } else if (mode === 'changes') {
    // Get changed files from git
    const changedFiles = await git.getChangedFilesWithContent();
    if (changedFiles.length === 0) {
      if (!silent) notify.showInfo('No changed files detected');
      return;
    }
    files = changedFiles;
  } else {
    // Get all code files in workspace
    files = await getWorkspaceFiles();
  }

  if (files.length === 0) {
    if (!silent) notify.showInfo('No files to scan');
    return;
  }

  try {
    // For silent mode, skip the progress indicator
    const doScan = async () => {
      const result = await client.sendRequest('$/preCr/quickSecurityScan', { files });
      const findings = (result as any).findings || [];

      if (findings.length === 0) {
        if (!silent) {
          const scopeDesc = mode === 'workspace' 
            ? `${files.length} files` 
            : mode === 'changes' 
            ? `${files.length} changed file(s)`
            : 'this file';
          notify.showSuccess(`No security issues found in ${scopeDesc}`);
        }
        securityDiagnostics.clear();
        return;
      }

      // Group findings by file
      const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();
      
      for (const f of findings) {
        const fileUri = vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders![0].uri,
          f.file
        );
        const uriString = fileUri.toString();
        
        if (!diagnosticsMap.has(uriString)) {
          diagnosticsMap.set(uriString, []);
        }

        const range = new vscode.Range(f.line - 1, 0, f.line - 1, 1000);
        const diag = new vscode.Diagnostic(
          range,
          `[${f.severity}] ${f.message}`,
          f.severity === 'high' ? vscode.DiagnosticSeverity.Error :
          f.severity === 'medium' ? vscode.DiagnosticSeverity.Warning :
          vscode.DiagnosticSeverity.Information
        );
        diag.source = 'Pre-CR Security';
        diag.code = f.pattern; // Use pattern ID for ignore comments
        diagnosticsMap.get(uriString)!.push(diag);
      }

      // Clear old diagnostics and apply new ones
      securityDiagnostics.clear();
      for (const [uri, diags] of diagnosticsMap) {
        securityDiagnostics.set(vscode.Uri.parse(uri), diags);
      }

      // Auto-focus Problems panel when issues found (unless silent)
      if (!silent) {
        vscode.commands.executeCommand('workbench.actions.view.problems');
      }

      // Show summary with auto-dismiss (unless silent)
      const fileCount = diagnosticsMap.size;
      if (!silent) {
        notify.showWarning(
          `Found ${findings.length} security issue${findings.length !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`
        );
      }
    };

    // Run with or without progress indicator
    if (silent) {
      await doScan();
    } else {
      await notify.showProgress(
        mode === 'workspace' 
          ? 'Scanning Workspace for Security Issues...' 
          : mode === 'changes'
          ? 'Scanning Changed Files for Security Issues...'
          : 'Security Scan...',
        async (progress) => {
          progress.report({ message: `Scanning ${files.length} file(s)...` });
          await doScan();
        }
      );
    }

  } catch (error) {
    notify.showError(`Security scan failed: ${error}`);
  }
}

/**
 * Get all code files in workspace
 */
async function getWorkspaceFiles(): Promise<any[]> {
  const config = vscode.workspace.getConfiguration('preCr.security');
  const excludePatterns = config.get<string[]>('excludePatterns') || [];
  
  // Find all code files
  const pattern = '**/*.{ts,tsx,js,jsx,py,go,rs,java,rb,php}';
  const excludePattern = `{${excludePatterns.join(',')},**/node_modules/**,**/dist/**,**/build/**,.git/**}`;
  
  const files = await vscode.workspace.findFiles(pattern, excludePattern, 500);
  
  const results: any[] = [];
  
  for (const file of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      results.push({
        path: vscode.workspace.asRelativePath(file),
        content: doc.getText(),
        additions: 0,
        deletions: 0,
        isNew: false,
        isDeleted: false
      });
    } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
      // Skip files that can't be read
    }
  }
  
  return results;
}

/**
 * Show checklist results in a panel
 */
function showChecklistResults(result: any, mode: 'changes' | 'workspace') {
  const panel = webview.createWebviewPanel(
    'preCrChecklist',
    mode === 'workspace' ? 'Workspace Audit Results' : 'PR Checklist Results',
    vscode.ViewColumn.Two
  );

  panel.webview.html = getChecklistHtml(panel.webview, result, mode);
}

/**
 * Generate HTML for checklist results
 */
function getChecklistHtml(webviewInstance: vscode.Webview, result: any, mode: 'changes' | 'workspace'): string {
  const title = mode === 'workspace' ? 'Workspace Audit Results' : 'PR Checklist Results';
  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return '✅';
      case 'fail': return '❌';
      case 'warn': return '⚠️';
      default: return '❓';
    }
  };

  const checks = result.checks || [];
  const checksHtml = checks.map((check: any) => `
    <div class="check ${check.status}">
      <span class="icon">${statusIcon(check.status)}</span>
      <span class="name">${webview.escapeHtml(String(check.name))}</span>
      <span class="message">${webview.escapeHtml(String(check.message))}</span>
    </div>
  `).join('');
  return webview.buildWebviewHtml({
    webview: webviewInstance,
    title,
    additionalStyles: `
      .summary { display: flex; gap: 20px; margin: 20px 0; }
      .summary-item { padding: 10px 20px; border-radius: 4px; background: var(--vscode-editor-background); }
      .summary-item.pass { border-left: 3px solid #4caf50; }
      .summary-item.fail { border-left: 3px solid #f44336; }
      .summary-item.warn { border-left: 3px solid #ff9800; }
      .check { display: flex; align-items: center; gap: 10px; padding: 10px; margin: 5px 0; background: var(--vscode-editor-background); border-radius: 4px; }
      .check.fail { border-left: 3px solid #f44336; }
      .check.warn { border-left: 3px solid #ff9800; }
      .check.pass { border-left: 3px solid #4caf50; }
      .icon { font-size: 1.2em; }
      .name { font-weight: bold; min-width: 200px; }
      .message { color: var(--vscode-descriptionForeground); }
    `,
    body: `
      <h1>${webview.escapeHtml(title)}</h1>
      <div class="summary">
        <div class="summary-item pass"><strong>${result.summary?.passed || 0}</strong> Passed</div>
        <div class="summary-item fail"><strong>${result.summary?.failed || 0}</strong> Failed</div>
        <div class="summary-item warn"><strong>${result.summary?.warnings || 0}</strong> Warnings</div>
      </div>
      <h2>Checks</h2>
      ${checksHtml}
      ${result.security?.findings?.length > 0 ? `
        <h2>Security Findings</h2>
        ${result.security.findings.map((finding: any) => `
          <div class="check fail">
            <span class="icon">🔒</span>
            <span class="name">${webview.escapeHtml(String(finding.type))}</span>
            <span class="message">${webview.escapeHtml(`${finding.message} (${finding.file}:${finding.line})`)}</span>
          </div>
        `).join('')}
      ` : ''}
    `
  });
}

/**
 * Tree view provider for checklist
 */
class ChecklistTreeProvider implements vscode.TreeDataProvider<ChecklistTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChecklistTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private lastResult: any = null;

  constructor(private client: LanguageClient) {}

  refresh(result?: any): void {
    if (result) {
      this.lastResult = result;
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ChecklistTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ChecklistTreeItem): Promise<ChecklistTreeItem[]> {
    if (!element) {
      if (!this.lastResult) {
        return [
          new ChecklistTreeItem(
            'Run checklist to see results',
            '',
            'info',
            vscode.TreeItemCollapsibleState.None
          )
        ];
      }

      const checks = this.lastResult.checks || [];
      return checks.map((check: any) => new ChecklistTreeItem(
        check.name,
        check.message,
        check.status,
        vscode.TreeItemCollapsibleState.None
      ));
    }

    return [];
  }
}

class ChecklistTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly detail: string,
    public readonly status: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.description = detail;
    
    switch (status) {
      case 'pass':
        this.iconPath = new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
        break;
      case 'fail':
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
        break;
      case 'warn':
        this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('circle-outline');
    }
  }
}
