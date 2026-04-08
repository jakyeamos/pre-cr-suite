/**
 * Webview Utilities
 * 
 * Secure webview creation with CSP and HTML sanitization
 */

import * as vscode from 'vscode';

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape HTML in template literals
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((result, str, i) => {
    const value = values[i - 1];
    const escaped = typeof value === 'string' ? escapeHtml(value) : String(value ?? '');
    return result + escaped + str;
  });
}

/**
 * Create a safe HTML string (already escaped)
 */
export function safeHtml(content: string): { __html: string } {
  return { __html: content };
}

/**
 * Generate a nonce for CSP
 */
export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Alias for consistency
export const generateNonce = getNonce;

/**
 * Standard CSP for webviews
 */
export function getContentSecurityPolicy(
  webview: vscode.Webview,
  nonce: string,
  options?: {
    allowImages?: boolean;
    allowFonts?: boolean;
    allowStyles?: boolean;
  }
): string {
  const cspSource = webview.cspSource;
  
  const directives = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    options?.allowStyles !== false 
      ? `style-src ${cspSource} 'unsafe-inline'` 
      : "style-src 'none'",
    options?.allowImages !== false 
      ? `img-src ${cspSource} https: data:` 
      : "img-src 'none'",
    options?.allowFonts !== false 
      ? `font-src ${cspSource}` 
      : "font-src 'none'",
  ];

  return directives.join('; ');
}

/**
 * Create a webview panel with proper security settings
 */
export function createWebviewPanel(
  viewType: string,
  title: string,
  column: vscode.ViewColumn,
  options?: {
    enableScripts?: boolean;
    retainContextWhenHidden?: boolean;
    localResourceRoots?: vscode.Uri[];
  }
): vscode.WebviewPanel {
  return vscode.window.createWebviewPanel(
    viewType,
    title,
    column,
    {
      enableScripts: options?.enableScripts ?? false,
      retainContextWhenHidden: options?.retainContextWhenHidden ?? false,
      localResourceRoots: options?.localResourceRoots ?? [],
    }
  );
}

/**
 * Standard CSS for webviews
 */
export const WEBVIEW_STYLES = `
  :root {
    --vscode-font-family: var(--vscode-editor-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
    --vscode-font-size: var(--vscode-editor-font-size, 13px);
  }
  
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 16px;
    line-height: 1.5;
  }

  h1, h2, h3, h4 {
    color: var(--vscode-foreground);
    margin-top: 0;
  }

  h1 { font-size: 1.5em; margin-bottom: 16px; }
  h2 { font-size: 1.3em; margin-bottom: 12px; }
  h3 { font-size: 1.1em; margin-bottom: 8px; }

  a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background);
    padding: 2px 6px;
    border-radius: 3px;
  }

  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
  }

  .card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: 500;
  }

  .badge-success {
    background: var(--vscode-testing-iconPassed);
    color: white;
  }
  .badge-warning {
    background: var(--vscode-editorWarning-foreground);
    color: white;
  }
  .badge-error {
    background: var(--vscode-editorError-foreground);
    color: white;
  }
  .badge-info {
    background: var(--vscode-editorInfo-foreground);
    color: white;
  }

  .severity-high { color: var(--vscode-editorError-foreground); }
  .severity-medium { color: var(--vscode-editorWarning-foreground); }
  .severity-low { color: var(--vscode-editorInfo-foreground); }

  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  th {
    font-weight: 600;
  }

  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 14px;
    border-radius: 2px;
    cursor: pointer;
  }
  button:hover {
    background: var(--vscode-button-hoverBackground);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  input, select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 4px 8px;
    border-radius: 2px;
  }

  .progress-bar {
    height: 8px;
    background: var(--vscode-progressBar-background);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--vscode-progressBar-foreground, #0e70c0);
    transition: width 0.3s ease;
  }
`;

/**
 * Build complete HTML for a webview
 */
export function buildWebviewHtml(options: {
  webview: vscode.Webview;
  title: string;
  body: string;
  scripts?: string;
  additionalStyles?: string;
}): string {
  const nonce = getNonce();
  const csp = getContentSecurityPolicy(options.webview, nonce);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${escapeHtml(options.title)}</title>
  <style>
    ${WEBVIEW_STYLES}
    ${options.additionalStyles ?? ''}
  </style>
</head>
<body>
  ${options.body}
  ${options.scripts ? `<script nonce="${nonce}">${options.scripts}</script>` : ''}
</body>
</html>`;
}

/**
 * Build a simple info webview
 */
export function buildInfoWebview(
  webview: vscode.Webview,
  title: string,
  sections: Array<{ heading: string; content: string }>
): string {
  const body = sections.map(s => `
    <div class="card">
      <h3>${escapeHtml(s.heading)}</h3>
      <div>${s.content}</div>
    </div>
  `).join('');

  return buildWebviewHtml({
    webview,
    title,
    body: `<h1>${escapeHtml(title)}</h1>${body}`
  });
}

/**
 * Build a table webview
 */
export function buildTableWebview(
  webview: vscode.Webview,
  title: string,
  headers: string[],
  rows: string[][]
): string {
  const headerHtml = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
  const rowsHtml = rows.map(row => 
    `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  ).join('');

  const body = `
    <h1>${escapeHtml(title)}</h1>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;

  return buildWebviewHtml({ webview, title, body });
}
