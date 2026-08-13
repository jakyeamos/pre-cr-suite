import { ContextManager } from '@pre-cr/core';
import type { ContextConfig, ContextSnapshot, ContextSummary } from '@pre-cr/core';
import type { Connection } from 'vscode-languageserver/node';

export function registerContextRequests(connection: Connection): void {
  let contextManager: ContextManager | null = null;

  // Initialize context manager
  connection.onRequest(
    '$/preCr/initContextManager',
    async (params: { config?: Partial<ContextConfig> }): Promise<{
      success: boolean;
    }> => {
      contextManager = new ContextManager(params.config);
      return { success: true };
    }
  );

  // Capture current context
  connection.onRequest(
    '$/preCr/captureContext',
    async (params: {
      branch: string;
      description?: string;
      files: Array<{
        path: string;
        cursor: { line: number; character: number };
        scrollTop: number;
        isDirty: boolean;
        isActive: boolean;
      }>;
      breakpoints?: Array<{
        path: string;
        line: number;
        condition?: string;
        enabled: boolean;
      }>;
      terminals?: Array<{
        name: string;
        cwd?: string;
        history: string[];
        isActive: boolean;
      }>;
      git: {
        branch: string;
        modifiedFiles: string[];
        stagedFiles: string[];
        headCommit: string;
      };
    }): Promise<{
      snapshot: { id: string; branch: string; timestamp: string } | null;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          contextManager = new ContextManager();
        }

        const snapshot = contextManager.captureContext({
          branch: params.branch,
          description: params.description,
          files: params.files,
          breakpoints: params.breakpoints || [],
          terminals: params.terminals || [],
          searches: [],
          git: {
            ...params.git,
            untrackedFiles: [],
            hasConflicts: false
          },
          layout: {
            groups: [],
            panels: { terminal: false, output: false, problems: false, debugConsole: false },
            sidebar: { visible: true }
          }
        });

        return {
          snapshot: {
            id: snapshot.id,
            branch: snapshot.branch,
            timestamp: snapshot.timestamp.toISOString()
          }
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { snapshot: null, error: errorMessage };
      }
    }
  );

  // Get latest snapshot for branch
  connection.onRequest(
    '$/preCr/getLatestSnapshot',
    async (params: { branch: string }): Promise<{
      snapshot: ContextSnapshot | null;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { snapshot: null, error: 'Context manager not initialized' };
        }

        const snapshot = contextManager.getLatestSnapshot(params.branch);
        return { snapshot: snapshot || null };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { snapshot: null, error: errorMessage };
      }
    }
  );

  // Get one snapshot by its stable ID. The client uses this after the user
  // selects a summary so an older snapshot cannot be replaced by a newer
  // snapshot from the same branch during restore.
  connection.onRequest(
    '$/preCr/getSnapshot',
    async (params: { id: string }): Promise<{
      snapshot: ContextSnapshot | null;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { snapshot: null, error: 'Context manager not initialized' };
        }

        const snapshot = contextManager.getSnapshot(params.id);
        return { snapshot: snapshot || null };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { snapshot: null, error: errorMessage };
      }
    }
  );

  // Handle branch switch
  connection.onRequest(
    '$/preCr/onBranchSwitch',
    async (params: {
      fromBranch: string;
      toBranch: string;
      currentContext: {
        files: Array<{
          path: string;
          cursor: { line: number; character: number };
          scrollTop: number;
          isDirty: boolean;
          isActive: boolean;
        }>;
        git: {
          modifiedFiles: string[];
          stagedFiles: string[];
          headCommit: string;
        };
      };
    }): Promise<{
      captured?: { id: string; branch: string };
      toRestore?: ContextSnapshot;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          contextManager = new ContextManager();
        }

        const result = contextManager.onBranchSwitch(
          params.fromBranch,
          params.toBranch,
          {
            files: params.currentContext.files,
            breakpoints: [],
            terminals: [],
            searches: [],
            git: {
              branch: params.fromBranch,
              ...params.currentContext.git,
              untrackedFiles: [],
              hasConflicts: false
            },
            layout: {
              groups: [],
              panels: { terminal: false, output: false, problems: false, debugConsole: false },
              sidebar: { visible: true }
            }
          }
        );

        return {
          captured: result.captured ? {
            id: result.captured.id,
            branch: result.captured.branch
          } : undefined,
          toRestore: result.toRestore
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { error: errorMessage };
      }
    }
  );

  // Get "Where was I?" summary
  connection.onRequest(
    '$/preCr/getContextSummary',
    async (params: { branch: string }): Promise<{
      summary: ContextSummary | null;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { summary: null, error: 'Context manager not initialized' };
        }

        const snapshot = contextManager.getLatestSnapshot(params.branch);
        if (!snapshot) {
          return { summary: null, error: 'No snapshot found for branch' };
        }

        const summary = contextManager.generateSummary(snapshot);
        return { summary };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { summary: null, error: errorMessage };
      }
    }
  );

  // List all snapshots for a branch
  connection.onRequest(
    '$/preCr/listSnapshots',
    async (params: { branch?: string }): Promise<{
      snapshots: Array<{
        id: string;
        branch: string;
        timestamp: string;
        description?: string;
        filesCount: number;
      }>;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { snapshots: [], error: 'Context manager not initialized' };
        }

        let allSnapshots: ContextSnapshot[] = [];

        if (params.branch) {
          allSnapshots = contextManager.getSnapshots(params.branch);
        } else {
          allSnapshots = contextManager.exportSnapshots();
        }

        return {
          snapshots: allSnapshots.map(s => ({
            id: s.id,
            branch: s.branch,
            timestamp: s.timestamp.toISOString(),
            description: s.description,
            filesCount: s.files.length
          }))
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { snapshots: [], error: errorMessage };
      }
    }
  );

  // Delete a snapshot
  connection.onRequest(
    '$/preCr/deleteSnapshot',
    async (params: { id: string }): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { success: false, error: 'Context manager not initialized' };
        }

        const deleted = contextManager.deleteSnapshot(params.id);
        return { success: deleted };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Export context snapshots
  connection.onRequest(
    '$/preCr/exportContextSnapshots',
    async (): Promise<{
      snapshots: ContextSnapshot[];
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { snapshots: [], error: 'Context manager not initialized' };
        }

        return { snapshots: contextManager.exportSnapshots() };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { snapshots: [], error: errorMessage };
      }
    }
  );

  // Import context snapshots
  connection.onRequest(
    '$/preCr/importContextSnapshots',
    async (params: { snapshots: ContextSnapshot[] }): Promise<{
      imported: number;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          contextManager = new ContextManager();
        }

        const imported = contextManager.importSnapshots(params.snapshots);
        return { imported };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { imported: 0, error: errorMessage };
      }
    }
  );

  // Get context manager stats
  connection.onRequest(
    '$/preCr/getContextStats',
    async (): Promise<{
      stats: {
        totalSnapshots: number;
        branchCount: number;
        branches: string[];
      } | null;
      error?: string;
    }> => {
      try {
        if (!contextManager) {
          return { stats: null, error: 'Context manager not initialized' };
        }

        const stats = contextManager.getStats();
        const branches = contextManager.getBranches();

        return {
          stats: {
            totalSnapshots: stats.totalSnapshots,
            branchCount: stats.branchCount,
            branches
          }
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { stats: null, error: errorMessage };
      }
    }
  );

  // ============================================================================
  // Debug Intelligence Methods (Phase 5)
  // ============================================================================

  // Debug session manager instance
}
