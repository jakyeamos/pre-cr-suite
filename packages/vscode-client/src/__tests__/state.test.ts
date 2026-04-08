/**
 * State Manager Tests
 * 
 * Tests for centralized state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Must mock vscode before importing state
vi.mock('vscode', () => ({
  Disposable: class {
    constructor(private cb?: () => void) {}
    dispose() { this.cb?.(); }
  }
}));

// Import after mocking
import { 
  state, 
  initState, 
  isCoverageActive, 
  isDebugRecording, 
  hasSecurityIssues, 
  getBranchStatus, 
  formatElapsedTime 
} from '../utils/state';

// Create mock extension context
function createMockContext() {
  const store = new Map<string, any>();
  return {
    subscriptions: [],
    globalState: {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn(async (key: string, value: any) => { store.set(key, value); })
    },
    workspaceState: {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn(async (key: string, value: any) => { store.set(key, value); })
    },
    extensionPath: '/mock/path',
    asAbsolutePath: (p: string) => `/mock/path/${p}`
  };
}

describe('State Manager', () => {
  beforeEach(() => {
    // Reset state before each test
    state.reset();
  });

  describe('Coverage State', () => {
    it('should have default coverage state', () => {
      const coverage = state.get('coverage');
      expect(coverage.isLoaded).toBe(false);
      expect(coverage.percent).toBeNull();
      expect(coverage.fileCount).toBe(0);
      expect(coverage.isVisible).toBe(true);
    });

    it('should update coverage state', () => {
      state.setCoverage({ isLoaded: true, percent: 85.5, fileCount: 10 });
      
      const coverage = state.get('coverage');
      expect(coverage.isLoaded).toBe(true);
      expect(coverage.percent).toBe(85.5);
      expect(coverage.fileCount).toBe(10);
    });

    it('should partially update coverage state', () => {
      state.setCoverage({ isLoaded: true, percent: 80 });
      state.setCoverage({ fileCount: 5 });
      
      const coverage = state.get('coverage');
      expect(coverage.isLoaded).toBe(true);
      expect(coverage.percent).toBe(80);
      expect(coverage.fileCount).toBe(5);
    });

    it('should notify listeners on coverage change', () => {
      const listener = vi.fn();
      state.subscribe('coverage', listener);
      
      state.setCoverage({ percent: 75 });
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 75 }),
        expect.objectContaining({ percent: null })
      );
    });
  });

  describe('Security State', () => {
    it('should have default security state', () => {
      const security = state.get('security');
      expect(security.issueCount).toBe(0);
      expect(security.lastScanTime).toBeNull();
      expect(security.scanInProgress).toBe(false);
    });

    it('should update security state', () => {
      const now = new Date();
      state.setSecurity({ issueCount: 3, lastScanTime: now, lastScanScope: 'file' });
      
      const security = state.get('security');
      expect(security.issueCount).toBe(3);
      expect(security.lastScanTime).toBe(now);
      expect(security.lastScanScope).toBe('file');
    });

    it('should track scan in progress', () => {
      state.setSecurity({ scanInProgress: true });
      expect(state.get('security').scanInProgress).toBe(true);
      
      state.setSecurity({ scanInProgress: false, issueCount: 2 });
      expect(state.get('security').scanInProgress).toBe(false);
      expect(state.get('security').issueCount).toBe(2);
    });
  });

  describe('Debug State', () => {
    it('should have default debug state', () => {
      const debug = state.get('debug');
      expect(debug.isRecording).toBe(false);
      expect(debug.startTime).toBeNull();
      expect(debug.elapsedTime).toBe('0s');
      expect(debug.hitCount).toBe(0);
    });

    it('should update debug recording state', () => {
      const startTime = new Date();
      state.setDebug({ isRecording: true, startTime, elapsedTime: '0s' });
      
      const debug = state.get('debug');
      expect(debug.isRecording).toBe(true);
      expect(debug.startTime).toBe(startTime);
    });

    it('should update elapsed time and hit count', () => {
      state.setDebug({ isRecording: true, elapsedTime: '1:30', hitCount: 5 });
      
      const debug = state.get('debug');
      expect(debug.elapsedTime).toBe('1:30');
      expect(debug.hitCount).toBe(5);
    });
  });

  describe('Context State', () => {
    it('should have default context state', () => {
      const context = state.get('context');
      expect(context.currentBranch).toBeNull();
      expect(context.hasSnapshot).toBe(false);
      expect(context.snapshotDescription).toBeNull();
    });

    it('should update context state', () => {
      state.setContext({ 
        currentBranch: 'feature/test', 
        hasSnapshot: true, 
        snapshotDescription: 'Working on tests' 
      });
      
      const context = state.get('context');
      expect(context.currentBranch).toBe('feature/test');
      expect(context.hasSnapshot).toBe(true);
      expect(context.snapshotDescription).toBe('Working on tests');
    });
  });

  describe('LSP Connection', () => {
    it('should have default LSP state', () => {
      expect(state.get('isLspConnected')).toBe(false);
    });

    it('should update LSP connection status', () => {
      state.setLspConnected(true);
      expect(state.get('isLspConnected')).toBe(true);
      
      state.setLspConnected(false);
      expect(state.get('isLspConnected')).toBe(false);
    });

    it('should notify listeners on LSP state change', () => {
      const listener = vi.fn();
      state.subscribe('isLspConnected', listener);
      
      state.setLspConnected(true);
      
      expect(listener).toHaveBeenCalledWith(true, false);
    });
  });

  describe('Recent Actions', () => {
    it('should have empty recent actions by default', () => {
      expect(state.getRecentActions()).toEqual([]);
    });

    it('should add recent actions', () => {
      state.addRecentAction('preCr.securityScan');
      state.addRecentAction('preCr.generateDocs');
      
      const recent = state.getRecentActions();
      expect(recent).toHaveLength(2);
      expect(recent[0]).toBe('preCr.generateDocs'); // Most recent first
      expect(recent[1]).toBe('preCr.securityScan');
    });

    it('should not duplicate actions', () => {
      state.addRecentAction('preCr.securityScan');
      state.addRecentAction('preCr.generateDocs');
      state.addRecentAction('preCr.securityScan'); // Duplicate
      
      const recent = state.getRecentActions();
      expect(recent).toHaveLength(2);
      expect(recent[0]).toBe('preCr.securityScan'); // Moved to front
    });

    it('should limit to 5 recent actions', () => {
      for (let i = 0; i < 10; i++) {
        state.addRecentAction(`preCr.action${i}`);
      }
      
      expect(state.getRecentActions()).toHaveLength(5);
    });
  });

  describe('Subscriptions', () => {
    it('should allow multiple subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      state.subscribe('coverage', listener1);
      state.subscribe('coverage', listener2);
      
      state.setCoverage({ percent: 50 });
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should allow unsubscribing', () => {
      const listener = vi.fn();
      const disposable = state.subscribe('coverage', listener);
      
      state.setCoverage({ percent: 50 });
      expect(listener).toHaveBeenCalledTimes(1);
      
      disposable.dispose();
      
      state.setCoverage({ percent: 60 });
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should support subscribeAll', () => {
      const listener = vi.fn();
      state.subscribeAll(listener);
      
      state.setCoverage({ percent: 50 });
      state.setSecurity({ issueCount: 1 });
      
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('Reset', () => {
    it('should reset all state to initial values', () => {
      state.setCoverage({ isLoaded: true, percent: 80 });
      state.setSecurity({ issueCount: 5 });
      state.setDebug({ isRecording: true });
      state.setContext({ currentBranch: 'main', hasSnapshot: true });
      state.setLspConnected(true);
      
      state.reset();
      
      expect(state.get('coverage').isLoaded).toBe(false);
      expect(state.get('security').issueCount).toBe(0);
      expect(state.get('debug').isRecording).toBe(false);
      expect(state.get('context').hasSnapshot).toBe(false);
      expect(state.get('isLspConnected')).toBe(false);
    });

    it('should notify all listeners on reset', () => {
      const coverageListener = vi.fn();
      const securityListener = vi.fn();
      
      state.subscribe('coverage', coverageListener);
      state.subscribe('security', securityListener);
      
      state.setCoverage({ percent: 80 });
      state.setSecurity({ issueCount: 3 });
      
      coverageListener.mockClear();
      securityListener.mockClear();
      
      state.reset();
      
      expect(coverageListener).toHaveBeenCalled();
      expect(securityListener).toHaveBeenCalled();
    });
  });

  describe('Convenience Functions', () => {
    it('isCoverageActive should check loaded and visible', () => {
      expect(isCoverageActive()).toBe(false);
      
      state.setCoverage({ isLoaded: true, isVisible: true });
      expect(isCoverageActive()).toBe(true);
      
      state.setCoverage({ isVisible: false });
      expect(isCoverageActive()).toBe(false);
    });

    it('isDebugRecording should check recording state', () => {
      expect(isDebugRecording()).toBe(false);
      
      state.setDebug({ isRecording: true });
      expect(isDebugRecording()).toBe(true);
    });

    it('hasSecurityIssues should check issue count', () => {
      expect(hasSecurityIssues()).toBe(false);
      
      state.setSecurity({ issueCount: 1 });
      expect(hasSecurityIssues()).toBe(true);
    });

    it('getBranchStatus should return branch and snapshot info', () => {
      const status = getBranchStatus();
      expect(status.branch).toBeNull();
      expect(status.hasSnapshot).toBe(false);
      
      state.setContext({ currentBranch: 'feature/x', hasSnapshot: true });
      
      const updated = getBranchStatus();
      expect(updated.branch).toBe('feature/x');
      expect(updated.hasSnapshot).toBe(true);
    });
  });

  describe('formatElapsedTime', () => {
    it('should return 0s for null', () => {
      expect(formatElapsedTime(null)).toBe('0s');
    });

    it('should format seconds', () => {
      const now = new Date();
      const thirtySecsAgo = new Date(now.getTime() - 30000);
      
      const result = formatElapsedTime(thirtySecsAgo);
      expect(result).toMatch(/^\d+s$/);
    });

    it('should format minutes and seconds', () => {
      const now = new Date();
      const twoMinsAgo = new Date(now.getTime() - 125000); // 2:05
      
      const result = formatElapsedTime(twoMinsAgo);
      expect(result).toMatch(/^\d+:\d{2}$/);
    });
  });
});

describe('State Initialization', () => {
  it('should initialize with extension context', () => {
    const context = createMockContext();
    
    // Reset and init
    state.reset();
    initState(context as any);
    
    // State should be accessible
    expect(state.getState()).toBeDefined();
  });
});
