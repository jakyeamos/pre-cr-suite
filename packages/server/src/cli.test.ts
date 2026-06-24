import { describe, expect, it } from 'vitest';
import type { RunPreCrCheckResult } from '@pre-cr/core';

import { runHeadlessCli } from './cli';

describe('runHeadlessCli', () => {
  it('runs the gate in JSON mode without using the LSP transport', async () => {
    const calls: Array<{ workspaceRoot: string; changeScope: string | undefined }> = [];

    const result = await runHeadlessCli(['run', '--json', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot, options) => {
        calls.push({
          workspaceRoot,
          changeScope: options?.changeScope
        });
        return makeRunResult(workspaceRoot);
      }
    });

    expect(calls).toEqual([{ workspaceRoot: '/repo', changeScope: 'staged' }]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      ...makeRunResult('/repo')
    });
    expect(result.stderr).toBe('');
  });

  it('prints surface counts and unsupported files as a text-mode failure', async () => {
    const result = await runHeadlessCli(['run', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot) => {
        const runResult = makeRunResult(workspaceRoot);
        const coverage = runResult.result?.coverageCheck;
        if (coverage) {
          coverage.passed = false;
          coverage.surfaceSummary = {
            coveredFiles: 4,
            ignoredFiles: 2,
            unsupportedFiles: 2
          };
          coverage.unsupportedFiles = [
            'legacy/app.py',
            'legacy/worker.py'
          ];
        }
        return runResult;
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe([
      'Pre-CR check failed: 100% changed-line coverage (threshold 80%); 2 unsupported surface files need setup guidance.',
      '  Covered Surface Files: 4',
      '  Ignored Surface Files: 2',
      '  Unsupported Surface Files: 2',
      '',
      'Unsupported Files',
      '  - legacy/app.py',
      '  - legacy/worker.py',
      '',
      'Fix Setup: Unsupported files are outside the current coverage surface.',
      '  Add a coverage adapter for these paths or reclassify them in .pre-cr.json under surfaces.covered, surfaces.ignored, or surfaces.unsupported.',
      ''
    ].join('\n'));
    expect(() => JSON.parse(result.stdout)).toThrow();
    expect(result.stderr).toBe('');
  });

  it('prints unsupported surfaces as a blocking text-mode failure', async () => {
    const result = await runHeadlessCli(['run', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot) => {
        const runResult = makeRunResult(workspaceRoot);
        const coverage = runResult.result?.coverageCheck;
        if (coverage) {
          coverage.passed = false;
          coverage.surfaceSummary = {
            coveredFiles: 0,
            ignoredFiles: 0,
            unsupportedFiles: 1
          };
          coverage.unsupportedFiles = ['python/app.py'];
        }
        return runResult;
      }
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Pre-CR check failed: 100% changed-line coverage (threshold 80%); 1 unsupported surface file needs setup guidance.');
    expect(result.stdout).toContain('Unsupported Surface Files: 1');
    expect(result.stdout).toContain('Unsupported Files');
    expect(result.stdout).toContain('  - python/app.py');
    expect(result.stdout).toContain('Fix Setup: Unsupported files are outside the current coverage surface.');
    expect(result.stdout).toContain('Add a coverage adapter for these paths or reclassify them in .pre-cr.json');
  });

  it('emits a quality gate audit event when the headless gate blocks', async () => {
    const events: unknown[] = [];
    const result = await runHeadlessCli(['run', '--json', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot) => {
        const runResult = makeRunResult(workspaceRoot);
        const coverage = runResult.result?.coverageCheck;
        if (coverage) {
          coverage.passed = false;
          coverage.coveragePercent = 72.5;
          coverage.uncoveredDetails = [
            {
              file: 'src/app.ts',
              line: 12,
              reason: 'not-covered'
            }
          ];
        }
        return runResult;
      },
      currentBranch: async () => 'main',
      audit: {
        append: async (workspaceRoot, event) => {
          events.push({ workspaceRoot, event });
        }
      }
    });

    expect(result.exitCode).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workspaceRoot: '/repo',
      event: {
        gate: 'Pre-CR',
        event_type: 'iteration_forced',
        rule_id: 'pre-cr.changed-line-coverage',
        decision: 'force_iteration',
        category: 'test',
        evidence: [
          {
            file: 'src/app.ts',
            line_start: 12
          }
        ]
      }
    });
  });

  it('warns without blocking on an unprotected branch', async () => {
    const events: unknown[] = [];
    const result = await runHeadlessCli(['run', '--json', '--workspace', '/repo'], {
      currentBranch: async () => 'feature/hoopscout',
      runCheck: async (workspaceRoot) => {
        const runResult = makeRunResult(workspaceRoot);
        const coverage = runResult.result?.coverageCheck;
        if (coverage) {
          coverage.passed = false;
          coverage.coveragePercent = 72.5;
          coverage.uncoveredDetails = [
            {
              file: 'src/app.ts',
              line: 12,
              reason: 'not-covered'
            }
          ];
        }
        return runResult;
      },
      audit: {
        append: async (workspaceRoot, event) => {
          events.push({ workspaceRoot, event });
        }
      }
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      gateDecision: 'warn'
    });
    expect(events[0]).toMatchObject({
      workspaceRoot: '/repo',
      event: {
        branch: 'feature/hoopscout',
        decision: 'warn',
        severity: 'warning',
        summary: expect.stringContaining('warning only')
      }
    });
  });
});

function makeRunResult(workspaceRoot: string): RunPreCrCheckResult {
  return {
    result: {
      health: {
        workspaceRoot,
        configPath: null,
        isLegacyConfig: false,
        config: {
          version: 1,
          coveragePaths: [],
          coverageFormat: 'auto',
          threshold: 80,
          excludePatterns: [],
          coverageAdapters: [],
          surfaces: {
            covered: [],
            ignored: [],
            unsupported: []
          },
          checks: {
            coverage: true,
            security: true,
            checklist: true
          }
        },
        framework: {
          name: 'custom',
          command: 'true',
          source: 'config',
          configFile: null
        },
        coverage: {
          loaded: true,
          path: null,
          format: 'lcov',
          summary: null
        },
        issues: [],
        warnings: [],
        ready: true
      },
      changedFiles: [],
      testRun: null,
      coverageCheck: {
        passed: true,
        coveragePercent: 100,
        threshold: 80,
        summary: {
          totalChangedLines: 0,
          coveredLines: 0,
          uncoveredLines: 0,
          skippedLines: 0
        },
        surfaceSummary: {
          coveredFiles: 0,
          ignoredFiles: 0,
          unsupportedFiles: 0
        },
        unsupportedFiles: [],
        uncoveredDetails: [],
        fileBreakdown: []
      },
      coveragePath: null
    }
  };
}
