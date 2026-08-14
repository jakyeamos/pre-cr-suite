import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it } from 'vitest';
import type { RunPreCrCheckResult } from '@pre-cr/core';

import { runHeadlessCli, runHeadlessCliWithProgress } from './cli';

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

  it('passes a successful test run when changed-line coverage is disabled', async () => {
    const result = await runHeadlessCli(['run', '--json', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot) => {
        const runResult = makeRunResult(workspaceRoot);
        if (runResult.result) {
          runResult.result.health.config.checks.coverage = false;
          runResult.result.coverageCheck = null;
        }
        return runResult;
      }
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
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

  it('blocks when changed-line coverage passes but a quality adapter fails', async () => {
    const events: unknown[] = [];
    const result = await runHeadlessCli(['run', '--json', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot) => {
        const runResult = makeRunResult(workspaceRoot);
        if (runResult.result) {
          runResult.result.qualityAdaptersPassed = false;
          runResult.result.qualityAdapters = [
            {
              name: 'anti-slop',
              command: 'anti-slop gate --files src/app.ts --mode block --format pre-cr',
              required: true,
              success: false,
              skipped: false,
              exitCode: 1,
              duration: 42,
              stdout: '',
              stderr: '',
              error: 'Quality adapter "anti-slop" exited with code 1.'
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
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      gateDecision: 'block'
    });
    expect(events[0]).toMatchObject({
      workspaceRoot: '/repo',
      event: {
        gate: 'Pre-CR',
        rule_id: 'pre-cr.quality-adapter',
        rule_name: 'Quality adapter',
        decision: 'force_iteration',
        summary: expect.stringContaining('anti-slop')
      }
    });
  });

  it('emits progress to stderr while preserving JSON stdout for executable runs', async () => {
    const stderr: string[] = [];

    const result = await runHeadlessCliWithProgress(
      ['run', '--json', '--workspace', '/repo'],
      {
        runCheck: async (workspaceRoot) => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return makeRunResult(workspaceRoot);
        },
        currentBranch: async () => 'main'
      },
      {
        heartbeatMs: 5,
        stderr: {
          write: (chunk: string) => {
            stderr.push(chunk);
            return true;
          }
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      ...makeRunResult('/repo')
    });
    expect(result.stdout).not.toContain('Pre-CR');
    expect(stderr.join('')).toContain('[pre-cr] Running changed-line readiness for /repo');
    expect(stderr.join('')).toContain('[pre-cr] Still running after');
    expect(stderr.join('')).toContain('[pre-cr] Finished changed-line readiness for /repo');
  });

  it('emits immediate and periodic progress for hook runs while preserving JSON stdout', async () => {
    const workspaceRoot = makeHookRepo();
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), '{"version":1}\n');
    fs.writeFileSync(path.join(workspaceRoot, 'src.ts'), 'export const value = 1;\n');
    execFileSync('git', ['add', '-f', '.pre-cr.json', 'src.ts'], { cwd: workspaceRoot });
    const stderr: string[] = [];

    const result = await runHeadlessCliWithProgress(
      ['hook', 'run', '--json', '--workspace', workspaceRoot, '--hook', 'pre-commit'],
      {
        runCheck: async (root) => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return makeRunResult(root);
        }
      },
      {
        heartbeatMs: 5,
        stderr: {
          write: (chunk: string) => {
            stderr.push(chunk);
            return true;
          }
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, findings: [] });
    expect(stderr.join('')).toContain(`[pre-cr] Running pre-commit hook for ${workspaceRoot}`);
    expect(stderr.join('')).toContain('[pre-cr] Still running pre-commit hook after');
    expect(stderr.join('')).toContain(`[pre-cr] Finished pre-commit hook for ${workspaceRoot}`);
  });

  it('runs hook checks, blocks missing config, and emits JSON findings', async () => {
    const workspaceRoot = makeHookRepo();
    fs.writeFileSync(path.join(workspaceRoot, 'src.ts'), 'export const value = 1;\n');
    execFileSync('git', ['add', 'src.ts'], { cwd: workspaceRoot });

    const result = await runHeadlessCli(['hook', 'run', '--json', '--workspace', workspaceRoot]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      findings: [
        {
          path: '.pre-cr.json',
          rule: 'pre-cr-required',
          severity: 'block'
        }
      ]
    });
  });

  it('skips Pre-CR run when hook has no staged source files', async () => {
    const workspaceRoot = makeHookRepo();
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), '{"version":1}\n');
    fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'docs only\n');
    execFileSync('git', ['add', '-f', '.pre-cr.json', 'README.md'], { cwd: workspaceRoot });
    let called = false;

    const result = await runHeadlessCli(['hook', 'run', '--json', '--workspace', workspaceRoot], {
      runCheck: async () => {
        called = true;
        return makeRunResult(workspaceRoot);
      }
    });

    expect(called).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      skipped: true
    });
  });

  it('uses hook policy so warning-only findings do not block', async () => {
    const workspaceRoot = makeHookRepo();
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      hook: {
        rules: {
          'typescript-any': 'warn'
        }
      }
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'src.ts'), 'const value: any = 1;\n');
    execFileSync('git', ['add', '-f', '.pre-cr.json', 'src.ts'], { cwd: workspaceRoot });

    const result = await runHeadlessCli(['hook', 'run', '--json', '--workspace', workspaceRoot], {
      runCheck: async () => makeRunResult(workspaceRoot)
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      findings: [
        {
          rule: 'typescript-any',
          severity: 'warn'
        }
      ]
    });
  });

  it('lets the hook pass when tests succeed and changed-line coverage is disabled', async () => {
    const workspaceRoot = makeHookRepo();
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      checks: { coverage: false }
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'src.ts'), 'export const value = 1;\n');
    execFileSync('git', ['add', '-f', '.pre-cr.json', 'src.ts'], { cwd: workspaceRoot });

    const result = await runHeadlessCli(['hook', 'run', '--json', '--workspace', workspaceRoot], {
      runCheck: async () => {
        const runResult = makeRunResult(workspaceRoot);
        if (runResult.result) {
          runResult.result.health.config.checks.coverage = false;
          runResult.result.coverageCheck = null;
        }
        return runResult;
      }
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
  });

  it('follows hook policy for failed Pre-CR readiness', async () => {
    const workspaceRoot = makeHookRepo();
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      hook: {
        rules: {
          'pre-cr-failed': 'warn'
        }
      }
    }));
    fs.writeFileSync(path.join(workspaceRoot, 'src.ts'), 'export const value = 1;\n');
    execFileSync('git', ['add', '-f', '.pre-cr.json', 'src.ts'], { cwd: workspaceRoot });

    const result = await runHeadlessCli(['hook', 'run', '--json', '--workspace', workspaceRoot], {
      runCheck: async () => {
        const runResult = makeRunResult(workspaceRoot);
        if (runResult.result) {
          runResult.result.coverageCheck.passed = false;
        }
        return runResult;
      }
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      findings: [
        {
          rule: 'pre-cr-failed',
          severity: 'warn'
        }
      ]
    });
  });
});

function makeHookRepo(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-hook-cli-'));
  execFileSync('git', ['init'], { cwd: workspaceRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'core.excludesfile', '/dev/null'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'core.hooksPath', '/dev/null'], { cwd: workspaceRoot });
  return workspaceRoot;
}

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
          qualityAdapters: [],
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
      qualityAdapters: [],
      qualityAdaptersPassed: true,
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
