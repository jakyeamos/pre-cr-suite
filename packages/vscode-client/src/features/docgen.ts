/**
 * Documentation Generator Feature Module
 * 
 * Handles:
 * - Generating docs for files
 * - Generating docs at cursor
 * - AI prompt generation for docs
 * - Documentation health checks
 */

import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import * as notify from '../utils/notifications';

export function registerDocgenFeatures(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.generateDocs', () => generateDocs(client)),
    vscode.commands.registerCommand('preCr.generateDocAtCursor', () => generateDocAtCursor(client)),
    vscode.commands.registerCommand('preCr.checkDocHealth', () => checkDocHealth(client, 'file')),
    vscode.commands.registerCommand('preCr.checkDocHealthWorkspace', () => checkDocHealth(client, 'workspace'))
  );
}

/**
 * Generate docs for entire file
 */
async function generateDocs(client: LanguageClient) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    notify.showWarning('No active file');
    return;
  }

  const uri = editor.document.uri.toString();
  const content = editor.document.getText();
  const config = vscode.workspace.getConfiguration('preCr.docs');

  try {
    const result = await client.sendRequest('$/preCr/generateDocs', {
      uri,
      content,
      config: {
        style: config.get('style'),
        includeExamples: config.get('includeExamples'),
        skipTrivialItems: config.get('skipTrivialItems'),
        skipPrivateMembers: config.get('skipPrivateMembers'),
        minFunctionStatements: config.get('minFunctionStatements'),
        includeReactComponents: config.get('includeReactComponents')
      }
    });

    const docs = (result as any).result;
    if (!docs || docs.items.length === 0) {
      notify.showSuccess('All items already documented');
      return;
    }

    // Build list of item names for preview
    const itemNames = docs.items.slice(0, 5).map((d: any) => d.name).join(', ');
    const moreText = docs.items.length > 5 ? ` and ${docs.items.length - 5} more` : '';
    
    // Show preview with option to apply
    const action = await notify.showInfo(
      `Found ${docs.items.length} undocumented item(s): ${itemNames}${moreText}`,
      undefined,
      'Apply All',
      'Preview'
    );

    if (action === 'Apply All') {
      await applyDocs(editor, docs.items);
      notify.showSuccess(`Applied ${docs.items.length} doc comment(s)`);
    } else if (action === 'Preview') {
      showDocsPreview(docs.items);
    }

  } catch (error) {
    notify.showError(`Doc generation failed: ${error}`);
  }
}

/**
 * Generate doc at current cursor position
 */
async function generateDocAtCursor(client: LanguageClient) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    notify.showWarning('No active file');
    return;
  }

  const uri = editor.document.uri.toString();
  const content = editor.document.getText();
  const position = editor.selection.active;
  const config = vscode.workspace.getConfiguration('preCr.docs');

  try {
    const result = await client.sendRequest('$/preCr/generateDocAtCursor', {
      uri,
      content,
      line: position.line,
      config: {
        style: config.get('style'),
        includeExamples: config.get('includeExamples'),
        skipTrivialItems: config.get('skipTrivialItems')
      }
    });

    const doc = (result as any).doc;
    if (!doc) {
      notify.showInfo(
        'No documentable item at cursor. Move cursor to a function, class, method, or interface definition.'
      );
      return;
    }

    // Insert the documentation
    const insertPosition = new vscode.Position(doc.line, 0);
    await editor.edit(editBuilder => {
      editBuilder.insert(insertPosition, doc.content + '\n');
    });

    notify.showSuccess(`Added doc for ${doc.name}`);

  } catch (error) {
    notify.showError(`Doc generation failed: ${error}`);
  }
}

/**
 * Check documentation health for file or workspace
 */
async function checkDocHealth(client: LanguageClient, mode: 'file' | 'workspace') {
  try {
    if (mode === 'file') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        notify.showWarning('No active file');
        return;
      }
      
      const result = await client.sendRequest('$/preCr/checkFileHealth', {
        uri: editor.document.uri.toString(),
        content: editor.document.getText()
      });

      const report = (result as any).report;
      if (!report) {
        throw new Error((result as any).error);
      }

      showHealthReport(report, editor.document.fileName);
    } else {
      // Workspace mode - scan all code files
      await notify.showProgress(
        'Checking Documentation Health...',
        async (progress) => {
        const files = await getCodeFiles();
        progress.report({ message: `Scanning ${files.length} files...` });
        
        let totalItems = 0;
        let documentedItems = 0;
        const allIssues: any[] = [];

        for (const file of files) {
          try {
            const doc = await vscode.workspace.openTextDocument(file);
            const result = await client.sendRequest('$/preCr/checkFileHealth', {
              uri: doc.uri.toString(),
              content: doc.getText()
            });

            const report = (result as any).report;
            if (report) {
              totalItems += report.total || 0;
              documentedItems += report.documented || 0;
              if (report.issues) {
                for (const issue of report.issues) {
                  allIssues.push({
                    ...issue,
                    file: vscode.workspace.asRelativePath(file)
                  });
                }
              }
            }
          } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
            // Skip files that fail
          }
        }

        const coverage = totalItems > 0 ? (documentedItems / totalItems * 100) : 100;
        showWorkspaceHealthReport({
          total: totalItems,
          documented: documentedItems,
          coveragePercent: coverage,
          issues: allIssues,
          fileCount: files.length
        });
      }
    );
    }

  } catch (error) {
    notify.showError(`Health check failed: ${error}`);
  }
}

/**
 * Get all code files in workspace
 */
async function getCodeFiles(): Promise<vscode.Uri[]> {
  const pattern = '**/*.{ts,tsx,js,jsx}';
  const exclude = '{**/node_modules/**,**/dist/**,**/build/**,**/*.test.*,**/*.spec.*}';
  return vscode.workspace.findFiles(pattern, exclude, 200);
}

/**
 * Apply generated docs to editor
 */
async function applyDocs(editor: vscode.TextEditor, items: any[]) {
  // Sort by line descending so we don't mess up line numbers
  const sorted = [...items].sort((a, b) => b.line - a.line);

  await editor.edit(editBuilder => {
    for (const item of sorted) {
      const position = new vscode.Position(item.line, 0);
      editBuilder.insert(position, item.content + '\n');
    }
  });

  notify.showSuccess(`Applied ${items.length} doc comment(s)`);
}

/**
 * Show docs preview in webview
 */
function showDocsPreview(items: any[]) {
  const panel = vscode.window.createWebviewPanel(
    'preCrDocsPreview',
    'Documentation Preview',
    vscode.ViewColumn.Two,
    {}
  );

  const itemsHtml = items.map(item => `
    <div class="doc-item">
      <h3>${item.name} (line ${item.line + 1})</h3>
      <pre><code>${escapeHtml(item.content)}</code></pre>
    </div>
  `).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    .doc-item { 
      margin: 20px 0; 
      padding: 15px; 
      background: var(--vscode-editor-background);
      border-radius: 4px;
    }
    h3 { margin-top: 0; color: var(--vscode-textLink-foreground); }
    pre { 
      background: var(--vscode-textCodeBlock-background); 
      padding: 10px; 
      border-radius: 4px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>Generated Documentation</h1>
  ${itemsHtml}
</body>
</html>`;
}

/**
 * Show health report for a file
 */
function showHealthReport(report: any, fileName: string) {
  const issues = report.issues || [];
  
  if (issues.length === 0) {
    notify.showSuccess(`Doc health good for ${fileName.split('/').pop()}`);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'preCrDocHealth',
    'Documentation Health',
    vscode.ViewColumn.Two,
    {}
  );

  const issuesHtml = issues.map((issue: any) => `
    <div class="issue ${issue.severity}">
      <span class="type">${issue.type}</span>
      <span class="message">${issue.message}</span>
      <span class="line">Line ${issue.line}</span>
    </div>
  `).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    .issue { 
      display: flex; 
      gap: 10px; 
      padding: 10px;
      margin: 5px 0;
      border-radius: 4px;
      background: var(--vscode-editor-background);
    }
    .issue.error { border-left: 3px solid #f44336; }
    .issue.warning { border-left: 3px solid #ff9800; }
    .type { font-weight: bold; min-width: 150px; }
    .line { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <h1>Documentation Health: ${fileName}</h1>
  <p>Found ${issues.length} issue(s)</p>
  ${issuesHtml}
</body>
</html>`;
}

/**
 * Show workspace health report
 */
function showWorkspaceHealthReport(report: any) {
  const panel = vscode.window.createWebviewPanel(
    'preCrDocHealthWorkspace',
    'Documentation Health - Workspace',
    vscode.ViewColumn.Two,
    {}
  );

  const coverageClass = report.coveragePercent >= 80 ? 'good' : report.coveragePercent >= 50 ? 'warning' : 'bad';
  
  const issuesHtml = (report.issues || []).slice(0, 50).map((issue: any) => `
    <div class="issue ${issue.severity}">
      <span class="file">${issue.file}:${issue.line}</span>
      <span class="type">${issue.type}</span>
      <span class="message">${issue.message}</span>
    </div>
  `).join('');

  panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .summary-item { 
      padding: 20px; 
      background: var(--vscode-editor-background);
      border-radius: 8px;
      text-align: center;
    }
    .big-number { font-size: 2.5em; font-weight: bold; }
    .good { color: #4caf50; }
    .warning { color: #ff9800; }
    .bad { color: #f44336; }
    .issue { 
      display: flex; 
      gap: 10px; 
      padding: 8px;
      margin: 4px 0;
      border-radius: 4px;
      background: var(--vscode-editor-background);
      font-size: 0.9em;
    }
    .issue.error { border-left: 3px solid #f44336; }
    .issue.warning { border-left: 3px solid #ff9800; }
    .file { color: var(--vscode-textLink-foreground); min-width: 200px; }
    .type { font-weight: bold; min-width: 150px; }
  </style>
</head>
<body>
  <h1>Documentation Health</h1>
  
  <div class="summary">
    <div class="summary-item">
      <div class="big-number ${coverageClass}">${report.coveragePercent?.toFixed(0) || 0}%</div>
      <div>Documentation Coverage</div>
    </div>
    <div class="summary-item">
      <div class="big-number">${report.documented || 0}</div>
      <div>Documented Items</div>
    </div>
    <div class="summary-item">
      <div class="big-number">${report.total || 0}</div>
      <div>Total Items</div>
    </div>
    <div class="summary-item">
      <div class="big-number">${report.fileCount || 0}</div>
      <div>Files Scanned</div>
    </div>
  </div>

  ${report.issues?.length > 0 ? `
    <h2>Issues (${report.issues.length}${report.issues.length > 50 ? ', showing first 50' : ''})</h2>
    ${issuesHtml}
  ` : '<p>✓ No documentation issues found!</p>'}
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
