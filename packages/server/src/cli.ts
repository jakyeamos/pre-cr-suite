#!/usr/bin/env node

import { NullLogger, runWorkspacePreCrCheck, setLogger, type RunPreCrCheckResult } from '@pre-cr/core';

export interface HeadlessCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HeadlessCliDependencies {
  runCheck?: (workspaceRoot: string) => Promise<RunPreCrCheckResult>;
  cwd?: () => string;
}

interface ParsedHeadlessArgs {
  command: 'run';
  json: boolean;
  workspaceRoot: string;
}

export async function runHeadlessCli(
  argv: string[],
  dependencies: HeadlessCliDependencies = {}
): Promise<HeadlessCliResult> {
  setLogger(new NullLogger());

  const parsed = parseHeadlessArgs(argv, dependencies.cwd?.() ?? process.cwd());
  if (!parsed) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: usage()
    };
  }

  const runCheck = dependencies.runCheck ?? runWorkspacePreCrCheck;
  const result = await runCheck(parsed.workspaceRoot);
  const passed = result.result?.coverageCheck?.passed ?? false;
  const ok = Boolean(result.result && !result.error && passed);
  const exitCode = ok ? 0 : 1;

  if (parsed.json) {
    return {
      exitCode,
      stdout: `${JSON.stringify({ ok, ...result }, null, 2)}\n`,
      stderr: ''
    };
  }

  return {
    exitCode,
    stdout: formatTextResult(result),
    stderr: result.error ? `${result.error}\n` : ''
  };
}

function parseHeadlessArgs(argv: string[], cwd: string): ParsedHeadlessArgs | null {
  if (argv.length === 0 || argv[0] !== 'run') {
    return null;
  }

  let json = false;
  let workspaceRoot = cwd;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--workspace') {
      const value = argv[index + 1];
      if (!value) {
        return null;
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }

    return null;
  }

  return {
    command: 'run',
    json,
    workspaceRoot
  };
}

function formatTextResult(result: RunPreCrCheckResult): string {
  if (!result.result) {
    return '';
  }

  const coverage = result.result.coverageCheck;
  if (!coverage) {
    return 'Pre-CR check did not produce a coverage result.\n';
  }

  const status = coverage.passed ? 'passed' : 'failed';
  return `Pre-CR check ${status}: ${coverage.coveragePercent}% changed-line coverage (threshold ${coverage.threshold}%).\n`;
}

function usage(): string {
  return [
    'Usage: pre-cr run [--json] [--workspace <path>]',
    ''
  ].join('\n');
}

if (require.main === module) {
  void runHeadlessCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.exitCode;
  });
}
