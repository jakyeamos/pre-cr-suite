/**
 * Centralized State Management
 * 
 * Single source of truth for extension state, enabling:
 * - Consistent state access across modules
 * - State change subscriptions
 * - Persistence where needed
 * - Easy debugging and testing
 */

import * as vscode from 'vscode';

// ============================================================================
// State Types
// ============================================================================

export interface CoverageState {
  isLoaded: boolean;
  percent: number | null;
  fileCount: number;
  isVisible: boolean;
  lastLoadedFile: string | null;
}

export interface SecurityState {
  issueCount: number;
  lastScanTime: Date | null;
  lastScanScope: 'file' | 'workspace' | 'changes' | null;
  scanInProgress: boolean;
}

export interface DebugState {
  isRecording: boolean;
  startTime: Date | null;
  elapsedTime: string;
  hitCount: number;
}

export interface ContextState {
  currentBranch: string | null;
  hasSnapshot: boolean;
  snapshotDescription: string | null;
}

export interface ExtensionState {
  coverage: CoverageState;
  security: SecurityState;
  debug: DebugState;
  context: ContextState;
  recentActions: string[];
  isLspConnected: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ExtensionState = {
  coverage: {
    isLoaded: false,
    percent: null,
    fileCount: 0,
    isVisible: true,
    lastLoadedFile: null
  },
  security: {
    issueCount: 0,
    lastScanTime: null,
    lastScanScope: null,
    scanInProgress: false
  },
  debug: {
    isRecording: false,
    startTime: null,
    elapsedTime: '0s',
    hitCount: 0
  },
  context: {
    currentBranch: null,
    hasSnapshot: false,
    snapshotDescription: null
  },
  recentActions: [],
  isLspConnected: false
};

// ============================================================================
// State Manager Class
// ============================================================================

type StateListener<T> = (newValue: T, oldValue: T) => void;
type StateKey = keyof ExtensionState;

class StateManager {
  private state: ExtensionState;
  private listeners: Map<string, Set<StateListener<any>>> = new Map();
  private extensionContext: vscode.ExtensionContext | null = null;

  constructor() {
    this.state = { ...initialState };
  }

  /**
   * Initialize with extension context for persistence
   */
  init(context: vscode.ExtensionContext) {
    this.extensionContext = context;
    
    // Restore persisted state
    const persisted = context.globalState.get<Partial<ExtensionState>>('preCr.state');
    if (persisted) {
      // Only restore certain fields
      if (persisted.recentActions) {
        this.state.recentActions = persisted.recentActions;
      }
    }
  }

  /**
   * Get the full state (readonly)
   */
  getState(): Readonly<ExtensionState> {
    return this.state;
  }

  /**
   * Get a specific state section
   */
  get<K extends StateKey>(key: K): Readonly<ExtensionState[K]> {
    return this.state[key];
  }

  /**
   * Update coverage state
   */
  setCoverage(updates: Partial<CoverageState>) {
    const oldValue = { ...this.state.coverage };
    this.state.coverage = { ...this.state.coverage, ...updates };
    this.notifyListeners('coverage', this.state.coverage, oldValue);
  }

  /**
   * Update security state
   */
  setSecurity(updates: Partial<SecurityState>) {
    const oldValue = { ...this.state.security };
    this.state.security = { ...this.state.security, ...updates };
    this.notifyListeners('security', this.state.security, oldValue);
  }

  /**
   * Update debug state
   */
  setDebug(updates: Partial<DebugState>) {
    const oldValue = { ...this.state.debug };
    this.state.debug = { ...this.state.debug, ...updates };
    this.notifyListeners('debug', this.state.debug, oldValue);
  }

  /**
   * Update context state
   */
  setContext(updates: Partial<ContextState>) {
    const oldValue = { ...this.state.context };
    this.state.context = { ...this.state.context, ...updates };
    this.notifyListeners('context', this.state.context, oldValue);
  }

  /**
   * Set LSP connection status
   */
  setLspConnected(connected: boolean) {
    const oldValue = this.state.isLspConnected;
    this.state.isLspConnected = connected;
    this.notifyListeners('isLspConnected', connected, oldValue);
  }

  /**
   * Add a recent action (maintains max 5)
   */
  addRecentAction(command: string) {
    const MAX_RECENT = 5;
    const filtered = this.state.recentActions.filter(a => a !== command);
    this.state.recentActions = [command, ...filtered].slice(0, MAX_RECENT);
    this.persist();
    this.notifyListeners('recentActions', this.state.recentActions, filtered);
  }

  /**
   * Get recent actions
   */
  getRecentActions(): readonly string[] {
    return this.state.recentActions;
  }

  /**
   * Subscribe to state changes
   */
  subscribe<K extends StateKey>(
    key: K,
    listener: StateListener<ExtensionState[K]>
  ): vscode.Disposable {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    return {
      dispose: () => {
        this.listeners.get(key)?.delete(listener);
      }
    };
  }

  /**
   * Subscribe to any state change
   */
  subscribeAll(listener: (state: ExtensionState) => void): vscode.Disposable {
    const disposables: vscode.Disposable[] = [];
    
    for (const key of Object.keys(this.state) as StateKey[]) {
      disposables.push(
        this.subscribe(key, () => listener(this.state))
      );
    }

    return {
      dispose: () => disposables.forEach(d => d.dispose())
    };
  }

  /**
   * Reset to initial state
   */
  reset() {
    const oldState = { ...this.state };
    this.state = { ...initialState };
    
    for (const key of Object.keys(this.state) as StateKey[]) {
      this.notifyListeners(key, this.state[key], oldState[key]);
    }
  }

  /**
   * Notify listeners of state change
   */
  private notifyListeners<T>(key: string, newValue: T, oldValue: T) {
    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(newValue, oldValue);
        } catch (error) {
          console.error(`State listener error for ${key}:`, error);
        }
      }
    }
  }

  /**
   * Persist state to globalState
   */
  private persist() {
    if (this.extensionContext) {
      // Only persist certain fields
      this.extensionContext.globalState.update('preCr.state', {
        recentActions: this.state.recentActions
      });
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const state = new StateManager();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize state manager with extension context
 */
export function initState(context: vscode.ExtensionContext) {
  state.init(context);
}

/**
 * Check if coverage is loaded and visible
 */
export function isCoverageActive(): boolean {
  const coverage = state.get('coverage');
  return coverage.isLoaded && coverage.isVisible;
}

/**
 * Check if debug capture is in progress
 */
export function isDebugRecording(): boolean {
  return state.get('debug').isRecording;
}

/**
 * Check if there are security issues
 */
export function hasSecurityIssues(): boolean {
  return state.get('security').issueCount > 0;
}

/**
 * Get current branch with snapshot status
 */
export function getBranchStatus(): { branch: string | null; hasSnapshot: boolean } {
  const ctx = state.get('context');
  return {
    branch: ctx.currentBranch,
    hasSnapshot: ctx.hasSnapshot
  };
}

/**
 * Format debug elapsed time from start time
 */
export function formatElapsedTime(startTime: Date | null): string {
  if (!startTime) return '0s';
  
  const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}
