/**
 * Context Snapshot & Restore
 * 
 * Captures and restores developer context:
 * - Open files and cursor positions
 * - Scroll positions
 * - Terminal history
 * - Uncommitted changes
 * - Breakpoints
 * - Search queries
 */

import { getLogger } from '../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Position in a file
 */
export interface FilePosition {
  line: number;
  character: number;
}

/**
 * State of an open file
 */
export interface OpenFileState {
  /** File path (relative to workspace) */
  path: string;
  /** Cursor position */
  cursor: FilePosition;
  /** Selection range if any */
  selection?: {
    start: FilePosition;
    end: FilePosition;
  };
  /** Scroll position (top visible line) */
  scrollTop: number;
  /** Whether file has unsaved changes */
  isDirty: boolean;
  /** View column/split position */
  viewColumn?: number;
  /** Is this the active file? */
  isActive: boolean;
  /** File language ID */
  languageId?: string;
}

/**
 * A breakpoint in code
 */
export interface BreakpointState {
  /** File path */
  path: string;
  /** Line number */
  line: number;
  /** Condition if conditional breakpoint */
  condition?: string;
  /** Hit count condition */
  hitCondition?: string;
  /** Log message for logpoint */
  logMessage?: string;
  /** Whether breakpoint is enabled */
  enabled: boolean;
}

/**
 * Terminal state
 */
export interface TerminalState {
  /** Terminal name/title */
  name: string;
  /** Current working directory */
  cwd?: string;
  /** Recent command history */
  history: string[];
  /** Shell type */
  shellType?: 'bash' | 'zsh' | 'powershell' | 'cmd' | 'fish' | 'other';
  /** Is this the active terminal? */
  isActive: boolean;
}

/**
 * Search/find state
 */
export interface SearchState {
  /** Search query */
  query: string;
  /** Search scope (workspace, folder, file) */
  scope: 'workspace' | 'folder' | 'file';
  /** Folder path if scope is folder */
  folderPath?: string;
  /** Include pattern */
  includePattern?: string;
  /** Exclude pattern */
  excludePattern?: string;
  /** Search options */
  options: {
    caseSensitive: boolean;
    wholeWord: boolean;
    regex: boolean;
  };
  /** Replace text if in replace mode */
  replaceText?: string;
}

/**
 * Git state snapshot
 */
export interface GitState {
  /** Current branch */
  branch: string;
  /** Uncommitted changes (file paths) */
  modifiedFiles: string[];
  /** Staged files */
  stagedFiles: string[];
  /** Untracked files */
  untrackedFiles: string[];
  /** Stash reference if changes were stashed */
  stashRef?: string;
  /** HEAD commit hash */
  headCommit: string;
  /** Whether there are merge conflicts */
  hasConflicts: boolean;
}

/**
 * Editor layout state
 */
export interface LayoutState {
  /** Editor groups (splits) */
  groups: Array<{
    /** Group ID */
    id: number;
    /** Files open in this group */
    files: string[];
    /** Active file in group */
    activeFile?: string;
    /** Size ratio */
    size?: number;
  }>;
  /** Panel visibility (terminal, output, etc) */
  panels: {
    terminal: boolean;
    output: boolean;
    problems: boolean;
    debugConsole: boolean;
  };
  /** Sidebar visibility */
  sidebar: {
    visible: boolean;
    activeView?: string;
  };
}

/**
 * Complete context snapshot
 */
export interface ContextSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** Branch this context is associated with */
  branch: string;
  /** Timestamp of capture */
  timestamp: Date;
  /** Human-readable description */
  description?: string;
  /** Open files state */
  files: OpenFileState[];
  /** Breakpoints */
  breakpoints: BreakpointState[];
  /** Terminal state */
  terminals: TerminalState[];
  /** Search state */
  searches: SearchState[];
  /** Git state */
  git: GitState;
  /** Editor layout */
  layout: LayoutState;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Snapshot version for compatibility */
  version: number;
}

/**
 * Summary of what changed between contexts
 */
export interface ContextDiff {
  /** Files that were open before but not now */
  closedFiles: string[];
  /** Files that are open now but weren't before */
  newFiles: string[];
  /** Files with changed cursor position */
  movedCursors: Array<{ path: string; from: FilePosition; to: FilePosition }>;
  /** Changed breakpoints */
  breakpointChanges: {
    added: BreakpointState[];
    removed: BreakpointState[];
  };
  /** Git changes */
  gitChanges?: {
    branchChanged: boolean;
    newModifiedFiles: string[];
    newStagedFiles: string[];
  };
}

/**
 * "Where was I?" summary
 */
export interface ContextSummary {
  /** Main file being worked on */
  primaryFile?: string;
  /** Line being edited */
  primaryLine?: number;
  /** Recent search if any */
  recentSearch?: string;
  /** Modified files count */
  modifiedFilesCount: number;
  /** Time since snapshot */
  timeSince: string;
  /** Quick actions available */
  quickActions: string[];
  /** Human-readable summary */
  summary: string;
}

/**
 * Configuration for context management
 */
export interface ContextConfig {
  /** Auto-capture on branch switch */
  autoCaptureOnBranchSwitch: boolean;
  /** Auto-restore when returning to branch */
  autoRestoreOnBranchReturn: boolean;
  /** Maximum snapshots to keep per branch */
  maxSnapshotsPerBranch: number;
  /** Include terminal history */
  includeTerminalHistory: boolean;
  /** Maximum terminal history lines */
  maxTerminalHistoryLines: number;
  /** Include search state */
  includeSearchState: boolean;
  /** Auto-stash uncommitted changes */
  autoStashChanges: boolean;
  /** Snapshot retention days */
  retentionDays: number;
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  autoCaptureOnBranchSwitch: true,
  autoRestoreOnBranchReturn: true,
  maxSnapshotsPerBranch: 5,
  includeTerminalHistory: true,
  maxTerminalHistoryLines: 100,
  includeSearchState: true,
  autoStashChanges: false,
  retentionDays: 30
};

// Current snapshot version
const SNAPSHOT_VERSION = 1;

// ============================================================================
// Context Manager
// ============================================================================

/**
 * Manages context snapshots
 */
export class ContextManager {
  private snapshots: Map<string, ContextSnapshot[]> = new Map(); // branch -> snapshots
  private config: ContextConfig;
  private currentBranch: string = 'main';
  
  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }
  
  /**
   * Capture current context
   */
  captureContext(context: Omit<ContextSnapshot, 'id' | 'timestamp' | 'version'>): ContextSnapshot {
    const logger = getLogger();
    
    const snapshot: ContextSnapshot = {
      ...context,
      id: generateSnapshotId(),
      timestamp: new Date(),
      version: SNAPSHOT_VERSION
    };
    
    // Store snapshot
    const branchSnapshots = this.snapshots.get(snapshot.branch) || [];
    branchSnapshots.unshift(snapshot);
    
    // Limit snapshots per branch
    if (branchSnapshots.length > this.config.maxSnapshotsPerBranch) {
      branchSnapshots.splice(this.config.maxSnapshotsPerBranch);
    }
    
    this.snapshots.set(snapshot.branch, branchSnapshots);
    
    logger.info('Context captured', {
      id: snapshot.id,
      branch: snapshot.branch,
      filesCount: snapshot.files.length
    });
    
    return snapshot;
  }
  
  /**
   * Get latest snapshot for a branch
   */
  getLatestSnapshot(branch: string): ContextSnapshot | undefined {
    const branchSnapshots = this.snapshots.get(branch);
    return branchSnapshots?.[0];
  }
  
  /**
   * Get all snapshots for a branch
   */
  getSnapshots(branch: string): ContextSnapshot[] {
    return this.snapshots.get(branch) || [];
  }
  
  /**
   * Get snapshot by ID
   */
  getSnapshot(id: string): ContextSnapshot | undefined {
    for (const snapshots of this.snapshots.values()) {
      const found = snapshots.find(s => s.id === id);
      if (found) return found;
    }
    return undefined;
  }
  
  /**
   * Delete a snapshot
   */
  deleteSnapshot(id: string): boolean {
    for (const [branch, snapshots] of this.snapshots) {
      const index = snapshots.findIndex(s => s.id === id);
      if (index !== -1) {
        snapshots.splice(index, 1);
        this.snapshots.set(branch, snapshots);
        return true;
      }
    }
    return false;
  }
  
  /**
   * Handle branch switch
   */
  onBranchSwitch(
    fromBranch: string,
    toBranch: string,
    currentContext: Omit<ContextSnapshot, 'id' | 'timestamp' | 'version' | 'branch'>
  ): {
    captured?: ContextSnapshot;
    toRestore?: ContextSnapshot;
  } {
    const logger = getLogger();
    const result: { captured?: ContextSnapshot; toRestore?: ContextSnapshot } = {};
    
    // Capture context for the branch we're leaving
    if (this.config.autoCaptureOnBranchSwitch) {
      result.captured = this.captureContext({
        ...currentContext,
        branch: fromBranch,
        description: `Auto-captured on switch to ${toBranch}`
      });
    }
    
    // Check if we have context to restore for the target branch
    if (this.config.autoRestoreOnBranchReturn) {
      result.toRestore = this.getLatestSnapshot(toBranch);
    }
    
    this.currentBranch = toBranch;
    
    logger.info('Branch switch handled', {
      from: fromBranch,
      to: toBranch,
      captured: !!result.captured,
      hasRestore: !!result.toRestore
    });
    
    return result;
  }
  
  /**
   * Generate "Where was I?" summary
   */
  generateSummary(snapshot: ContextSnapshot): ContextSummary {
    const activeFile = snapshot.files.find(f => f.isActive);
    const modifiedCount = snapshot.git.modifiedFiles.length + snapshot.git.stagedFiles.length;
    const timeSince = formatTimeSince(snapshot.timestamp);
    
    const quickActions: string[] = [];
    
    if (activeFile) {
      quickActions.push(`Open ${activeFile.path}:${activeFile.cursor.line}`);
    }
    
    if (modifiedCount > 0) {
      quickActions.push(`Review ${modifiedCount} changed files`);
    }
    
    if (snapshot.searches.length > 0) {
      quickActions.push(`Resume search: "${snapshot.searches[0].query}"`);
    }
    
    if (snapshot.breakpoints.length > 0) {
      quickActions.push(`${snapshot.breakpoints.length} breakpoints set`);
    }
    
    // Build summary
    let summary = '';
    
    if (activeFile) {
      summary = `Working on ${activeFile.path} at line ${activeFile.cursor.line}`;
    } else if (snapshot.files.length > 0) {
      summary = `${snapshot.files.length} files open`;
    } else {
      summary = 'No files were open';
    }
    
    if (modifiedCount > 0) {
      summary += `. ${modifiedCount} uncommitted changes`;
    }
    
    summary += `. ${timeSince} ago.`;
    
    return {
      primaryFile: activeFile?.path,
      primaryLine: activeFile?.cursor.line,
      recentSearch: snapshot.searches[0]?.query,
      modifiedFilesCount: modifiedCount,
      timeSince,
      quickActions,
      summary
    };
  }
  
  /**
   * Compare two snapshots
   */
  diffSnapshots(before: ContextSnapshot, after: ContextSnapshot): ContextDiff {
    const beforePaths = new Set(before.files.map(f => f.path));
    const afterPaths = new Set(after.files.map(f => f.path));
    
    const closedFiles = before.files
      .filter(f => !afterPaths.has(f.path))
      .map(f => f.path);
    
    const newFiles = after.files
      .filter(f => !beforePaths.has(f.path))
      .map(f => f.path);
    
    const movedCursors: ContextDiff['movedCursors'] = [];
    for (const afterFile of after.files) {
      const beforeFile = before.files.find(f => f.path === afterFile.path);
      if (beforeFile && 
          (beforeFile.cursor.line !== afterFile.cursor.line || 
           beforeFile.cursor.character !== afterFile.cursor.character)) {
        movedCursors.push({
          path: afterFile.path,
          from: beforeFile.cursor,
          to: afterFile.cursor
        });
      }
    }
    
    // Breakpoint changes
    const beforeBps = new Set(before.breakpoints.map(b => `${b.path}:${b.line}`));
    const afterBps = new Set(after.breakpoints.map(b => `${b.path}:${b.line}`));
    
    const addedBreakpoints = after.breakpoints.filter(
      b => !beforeBps.has(`${b.path}:${b.line}`)
    );
    const removedBreakpoints = before.breakpoints.filter(
      b => !afterBps.has(`${b.path}:${b.line}`)
    );
    
    // Git changes
    const beforeModified = new Set(before.git.modifiedFiles);
    const newModifiedFiles = after.git.modifiedFiles.filter(f => !beforeModified.has(f));
    
    const beforeStaged = new Set(before.git.stagedFiles);
    const newStagedFiles = after.git.stagedFiles.filter(f => !beforeStaged.has(f));
    
    return {
      closedFiles,
      newFiles,
      movedCursors,
      breakpointChanges: {
        added: addedBreakpoints,
        removed: removedBreakpoints
      },
      gitChanges: {
        branchChanged: before.git.branch !== after.git.branch,
        newModifiedFiles,
        newStagedFiles
      }
    };
  }
  
  /**
   * Prune old snapshots
   */
  pruneOldSnapshots(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
    
    let pruned = 0;
    
    for (const [branch, snapshots] of this.snapshots) {
      const filtered = snapshots.filter(s => s.timestamp >= cutoff);
      pruned += snapshots.length - filtered.length;
      this.snapshots.set(branch, filtered);
    }
    
    return pruned;
  }
  
  /**
   * Export all snapshots
   */
  exportSnapshots(): ContextSnapshot[] {
    const all: ContextSnapshot[] = [];
    for (const snapshots of this.snapshots.values()) {
      all.push(...snapshots);
    }
    return all;
  }
  
  /**
   * Import snapshots
   */
  importSnapshots(snapshots: ContextSnapshot[]): number {
    let imported = 0;
    
    for (const snapshot of snapshots) {
      // Validate version
      if (snapshot.version !== SNAPSHOT_VERSION) {
        continue; // Skip incompatible versions
      }
      
      // Restore date objects
      const restored: ContextSnapshot = {
        ...snapshot,
        timestamp: new Date(snapshot.timestamp)
      };
      
      const branchSnapshots = this.snapshots.get(restored.branch) || [];
      
      // Check for duplicates
      if (!branchSnapshots.some(s => s.id === restored.id)) {
        branchSnapshots.push(restored);
        imported++;
      }
      
      // Sort by timestamp (newest first)
      branchSnapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      // Limit
      if (branchSnapshots.length > this.config.maxSnapshotsPerBranch) {
        branchSnapshots.splice(this.config.maxSnapshotsPerBranch);
      }
      
      this.snapshots.set(restored.branch, branchSnapshots);
    }
    
    return imported;
  }
  
  /**
   * Get all branches with snapshots
   */
  getBranches(): string[] {
    return Array.from(this.snapshots.keys());
  }
  
  /**
   * Get stats
   */
  getStats(): {
    totalSnapshots: number;
    branchCount: number;
    oldestSnapshot?: Date;
    newestSnapshot?: Date;
  } {
    let total = 0;
    let oldest: Date | undefined;
    let newest: Date | undefined;
    
    for (const snapshots of this.snapshots.values()) {
      total += snapshots.length;
      
      for (const s of snapshots) {
        if (!oldest || s.timestamp < oldest) oldest = s.timestamp;
        if (!newest || s.timestamp > newest) newest = s.timestamp;
      }
    }
    
    return {
      totalSnapshots: total,
      branchCount: this.snapshots.size,
      oldestSnapshot: oldest,
      newestSnapshot: newest
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Generate unique snapshot ID
 */
function generateSnapshotId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ctx_${timestamp}_${random}`;
}

/**
 * Format time since a date
 */
function formatTimeSince(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} week${weeks === 1 ? '' : 's'}`;
  
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'}`;
}

/**
 * Create a minimal snapshot from current state
 */
export function createMinimalSnapshot(
  branch: string,
  activeFilePath?: string,
  modifiedFiles: string[] = []
): Omit<ContextSnapshot, 'id' | 'timestamp' | 'version'> {
  return {
    branch,
    files: activeFilePath ? [{
      path: activeFilePath,
      cursor: { line: 1, character: 0 },
      scrollTop: 0,
      isDirty: false,
      isActive: true
    }] : [],
    breakpoints: [],
    terminals: [],
    searches: [],
    git: {
      branch,
      modifiedFiles,
      stagedFiles: [],
      untrackedFiles: [],
      headCommit: '',
      hasConflicts: false
    },
    layout: {
      groups: [],
      panels: {
        terminal: false,
        output: false,
        problems: false,
        debugConsole: false
      },
      sidebar: {
        visible: true
      }
    }
  };
}
