/**
 * Security Utility Tests
 * 
 * Tests for path sanitization and security functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode before imports
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: vi.fn(() => ({
      get: vi.fn()
    }))
  },
  extensions: {
    getExtension: vi.fn(() => null)
  }
}));

import { sanitizePath, validatePathInWorkspace, escapeShellArg } from '../utils/git';

describe('Security Utilities', () => {
  describe('sanitizePath', () => {
    it('should return empty string for empty input', () => {
      expect(sanitizePath('')).toBe('');
    });

    it('should remove null bytes', () => {
      expect(sanitizePath('file\0.txt')).toBe('file.txt');
    });

    it('should remove path traversal attempts', () => {
      expect(sanitizePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizePath('foo/../bar')).toBe('foo/bar'); // .. removed, slashes collapsed
      expect(sanitizePath('..\\..\\windows')).toBe('windows');
    });

    it('should remove shell metacharacters', () => {
      expect(sanitizePath('file`rm -rf`.txt')).toBe('filerm -rf.txt');
      expect(sanitizePath('file$HOME.txt')).toBe('fileHOME.txt');
      expect(sanitizePath('file|cat.txt')).toBe('filecat.txt');
      expect(sanitizePath('file;echo.txt')).toBe('fileecho.txt');
      expect(sanitizePath('file&background.txt')).toBe('filebackground.txt');
      expect(sanitizePath('file<input.txt')).toBe('fileinput.txt');
      expect(sanitizePath('file>output.txt')).toBe('fileoutput.txt');
    });

    it('should normalize path separators', () => {
      expect(sanitizePath('path\\to\\file.txt')).toBe('path/to/file.txt');
    });

    it('should remove leading slashes', () => {
      expect(sanitizePath('/absolute/path.txt')).toBe('absolute/path.txt');
      expect(sanitizePath('///multiple/slashes.txt')).toBe('multiple/slashes.txt');
    });

    it('should handle normal paths unchanged (except normalization)', () => {
      expect(sanitizePath('src/utils/file.ts')).toBe('src/utils/file.ts');
      expect(sanitizePath('package.json')).toBe('package.json');
    });

    it('should handle complex attack strings', () => {
      const attack = '../../../etc/passwd\0;rm -rf /`whoami`';
      const sanitized = sanitizePath(attack);
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('\0');
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('`');
    });
  });

  describe('validatePathInWorkspace', () => {
    const workspaceRoot = '/home/user/project';

    it('should accept paths within workspace', () => {
      const result = validatePathInWorkspace('src/index.ts', workspaceRoot);
      expect(result).toBe('/home/user/project/src/index.ts');
    });

    it('should reject path traversal attempts', () => {
      const result = validatePathInWorkspace('../../../etc/passwd', workspaceRoot);
      expect(result).toBe('/home/user/project/etc/passwd'); // Sanitized first
    });

    it('should handle nested paths', () => {
      const result = validatePathInWorkspace('src/utils/helpers/index.ts', workspaceRoot);
      expect(result).toBe('/home/user/project/src/utils/helpers/index.ts');
    });
  });

  describe('escapeShellArg', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
    });

    it('should escape single quotes', () => {
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
    });

    it('should handle empty strings', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should safely escape shell metacharacters', () => {
      expect(escapeShellArg('$(whoami)')).toBe("'$(whoami)'");
      expect(escapeShellArg('`rm -rf /`')).toBe("'`rm -rf /`'");
      expect(escapeShellArg('file; cat /etc/passwd')).toBe("'file; cat /etc/passwd'");
    });

    it('should handle paths with spaces', () => {
      expect(escapeShellArg('/path/to/my file.txt')).toBe("'/path/to/my file.txt'");
    });
  });
});
