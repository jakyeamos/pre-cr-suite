/**
 * Webview Utility Tests
 * 
 * Tests for HTML escaping, CSP, and webview helpers
 */

import { describe, it, expect, vi } from 'vitest';

// Mock vscode before importing
vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn()
  },
  ViewColumn: {
    One: 1,
    Two: 2
  },
  Uri: {
    file: (path: string) => ({ scheme: 'file', path, fsPath: path })
  }
}));

import { escapeHtml, html, getNonce, generateNonce, WEBVIEW_STYLES } from '../utils/webview';

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('should escape greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it('should escape all special characters together', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should handle empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle strings without special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('should handle HTML entities in input', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('should handle multiline strings', () => {
    expect(escapeHtml('line1\n<b>line2</b>')).toBe('line1\n&lt;b&gt;line2&lt;/b&gt;');
  });
});

describe('html template tag', () => {
  it('should escape interpolated values', () => {
    const userInput = '<script>alert("xss")</script>';
    const result = html`<div>${userInput}</div>`;
    
    expect(result).toBe('<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>');
  });

  it('should handle multiple interpolations', () => {
    const name = '<b>John</b>';
    const age = 30;
    const result = html`Name: ${name}, Age: ${age}`;
    
    expect(result).toBe('Name: &lt;b&gt;John&lt;/b&gt;, Age: 30');
  });

  it('should handle null and undefined', () => {
    const result = html`Value: ${null}, Other: ${undefined}`;
    expect(result).toContain('Value:');
  });

  it('should handle numbers', () => {
    const result = html`Count: ${42}`;
    expect(result).toBe('Count: 42');
  });
});

describe('getNonce', () => {
  it('should generate a 32 character string', () => {
    const nonce = getNonce();
    expect(nonce).toHaveLength(32);
  });

  it('should only contain alphanumeric characters', () => {
    const nonce = getNonce();
    expect(nonce).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('should generate unique values', () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 100; i++) {
      nonces.add(getNonce());
    }
    // All 100 should be unique
    expect(nonces.size).toBe(100);
  });
});

describe('generateNonce', () => {
  it('should be an alias for getNonce', () => {
    // Both should produce the same type of output
    const nonce1 = getNonce();
    const nonce2 = generateNonce();
    
    expect(nonce1).toHaveLength(32);
    expect(nonce2).toHaveLength(32);
    expect(nonce1).not.toBe(nonce2); // But different values
  });
});

describe('WEBVIEW_STYLES', () => {
  it('should be a non-empty string', () => {
    expect(WEBVIEW_STYLES).toBeTruthy();
    expect(typeof WEBVIEW_STYLES).toBe('string');
    expect(WEBVIEW_STYLES.length).toBeGreaterThan(100);
  });

  it('should contain CSS variables', () => {
    expect(WEBVIEW_STYLES).toContain('--vscode-font-family');
    expect(WEBVIEW_STYLES).toContain('--vscode-font-size');
  });

  it('should contain body styles', () => {
    expect(WEBVIEW_STYLES).toContain('body {');
    expect(WEBVIEW_STYLES).toContain('font-family');
  });

  it('should contain card styles', () => {
    expect(WEBVIEW_STYLES).toContain('.card {');
  });

  it('should contain badge styles', () => {
    expect(WEBVIEW_STYLES).toContain('.badge');
    expect(WEBVIEW_STYLES).toContain('.badge-success');
    expect(WEBVIEW_STYLES).toContain('.badge-warning');
    expect(WEBVIEW_STYLES).toContain('.badge-error');
  });

  it('should contain severity styles', () => {
    expect(WEBVIEW_STYLES).toContain('.severity-high');
    expect(WEBVIEW_STYLES).toContain('.severity-medium');
    expect(WEBVIEW_STYLES).toContain('.severity-low');
  });

  it('should contain button styles', () => {
    expect(WEBVIEW_STYLES).toContain('button {');
    expect(WEBVIEW_STYLES).toContain('button:hover');
  });

  it('should contain table styles', () => {
    expect(WEBVIEW_STYLES).toContain('table {');
    expect(WEBVIEW_STYLES).toContain('th, td {');
  });

  it('should contain progress bar styles', () => {
    expect(WEBVIEW_STYLES).toContain('.progress-bar');
    expect(WEBVIEW_STYLES).toContain('.progress-bar-fill');
  });
});

describe('XSS Prevention', () => {
  it('should neutralize script injection via escapeHtml', () => {
    const malicious = '<script>document.cookie</script>';
    const safe = escapeHtml(malicious);
    
    // The < and > are escaped, making the script tag inert
    expect(safe).not.toContain('<script>');
    expect(safe).toContain('&lt;script&gt;');
  });

  it('should neutralize event handler injection', () => {
    const malicious = '<img onerror="alert(1)" src="x">';
    const safe = escapeHtml(malicious);
    
    // The < is escaped, so the img tag won't render as HTML
    expect(safe).not.toContain('<img');
    expect(safe).toContain('&lt;img');
  });

  it('should neutralize javascript: URL injection', () => {
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const safe = escapeHtml(malicious);
    
    // The < is escaped, so the anchor tag won't render as HTML
    expect(safe).not.toContain('<a');
    expect(safe).toContain('&lt;a');
  });

  it('should handle nested attack patterns', () => {
    const malicious = '<<script>script>alert(1)<</script>/script>';
    const safe = escapeHtml(malicious);
    
    expect(safe).not.toContain('<script>');
    expect(safe.match(/&lt;/g)?.length).toBe(4);
  });

  it('should handle unicode escape attempts', () => {
    const malicious = '\u003cscript\u003e';
    const safe = escapeHtml(malicious);
    
    expect(safe).toContain('&lt;script&gt;');
  });
});
