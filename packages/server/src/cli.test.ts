import { describe, expect, it } from 'vitest';

import { runHeadlessCli } from './cli';

describe('runHeadlessCli', () => {
  it('runs the gate in JSON mode without using the LSP transport', async () => {
    const calls: string[] = [];

    const result = await runHeadlessCli(['run', '--json', '--workspace', '/repo'], {
      runCheck: async (workspaceRoot) => {
        calls.push(workspaceRoot);
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
                  security: false,
                  checklist: false
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
    });

    expect(calls).toEqual(['/repo']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      result: {
        coverageCheck: {
          passed: true
        }
      }
    });
    expect(result.stderr).toBe('');
  });
});
