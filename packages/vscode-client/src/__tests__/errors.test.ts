/**
 * Error Messages Tests
 * 
 * Tests for error message definitions
 */

import { describe, it, expect, vi } from 'vitest';

// Mock vscode and notifications
vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn()
  }
}));

vi.mock('../utils/notifications', () => ({
  showError: vi.fn().mockResolvedValue(undefined),
  showWarning: vi.fn().mockResolvedValue(undefined),
  showInfo: vi.fn().mockResolvedValue(undefined)
}));

import { messages } from '../utils/errors';

describe('Error Messages', () => {
  describe('Git Messages', () => {
    it('should have gitNotFound message', () => {
      expect(messages.gitNotFound).toBeDefined();
      expect(messages.gitNotFound.message).toBeTruthy();
      expect(messages.gitNotFound.detail).toBeTruthy();
    });

    it('should have branchNotFound message', () => {
      expect(messages.branchNotFound).toBeDefined();
      expect(messages.branchNotFound.message).toBeTruthy();
    });

    it('should have noChangedFiles message', () => {
      expect(messages.noChangedFiles).toBeDefined();
      expect(messages.noChangedFiles.message).toBeTruthy();
    });
  });

  describe('Workspace Messages', () => {
    it('should have noWorkspace message with action', () => {
      expect(messages.noWorkspace).toBeDefined();
      expect(messages.noWorkspace.message).toBeTruthy();
      expect(messages.noWorkspace.action).toBeDefined();
      expect(messages.noWorkspace.command).toBeDefined();
    });

    it('should have noActiveEditor message', () => {
      expect(messages.noActiveEditor).toBeDefined();
      expect(messages.noActiveEditor.message).toBeTruthy();
    });
  });

  describe('Coverage Messages', () => {
    it('should have noCoverageData message', () => {
      expect(messages.noCoverageData).toBeDefined();
      expect(messages.noCoverageData.message).toContain('coverage');
    });

    it('should have noCoverageFiles message', () => {
      expect(messages.noCoverageFiles).toBeDefined();
      expect(messages.noCoverageFiles.message).toBeTruthy();
    });

    it('should have coverageFileNotFound message', () => {
      expect(messages.coverageFileNotFound).toBeDefined();
      expect(messages.coverageFileNotFound.message).toBeTruthy();
    });
  });

  describe('LSP Messages', () => {
    it('should have serverNotResponding message', () => {
      expect(messages.serverNotResponding).toBeDefined();
      expect(messages.serverNotResponding.action).toBe('Reload Window');
    });

    it('should have serverError function', () => {
      expect(typeof messages.serverError).toBe('function');
      const error = messages.serverError('test error');
      expect(error.message).toBe('Server error');
      expect(error.detail).toBe('test error');
    });
  });

  describe('Feature Messages', () => {
    it('should have noDocumentableItem message', () => {
      expect(messages.noDocumentableItem).toBeDefined();
      expect(messages.noDocumentableItem.detail).toContain('function');
    });

    it('should have noSnapshot message with action', () => {
      expect(messages.noSnapshot).toBeDefined();
      expect(messages.noSnapshot.action).toBe('Save Snapshot');
      expect(messages.noSnapshot.command).toBe('preCr.captureContext');
    });

    it('should have noDebugSessions message', () => {
      expect(messages.noDebugSessions).toBeDefined();
      expect(messages.noDebugSessions.action).toBe('Start Capture');
    });

    it('should have noFlakyData message', () => {
      expect(messages.noFlakyData).toBeDefined();
      expect(messages.noFlakyData.message).toBeTruthy();
    });
  });

  describe('File Messages', () => {
    it('should have fileNotFound function', () => {
      expect(typeof messages.fileNotFound).toBe('function');
      const error = messages.fileNotFound('test.ts');
      expect(error.message).toBe('File not found');
      expect(error.detail).toContain('test.ts');
    });

    it('should have fileReadError function', () => {
      expect(typeof messages.fileReadError).toBe('function');
      const error = messages.fileReadError('test.ts');
      expect(error.message).toContain('read');
      expect(error.detail).toContain('test.ts');
    });
  });
});

describe('Message Structure', () => {
  it('all static messages should have message and detail', () => {
    const staticMessages = [
      'gitNotFound', 'branchNotFound', 'noChangedFiles',
      'noWorkspace', 'noActiveEditor',
      'noCoverageData', 'noCoverageFiles', 'coverageFileNotFound',
      'serverNotResponding',
      'noDocumentableItem', 'noSnapshot', 'noDebugSessions', 'noFlakyData'
    ];

    for (const key of staticMessages) {
      const msg = (messages as any)[key];
      expect(msg.message, `${key} should have message`).toBeTruthy();
      expect(msg.detail, `${key} should have detail`).toBeTruthy();
    }
  });

  it('messages with actions should have command', () => {
    const actionMessages = ['gitNotFound', 'noWorkspace', 'noCoverageData', 
                           'noCoverageFiles', 'serverNotResponding', 
                           'noSnapshot', 'noDebugSessions'];

    for (const key of actionMessages) {
      const msg = (messages as any)[key];
      if (msg.action) {
        expect(msg.command, `${key} with action should have command`).toBeTruthy();
      }
    }
  });
});
