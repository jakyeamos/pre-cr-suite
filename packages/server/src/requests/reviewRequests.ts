import { estimateReviewTime, FlakyTestDetective, parseJestResults, parseVitestResults } from '@pre-cr/core';
import type { FileChange, FlakyTestReport, ReviewerInfo, ReviewTimeEstimate, TestRunResult } from '@pre-cr/core';
import type { Connection } from 'vscode-languageserver/node';
import * as fs from 'fs';
import type { ServerRequestState } from '../serverSettings';
import { resolveReadableWorkspacePath } from './workspacePath';

export function registerReviewRequests(connection: Connection, state: Pick<ServerRequestState, 'workspaceRoot'>): void {
  let flakyDetective: FlakyTestDetective | null = null;

  // Estimate review time for a PR
  interface EstimateReviewTimeParams {
    /** Changed files */
    changes: FileChange[];
    /** Optional: known reviewers for suggestions */
    reviewers?: ReviewerInfo[];
  }

  connection.onRequest(
    '$/preCr/estimateReviewTime',
    async (params: EstimateReviewTimeParams): Promise<{
      estimate: ReviewTimeEstimate | null;
      error?: string;
    }> => {
      try {
        // Optionally load file contents for complexity analysis
        const fileContents = new Map<string, string>();

        if (state.workspaceRoot) {
          for (const change of params.changes) {
            if (change.isDeleted) continue;

            const resolvedFile = resolveReadableWorkspacePath(state.workspaceRoot, change.path);
            if (!resolvedFile.valid) {
              return { estimate: null, error: resolvedFile.error };
            }

            try {
              if (fs.existsSync(resolvedFile.path)) {
                fileContents.set(change.path, fs.readFileSync(resolvedFile.path, 'utf-8'));
              }
            } catch {
              // Skip files that can't be read
            }
          }
        }

        const estimate = estimateReviewTime(
          params.changes,
          fileContents.size > 0 ? fileContents : undefined,
          params.reviewers
        );

        return { estimate };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { estimate: null, error: errorMessage };
      }
    }
  );

  // Initialize flaky test detective
  connection.onRequest(
    '$/preCr/initFlakyDetective',
    async (params: { config?: { minRuns?: number; flakinessThreshold?: number } }): Promise<{
      success: boolean;
    }> => {
      flakyDetective = new FlakyTestDetective(params.config);
      return { success: true };
    }
  );

  // Record test results for flaky detection
  connection.onRequest(
    '$/preCr/recordTestResults',
    async (params: {
      results: TestRunResult[];
      format?: 'raw' | 'jest' | 'vitest';
      rawOutput?: unknown;
    }): Promise<{
      recorded: number;
      error?: string;
    }> => {
      try {
        if (!flakyDetective) {
          flakyDetective = new FlakyTestDetective();
        }

        let results: TestRunResult[] = params.results;

        // Parse from test runner output if provided
        if (params.format === 'jest' && params.rawOutput) {
          results = parseJestResults(params.rawOutput as Parameters<typeof parseJestResults>[0]);
        } else if (params.format === 'vitest' && params.rawOutput) {
          results = parseVitestResults(params.rawOutput as Parameters<typeof parseVitestResults>[0]);
        }

        flakyDetective.recordResults(results);

        return { recorded: results.length };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { recorded: 0, error: errorMessage };
      }
    }
  );

  // Get flaky test report
  connection.onRequest(
    '$/preCr/getFlakyTestReport',
    async (): Promise<{
      report: FlakyTestReport | null;
      error?: string;
    }> => {
      try {
        if (!flakyDetective) {
          return { report: null, error: 'Flaky detective not initialized' };
        }

        const report = flakyDetective.generateReport();
        return { report };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { report: null, error: errorMessage };
      }
    }
  );

  // Get flaky tests list
  connection.onRequest(
    '$/preCr/getFlakyTests',
    async (): Promise<{
      tests: Array<{
        testId: string;
        file: string;
        name: string;
        flakinessScore: number;
        totalRuns: number;
        failures: number;
      }>;
      error?: string;
    }> => {
      try {
        if (!flakyDetective) {
          return { tests: [], error: 'Flaky detective not initialized' };
        }

        const flakyTests = flakyDetective.getFlakyTests();

        return {
          tests: flakyTests.map(t => ({
            testId: t.testId,
            file: t.file,
            name: t.name,
            flakinessScore: t.flakinessScore,
            totalRuns: t.totalRuns,
            failures: t.failures
          }))
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { tests: [], error: errorMessage };
      }
    }
  );

  // Quarantine a flaky test
  connection.onRequest(
    '$/preCr/quarantineTest',
    async (params: { testId: string }): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        if (!flakyDetective) {
          return { success: false, error: 'Flaky detective not initialized' };
        }

        flakyDetective.quarantine(params.testId);
        return { success: true };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { success: false, error: errorMessage };
      }
    }
  );

  // Export flaky test history (for persistence)
  connection.onRequest(
    '$/preCr/exportFlakyHistory',
    async (): Promise<{
      history: unknown[];
      error?: string;
    }> => {
      try {
        if (!flakyDetective) {
          return { history: [], error: 'Flaky detective not initialized' };
        }

        return { history: flakyDetective.exportHistory() };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { history: [], error: errorMessage };
      }
    }
  );

  // Import flaky test history
  connection.onRequest(
    '$/preCr/importFlakyHistory',
    async (params: { history: unknown[] }): Promise<{
      imported: number;
      error?: string;
    }> => {
      try {
        if (!flakyDetective) {
          flakyDetective = new FlakyTestDetective();
        }

        flakyDetective.importHistory(params.history as Parameters<typeof flakyDetective.importHistory>[0]);
        return { imported: params.history.length };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return { imported: 0, error: errorMessage };
      }
    }
  );

  // ============================================================================
  // Context Preservation Methods (Phase 4)
  // ============================================================================

  // Context manager instance (per workspace)
}
