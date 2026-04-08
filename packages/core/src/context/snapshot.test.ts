/**
 * Context Snapshot Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextManager,
  ContextSnapshot,
  OpenFileState,
  GitState,
  createMinimalSnapshot,
  DEFAULT_CONTEXT_CONFIG
} from './snapshot';

describe('Context Snapshot', () => {
  let manager: ContextManager;
  
  beforeEach(() => {
    manager = new ContextManager({ maxSnapshotsPerBranch: 3 });
  });
  
  const createTestContext = (branch: string, activeFile?: string): Omit<ContextSnapshot, 'id' | 'timestamp' | 'version'> => ({
    branch,
    files: activeFile ? [{
      path: activeFile,
      cursor: { line: 10, character: 5 },
      scrollTop: 0,
      isDirty: false,
      isActive: true
    }] : [],
    breakpoints: [],
    terminals: [],
    searches: [],
    git: {
      branch,
      modifiedFiles: [],
      stagedFiles: [],
      untrackedFiles: [],
      headCommit: 'abc123',
      hasConflicts: false
    },
    layout: {
      groups: [],
      panels: { terminal: false, output: false, problems: false, debugConsole: false },
      sidebar: { visible: true }
    }
  });
  
  describe('captureContext', () => {
    it('captures and stores context', () => {
      const context = createTestContext('feature/login', 'src/auth.ts');
      const snapshot = manager.captureContext(context);
      
      expect(snapshot.id).toBeDefined();
      expect(snapshot.id).toMatch(/^ctx_/);
      expect(snapshot.branch).toBe('feature/login');
      expect(snapshot.files.length).toBe(1);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });
    
    it('limits snapshots per branch', () => {
      const context = createTestContext('main');
      
      // Create 5 snapshots (max is 3)
      for (let i = 0; i < 5; i++) {
        manager.captureContext({ ...context, description: `Snapshot ${i}` });
      }
      
      const snapshots = manager.getSnapshots('main');
      expect(snapshots.length).toBe(3);
      
      // Most recent should be first
      expect(snapshots[0].description).toBe('Snapshot 4');
    });
    
    it('stores snapshots per branch', () => {
      manager.captureContext(createTestContext('main'));
      manager.captureContext(createTestContext('develop'));
      manager.captureContext(createTestContext('main'));
      
      expect(manager.getSnapshots('main').length).toBe(2);
      expect(manager.getSnapshots('develop').length).toBe(1);
    });
  });
  
  describe('getLatestSnapshot', () => {
    it('returns latest snapshot for branch', () => {
      manager.captureContext({ ...createTestContext('main'), description: 'First' });
      manager.captureContext({ ...createTestContext('main'), description: 'Second' });
      
      const latest = manager.getLatestSnapshot('main');
      expect(latest?.description).toBe('Second');
    });
    
    it('returns undefined for unknown branch', () => {
      expect(manager.getLatestSnapshot('nonexistent')).toBeUndefined();
    });
  });
  
  describe('getSnapshot', () => {
    it('finds snapshot by ID', () => {
      const snapshot = manager.captureContext(createTestContext('main'));
      
      const found = manager.getSnapshot(snapshot.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(snapshot.id);
    });
    
    it('returns undefined for unknown ID', () => {
      expect(manager.getSnapshot('unknown_id')).toBeUndefined();
    });
  });
  
  describe('deleteSnapshot', () => {
    it('deletes snapshot by ID', () => {
      const snapshot = manager.captureContext(createTestContext('main'));
      
      expect(manager.deleteSnapshot(snapshot.id)).toBe(true);
      expect(manager.getSnapshot(snapshot.id)).toBeUndefined();
    });
    
    it('returns false for unknown ID', () => {
      expect(manager.deleteSnapshot('unknown_id')).toBe(false);
    });
  });
  
  describe('onBranchSwitch', () => {
    it('captures context for old branch', () => {
      const context = createTestContext('main', 'src/index.ts');
      
      const result = manager.onBranchSwitch('main', 'feature/new', context);
      
      expect(result.captured).toBeDefined();
      expect(result.captured?.branch).toBe('main');
    });
    
    it('returns snapshot to restore for target branch', () => {
      // First, create a snapshot on develop
      manager.captureContext(createTestContext('develop', 'src/api.ts'));
      
      // Now switch from main to develop
      const context = createTestContext('main');
      const result = manager.onBranchSwitch('main', 'develop', context);
      
      expect(result.toRestore).toBeDefined();
      expect(result.toRestore?.branch).toBe('develop');
    });
    
    it('respects config settings', () => {
      const manager = new ContextManager({
        autoCaptureOnBranchSwitch: false,
        autoRestoreOnBranchReturn: false
      });
      
      manager.captureContext(createTestContext('develop'));
      
      const result = manager.onBranchSwitch('main', 'develop', createTestContext('main'));
      
      expect(result.captured).toBeUndefined();
      expect(result.toRestore).toBeUndefined();
    });
  });
  
  describe('generateSummary', () => {
    it('generates summary for snapshot', () => {
      const context = createTestContext('main', 'src/auth.ts');
      context.git.modifiedFiles = ['src/utils.ts', 'src/api.ts'];
      
      const snapshot = manager.captureContext(context);
      const summary = manager.generateSummary(snapshot);
      
      expect(summary.primaryFile).toBe('src/auth.ts');
      expect(summary.primaryLine).toBe(10);
      expect(summary.modifiedFilesCount).toBe(2);
      expect(summary.summary).toContain('src/auth.ts');
      expect(summary.quickActions.length).toBeGreaterThan(0);
    });
    
    it('handles empty context', () => {
      const context = createTestContext('main');
      const snapshot = manager.captureContext(context);
      const summary = manager.generateSummary(snapshot);
      
      expect(summary.primaryFile).toBeUndefined();
      expect(summary.summary).toContain('No files were open');
    });
    
    it('includes search state in summary', () => {
      const context = createTestContext('main');
      context.searches = [{
        query: 'TODO',
        scope: 'workspace',
        options: { caseSensitive: false, wholeWord: false, regex: false }
      }];
      
      const snapshot = manager.captureContext(context);
      const summary = manager.generateSummary(snapshot);
      
      expect(summary.recentSearch).toBe('TODO');
    });
  });
  
  describe('diffSnapshots', () => {
    it('detects closed files', () => {
      const before = manager.captureContext({
        ...createTestContext('main'),
        files: [
          { path: 'a.ts', cursor: { line: 1, character: 0 }, scrollTop: 0, isDirty: false, isActive: true },
          { path: 'b.ts', cursor: { line: 1, character: 0 }, scrollTop: 0, isDirty: false, isActive: false }
        ]
      });
      
      const after = manager.captureContext({
        ...createTestContext('main'),
        files: [
          { path: 'a.ts', cursor: { line: 1, character: 0 }, scrollTop: 0, isDirty: false, isActive: true }
        ]
      });
      
      const diff = manager.diffSnapshots(before, after);
      
      expect(diff.closedFiles).toContain('b.ts');
      expect(diff.newFiles.length).toBe(0);
    });
    
    it('detects new files', () => {
      const before = manager.captureContext({
        ...createTestContext('main'),
        files: []
      });
      
      const after = manager.captureContext({
        ...createTestContext('main'),
        files: [
          { path: 'new.ts', cursor: { line: 1, character: 0 }, scrollTop: 0, isDirty: false, isActive: true }
        ]
      });
      
      const diff = manager.diffSnapshots(before, after);
      
      expect(diff.newFiles).toContain('new.ts');
    });
    
    it('detects cursor movements', () => {
      const before = manager.captureContext({
        ...createTestContext('main'),
        files: [
          { path: 'a.ts', cursor: { line: 10, character: 5 }, scrollTop: 0, isDirty: false, isActive: true }
        ]
      });
      
      const after = manager.captureContext({
        ...createTestContext('main'),
        files: [
          { path: 'a.ts', cursor: { line: 50, character: 10 }, scrollTop: 0, isDirty: false, isActive: true }
        ]
      });
      
      const diff = manager.diffSnapshots(before, after);
      
      expect(diff.movedCursors.length).toBe(1);
      expect(diff.movedCursors[0].from.line).toBe(10);
      expect(diff.movedCursors[0].to.line).toBe(50);
    });
    
    it('detects breakpoint changes', () => {
      const before = manager.captureContext({
        ...createTestContext('main'),
        breakpoints: [
          { path: 'a.ts', line: 10, enabled: true }
        ]
      });
      
      const after = manager.captureContext({
        ...createTestContext('main'),
        breakpoints: [
          { path: 'a.ts', line: 10, enabled: true },
          { path: 'b.ts', line: 20, enabled: true }
        ]
      });
      
      const diff = manager.diffSnapshots(before, after);
      
      expect(diff.breakpointChanges.added.length).toBe(1);
      expect(diff.breakpointChanges.added[0].path).toBe('b.ts');
    });
  });
  
  describe('import/export', () => {
    it('exports all snapshots', () => {
      manager.captureContext(createTestContext('main'));
      manager.captureContext(createTestContext('develop'));
      
      const exported = manager.exportSnapshots();
      
      expect(exported.length).toBe(2);
    });
    
    it('imports snapshots', () => {
      const snapshot = manager.captureContext(createTestContext('main'));
      const exported = manager.exportSnapshots();
      
      const newManager = new ContextManager();
      const imported = newManager.importSnapshots(exported);
      
      expect(imported).toBe(1);
      expect(newManager.getSnapshot(snapshot.id)).toBeDefined();
    });
    
    it('skips duplicate snapshots', () => {
      const snapshot = manager.captureContext(createTestContext('main'));
      const exported = manager.exportSnapshots();
      
      // Import twice
      manager.importSnapshots(exported);
      const imported = manager.importSnapshots(exported);
      
      expect(imported).toBe(0);
    });
  });
  
  describe('pruneOldSnapshots', () => {
    it('removes old snapshots', () => {
      const snapshot = manager.captureContext(createTestContext('main'));
      
      // Manually age the snapshot
      snapshot.timestamp = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      
      const pruned = manager.pruneOldSnapshots();
      
      expect(pruned).toBe(1);
      expect(manager.getSnapshots('main').length).toBe(0);
    });
  });
  
  describe('getStats', () => {
    it('returns correct statistics', () => {
      manager.captureContext(createTestContext('main'));
      manager.captureContext(createTestContext('main'));
      manager.captureContext(createTestContext('develop'));
      
      const stats = manager.getStats();
      
      expect(stats.totalSnapshots).toBe(3);
      expect(stats.branchCount).toBe(2);
      expect(stats.oldestSnapshot).toBeDefined();
      expect(stats.newestSnapshot).toBeDefined();
    });
  });
  
  describe('createMinimalSnapshot', () => {
    it('creates minimal snapshot structure', () => {
      const snapshot = createMinimalSnapshot('main', 'src/index.ts', ['src/api.ts']);
      
      expect(snapshot.branch).toBe('main');
      expect(snapshot.files.length).toBe(1);
      expect(snapshot.files[0].path).toBe('src/index.ts');
      expect(snapshot.git.modifiedFiles).toContain('src/api.ts');
    });
    
    it('handles no active file', () => {
      const snapshot = createMinimalSnapshot('main');
      
      expect(snapshot.files.length).toBe(0);
    });
  });
});
