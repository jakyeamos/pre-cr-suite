import { parseIstanbulFile, parseLcovFile } from '@pre-cr/core';
import { runChecklist, DEFAULT_CHECKLIST_CONFIG } from '@pre-cr/core/experimental';
import type { ChecklistConfig, ChecklistInput, ChecklistResult, FileChange, FileContent, SourceFile } from '@pre-cr/core/experimental';
import type { WorkspaceCoverage } from '@pre-cr/core';
import type { Connection } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import type { ServerRequestState } from '../serverSettings';
import { resolveReadableWorkspacePath } from './workspacePath';

export function registerChecklistRequests(connection: Connection, state: ServerRequestState): void {
  interface RunChecklistParams {
    /** Files that have changed (from git diff) */
    changes: FileChange[];
    /** Optional: base branch coverage for delta calculation */
    baseCoveragePath?: string;
  }

  interface RunChecklistResponse {
    result: ChecklistResult | null;
    error?: string;
  }

  connection.onRequest(
    '$/preCr/runChecklist',
    async (params: RunChecklistParams): Promise<RunChecklistResponse> => {
      if (!state.workspaceRoot) {
        return { result: null, error: 'No workspace root' };
      }

      if (!state.globalSettings.checklist.enabled) {
        return { result: null, error: 'Checklist is disabled' };
      }

      try {
        // Build checklist config from settings
        const config: Partial<ChecklistConfig> = {
          prSize: state.globalSettings.checklist.prSize,
          docCoverage: {
            ...DEFAULT_CHECKLIST_CONFIG.docCoverage,
            minCoverage: state.globalSettings.checklist.docCoverage.minCoverage
          },
          testCoverageDelta: {
            ...DEFAULT_CHECKLIST_CONFIG.testCoverageDelta,
            minNewCodeCoverage: state.globalSettings.checklist.testCoverage.minNewCodeCoverage
          }
        };

        // Gather file contents for security scanning
        const files: FileContent[] = [];
        const sourceFiles: SourceFile[] = [];

        for (const change of params.changes) {
          if (change.isDeleted) continue;

          const resolvedFile = resolveReadableWorkspacePath(state.workspaceRoot, change.path);
          if (!resolvedFile.valid) {
            return { result: null, error: resolvedFile.error };
          }

          try {
            if (fs.existsSync(resolvedFile.path)) {
              const content = fs.readFileSync(resolvedFile.path, 'utf-8');
              files.push({ path: change.path, content });
              sourceFiles.push({
                path: change.path,
                content,
                isNew: change.isNew
              });
            }
          } catch (err) {
            // Skip files that can't be read
            connection.console.warn(`Could not read file: ${change.path}`);
          }
        }

        // Load base coverage if provided
        let baseCoverage: WorkspaceCoverage | undefined;
        if (params.baseCoveragePath) {
          const resolvedBaseCoverage = resolveReadableWorkspacePath(state.workspaceRoot, params.baseCoveragePath);
          if (!resolvedBaseCoverage.valid) {
            return { result: null, error: resolvedBaseCoverage.error };
          }

          if (fs.existsSync(resolvedBaseCoverage.path)) {
            const result = resolvedBaseCoverage.path.endsWith('.json')
              ? parseIstanbulFile(resolvedBaseCoverage.path, state.workspaceRoot)
              : parseLcovFile(resolvedBaseCoverage.path, state.workspaceRoot);
            if (result.success && result.data) {
              baseCoverage = result.data;
            }
          }
        }

        // Build input
        const input: ChecklistInput = {
          changes: params.changes,
          files,
          sourceFiles,
          headCoverage: state.coverage ?? undefined,
          baseCoverage
        };

        // Run checklist
        const result = runChecklist(input, config);

        return { result };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        connection.console.error(`Checklist error: ${errorMessage}`);
        return { result: null, error: errorMessage };
      }
    }
  );

  // Quick security scan (without full checklist)
  connection.onRequest(
    '$/preCr/quickSecurityScan',
    async (params: { files: Array<{ path: string; content: string }> }): Promise<{
      hasIssues: boolean;
      findings: Array<{
        file: string;
        line: number;
        message: string;
        severity: string;
        pattern: string;
      }>;
    }> => {
      if (!state.workspaceRoot) {
        return { hasIssues: false, findings: [] };
      }
      const { scanSecurity } = await import('@pre-cr/core/experimental');
      const result = scanSecurity(params.files);

      for (const file of params.files) {
        const resolvedFile = resolveReadableWorkspacePath(state.workspaceRoot ?? '', file.path);
        if (!resolvedFile.valid) {
          continue;
        }
        const uri = URI.file(path.resolve(resolvedFile.path)).toString();
        const findings = result.findings.filter((finding) => finding.file === file.path);
        connection.sendDiagnostics({
          uri,
          diagnostics: findings.map((finding) => ({
            severity: finding.severity === 'error'
              ? DiagnosticSeverity.Error
              : finding.severity === 'warning'
                ? DiagnosticSeverity.Warning
                : DiagnosticSeverity.Information,
            range: {
              start: { line: Math.max(0, finding.line - 1), character: 0 },
              end: { line: Math.max(0, finding.line - 1), character: Number.MAX_SAFE_INTEGER }
            },
            message: finding.message,
            source: 'Pre-CR Security',
            code: finding.pattern
          }))
        });
      }

      return {
        hasIssues: result.findings.length > 0,
        findings: result.findings.map(f => ({
          file: f.file,
          line: f.line,
          message: f.message,
          severity: f.severity,
          pattern: f.pattern
        }))
      };
    }
  );

  // Get documentation coverage for current files
  connection.onRequest(
    '$/preCr/getDocCoverage',
    async (params: { files: Array<{ path: string; content: string }> }): Promise<{
      coverage: number;
      undocumented: Array<{ name: string; file: string; line: number; kind: string }>;
    }> => {
      const { analyzeDocCoverage } = await import('@pre-cr/core/experimental');
      const sourceFiles: SourceFile[] = params.files.map(f => ({
        path: f.path,
        content: f.content
      }));

      const result = analyzeDocCoverage(sourceFiles);

      return {
        coverage: result.coveragePercent,
        undocumented: result.undocumented.map(u => ({
          name: u.name,
          file: u.file,
          line: u.line,
          kind: u.kind
        }))
      };
    }
  );

  // ============================================================================
  // Documentation Generator Methods
  // ============================================================================

  // Generate documentation for a file
}
