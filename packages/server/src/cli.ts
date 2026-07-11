#!/usr/bin/env node

import {
  NullLogger,
  formatUnsupportedSurfaceSetupGuidance,
  runWorkspacePreCrCheck,
  setLogger,
  buildReadinessEnvelope,
  type ReadinessGateDecision,
  type RunPreCrCheckResult,
  type ReadinessScope,
  type RunWorkspacePreCrCheckOptions
} from '@pre-cr/core';
import { runHookCli } from './hooks/cli';
import {
  buildPreCrAuditEvent,
  defaultCurrentBranch,
  defaultQualityGateAuditAppender,
  qualityGateDecision,
  safeAppendAuditEvent,
  type QualityGateAuditAppender
} from './qualityGateAudit';

export interface HeadlessCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HeadlessCliDependencies {
  runCheck?: (workspaceRoot: string, options?: RunWorkspacePreCrCheckOptions) => Promise<RunPreCrCheckResult>;
  cwd?: () => string;
  audit?: QualityGateAuditAppender;
  currentBranch?: (workspaceRoot: string) => Promise<string | null>;
}

interface HeadlessCliProgressOptions {
  heartbeatMs?: number;
  stderr?: {
    write: (chunk: string) => unknown;
  };
}

interface ParsedHeadlessArgs {
  command: 'run';
  json: boolean;
  workspaceRoot: string;
  scope: ReadinessScope;
}

type CoverageTextResult = NonNullable<NonNullable<RunPreCrCheckResult['result']>['coverageCheck']>;

const DEFAULT_PROGRESS_HEARTBEAT_MS = 15_000;

export async function runHeadlessCli(
  argv: string[],
  dependencies: HeadlessCliDependencies = {}
): Promise<HeadlessCliResult> {
  setLogger(new NullLogger());

  if (argv[0] === 'hook') {
    return runHookCli(argv.slice(1), {
      cwd: dependencies.cwd?.() ?? process.cwd(),
      usageText: usage(),
      runCheck: dependencies.runCheck
    });
  }

  const parsed = parseHeadlessArgs(argv, dependencies.cwd?.() ?? process.cwd());
  if (!parsed) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: usage()
    };
  }

  const runCheck = dependencies.runCheck ?? runWorkspacePreCrCheck;
  const result = await runCheck(parsed.workspaceRoot, {
    changeScope: parsed.scope,
    allowConfigExecution: true
  });
  const coveragePassed = result.result?.coverageCheck?.passed ?? false;
  const qualityAdaptersPassed = result.result?.qualityAdaptersPassed ?? true;
  const ok = Boolean(result.result && !result.error && coveragePassed && qualityAdaptersPassed);
  const branch = await (dependencies.currentBranch ?? defaultCurrentBranch)(parsed.workspaceRoot);
  const gateDecision: ReadinessGateDecision = ok ? 'pass' : qualityGateDecision(branch);
  const exitCode = ok || gateDecision === 'warn' ? 0 : 1;
  if (!ok) {
    await safeAppendAuditEvent(
      parsed.workspaceRoot,
      buildPreCrAuditEvent(parsed.workspaceRoot, result, {
        branch,
        decision: gateDecision === 'warn' ? 'warn' : 'block'
      }),
      dependencies.audit ?? defaultQualityGateAuditAppender
    );
  }

  if (parsed.json) {
    const payload = buildReadinessEnvelope(result, {
      scope: parsed.scope,
      ok,
      gateDecision
    });
    return {
      exitCode,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
      stderr: ''
    };
  }

  return {
    exitCode,
    stdout: formatTextResult(result, buildReadinessEnvelope(result, {
      scope: parsed.scope,
      ok,
      gateDecision
    })),
    stderr: result.error ? `${result.error}\n` : ''
  };
}

export async function runHeadlessCliWithProgress(
  argv: string[],
  dependencies: HeadlessCliDependencies = {},
  options: HeadlessCliProgressOptions = {}
): Promise<HeadlessCliResult> {
  const parsed = parseHeadlessArgs(argv, dependencies.cwd?.() ?? process.cwd());
  if (!parsed) {
    return runHeadlessCli(argv, dependencies);
  }

  const stderr = options.stderr ?? process.stderr;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_PROGRESS_HEARTBEAT_MS;
  const startedAt = Date.now();
  let exitCode: number | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  writeProgress(stderr, `[pre-cr] Running changed-line readiness for ${parsed.workspaceRoot}`);
  if (heartbeatMs > 0) {
    heartbeat = setInterval(() => {
      writeProgress(
        stderr,
        `[pre-cr] Still running after ${elapsedSeconds(startedAt)}s for ${parsed.workspaceRoot}`
      );
    }, heartbeatMs);
  }

  try {
    const result = await runHeadlessCli(argv, dependencies);
    exitCode = result.exitCode;
    return result;
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    const status = exitCode === null ? 'without a result' : `with exit code ${exitCode}`;
    writeProgress(
      stderr,
      `[pre-cr] Finished changed-line readiness for ${parsed.workspaceRoot} in ${elapsedSeconds(startedAt)}s ${status}`
    );
  }
}

function parseHeadlessArgs(argv: string[], cwd: string): ParsedHeadlessArgs | null {
  if (argv.length === 0 || argv[0] !== 'run') {
    return null;
  }

  let json = false;
  let workspaceRoot = cwd;
  let scope: ReadinessScope = 'staged';

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

    if (arg === '--scope') {
      const value = argv[index + 1];
      if (value !== 'staged' && value !== 'worktree') {
        return null;
      }
      scope = value;
      index += 1;
      continue;
    }

    return null;
  }

  return {
    command: 'run',
    json,
    workspaceRoot,
    scope
  };
}

function formatQualityAdapterSummary(result: RunPreCrCheckResult): string[] {
  const adapters = result.result?.qualityAdapters ?? [];
  if (adapters.length === 0) {
    return [];
  }

  return adapters.map((adapter) => {
    const status = adapter.skipped ? 'skipped' : adapter.success ? 'passed' : 'failed';
    return `Quality adapter ${adapter.name} ${status}.`;
  });
}

function formatTextResult(
  result: RunPreCrCheckResult,
  envelope: ReturnType<typeof buildReadinessEnvelope>
): string {
  if (!result.result) {
    return '';
  }

  const coverage = result.result.coverageCheck;
  if (!coverage) {
    return 'Pre-CR check did not produce a coverage result.\n';
  }

  const status = envelope.state === 'ready'
    ? 'passed'
    : envelope.state === 'warning'
      ? 'warning'
      : envelope.state === 'setup-needed'
        ? 'setup needed'
        : 'blocked';
  const reason = coverage.unsupportedFiles.length > 0
    ? `; ${coverage.unsupportedFiles.length} unsupported surface file${coverage.unsupportedFiles.length === 1 ? '' : 's'} need${coverage.unsupportedFiles.length === 1 ? 's' : ''} setup guidance`
    : '';
  const lines = [
    `Pre-CR check ${status}: ${coverage.coveragePercent}% changed-line coverage (threshold ${coverage.threshold}%)${reason}.`,
    ...formatCoverageSurfaceLines(coverage),
    ...formatQualityAdapterSummary(result),
    ''
  ];

  return lines.join('\n');
}

function formatCoverageSurfaceLines(coverage: CoverageTextResult): string[] {
  const lines = [
    `  Covered Surface Files: ${coverage.surfaceSummary.coveredFiles}`,
    `  Ignored Surface Files: ${coverage.surfaceSummary.ignoredFiles}`,
    `  Unsupported Surface Files: ${coverage.surfaceSummary.unsupportedFiles}`
  ];

  if (coverage.unsupportedFiles.length === 0) {
    return lines;
  }

  lines.push('', 'Unsupported Files');
  for (const file of coverage.unsupportedFiles.slice(0, 10)) {
    lines.push(`  - ${file}`);
  }

  const remaining = coverage.unsupportedFiles.length - 10;
  if (remaining > 0) {
    lines.push(`  ... and ${remaining} more`);
  }

  lines.push('', ...formatUnsupportedSurfaceSetupGuidance(coverage));

  return lines;
}

function writeProgress(stderr: { write: (chunk: string) => unknown }, message: string): void {
  stderr.write(`${message}\n`);
}

function elapsedSeconds(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function usage(): string {
  return [
    'Usage: pre-cr run [--json] [--scope staged|worktree] [--workspace <path>]',
    '       pre-cr hook install [--manager auto|native|husky|lefthook|pre-commit|all] [--hook pre-commit|pre-push] [--force]',
    '       pre-cr hook status [--json]',
    '       pre-cr hook uninstall [--manager auto|native|husky|lefthook|pre-commit|all]',
    '       pre-cr hook run --workspace <path> [--hook pre-commit|pre-push] [--json]',
    ''
  ].join('\n');
}

if (require.main === module) {
  void runHeadlessCliWithProgress(process.argv.slice(2)).then((result) => {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.exitCode;
  });
}
