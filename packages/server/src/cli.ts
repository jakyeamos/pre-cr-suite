#!/usr/bin/env node

import { createHash, randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { mkdir, appendFile, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import {
  NullLogger,
  formatUnsupportedSurfaceSetupGuidance,
  runWorkspacePreCrCheck,
  setLogger,
  type RunPreCrCheckResult
} from '@pre-cr/core';

export interface HeadlessCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HeadlessCliDependencies {
  runCheck?: (workspaceRoot: string, options?: { changeScope?: 'worktree' | 'staged' }) => Promise<RunPreCrCheckResult>;
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
}

type CoverageTextResult = NonNullable<NonNullable<RunPreCrCheckResult['result']>['coverageCheck']>;

interface QualityGateAuditAppender {
  append: (workspaceRoot: string, event: QualityGateAuditEvent) => Promise<void>;
}

interface QualityGateAuditEvidence {
  file: string;
  line_start?: number;
  line_end?: number;
  reason: string;
}

interface QualityGateAuditEvent {
  schema_version: '1.0';
  event_id: string;
  timestamp: string;
  repo: string;
  branch: string | null;
  commit_sha: string | null;
  run_id: string | null;
  actor_type: 'agent' | 'human' | 'ci' | 'unknown';
  gate: 'Pre-CR';
  gate_version: string | null;
  event_type: 'iteration_forced' | 'commit_blocked';
  severity: 'warning' | 'error' | 'critical';
  category: 'test' | 'process';
  rule_id: string;
  rule_name: string;
  decision: 'warn' | 'force_iteration' | 'block';
  summary: string;
  evidence: QualityGateAuditEvidence[];
  failure_pattern: string;
  root_cause_hypothesis: string;
  required_fix: string;
  actual_fix: string | null;
  learning_lesson: string;
  dedupe_fingerprint: string;
  related_event_ids: string[];
  blocked_duration_seconds: number | null;
  tokens_wasted_estimate: number | null;
  notes: string | null;
}

const SECRET_RE =
  /\b(api[_-]?key|secret|token|password|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/gi;
const execFileAsync = promisify(execFile);
const PROTECTED_BRANCHES = new Set(['main', 'master', 'dev', 'develop', 'development']);
const BRANCH_ENV_KEYS = ['AIOS_BRANCH', 'GITHUB_REF_NAME', 'GITHUB_HEAD_REF', 'BRANCH_NAME', 'VERCEL_GIT_COMMIT_REF'];
const DEV_ENV_KEYS = ['AIOS_DEV_ENVIRONMENT', 'AIOS_DEV_ENV', 'QUALITY_GATE_DEV_ENV', 'GATE_CONNECTED_DEV_ENV'];
const DEFAULT_PROGRESS_HEARTBEAT_MS = 15_000;
type GateDecision = 'block' | 'warn';

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
  const result = await runCheck(parsed.workspaceRoot, { changeScope: 'staged' });
  const passed = result.result?.coverageCheck?.passed ?? false;
  const ok = Boolean(result.result && !result.error && passed);
  const branch = await (dependencies.currentBranch ?? defaultCurrentBranch)(parsed.workspaceRoot);
  const gateDecision = ok ? 'block' : qualityGateDecision(branch);
  const exitCode = ok || gateDecision === 'warn' ? 0 : 1;
  if (!ok) {
    await safeAppendAuditEvent(
      parsed.workspaceRoot,
      buildPreCrAuditEvent(parsed.workspaceRoot, result, { branch, decision: gateDecision }),
      dependencies.audit ?? defaultQualityGateAuditAppender
    );
  }

  if (parsed.json) {
    const payload = ok ? { ok, ...result } : { ok, gateDecision, ...result };
    return {
      exitCode,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
      stderr: ''
    };
  }

  return {
    exitCode,
    stdout: formatTextResult(result),
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

function buildPreCrAuditEvent(
  workspaceRoot: string,
  result: RunPreCrCheckResult,
  policy: { branch: string | null; decision: GateDecision }
): QualityGateAuditEvent {
  const coverage = result.result?.coverageCheck;
  const evidence = coverage
    ? [
        ...coverage.uncoveredDetails.slice(0, 10).map((detail) => ({
          file: detail.file,
          line_start: detail.line,
          line_end: detail.line,
          reason: detail.reason === 'no-coverage-data'
            ? 'Changed line has no coverage data.'
            : 'Changed line is not covered.'
        })),
        ...coverage.unsupportedFiles.slice(0, 10).map((file) => ({
          file,
          reason: 'File is outside the configured Pre-CR coverage surface.'
        }))
      ]
    : [];
  const ruleId = coverage ? 'pre-cr.changed-line-coverage' : 'pre-cr.execution';
  const failurePattern = coverage?.unsupportedFiles.length
    ? 'changed files were outside the configured coverage surface'
    : coverage
      ? 'changed lines lacked coverage'
      : 'pre-cr did not produce a passing coverage result';
  const disposition = policy.decision === 'block' ? (coverage ? 'forced iteration' : 'blocked the run') : 'warning only';
  const summary = coverage
    ? `Pre-CR ${disposition}: ${coverage.coveragePercent}% changed-line coverage below ${coverage.threshold}% or unsupported surfaces were present.`
    : `Pre-CR ${disposition}: ${result.error ?? 'coverage result was unavailable'}.`;
  const files = evidence.map((item) => item.file);

  return {
    schema_version: '1.0',
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    repo: path.basename(workspaceRoot),
    branch: policy.branch,
    commit_sha: null,
    run_id: process.env.AIOS_RUN_ID ?? process.env.GITHUB_RUN_ID ?? null,
    actor_type: process.env.CI ? 'ci' : 'unknown',
    gate: 'Pre-CR',
    gate_version: null,
    event_type: coverage ? 'iteration_forced' : 'commit_blocked',
    severity: policy.decision === 'block' ? 'error' : 'warning',
    category: coverage ? 'test' : 'process',
    rule_id: ruleId,
    rule_name: coverage ? 'Changed-line coverage' : 'Pre-CR execution',
    decision: policy.decision === 'block' ? (coverage ? 'force_iteration' : 'block') : 'warn',
    summary: redactSecrets(summary),
    evidence,
    failure_pattern: failurePattern,
    root_cause_hypothesis: coverage
      ? 'Implementation changed covered behavior before focused tests covered the changed lines.'
      : 'Pre-CR could not complete its configured readiness workflow.',
    required_fix: coverage
      ? 'Add or update focused tests and coverage configuration for the changed lines.'
      : 'Fix the Pre-CR setup or execution error, then rerun the gate.',
    actual_fix: null,
    learning_lesson: coverage
      ? 'Run focused tests with coverage before Pre-CR; changed lines must be covered or intentionally classified.'
      : 'Verify Pre-CR setup before relying on the readiness result.',
    dedupe_fingerprint: dedupeFingerprint('Pre-CR', ruleId, files, failurePattern),
    related_event_ids: [],
    blocked_duration_seconds: null,
    tokens_wasted_estimate: null,
    notes: null
  };
}

async function safeAppendAuditEvent(
  workspaceRoot: string,
  event: QualityGateAuditEvent,
  appender: QualityGateAuditAppender
): Promise<void> {
  try {
    await appender.append(workspaceRoot, event);
  } catch {
    return;
  }
}

async function defaultCurrentBranch(workspaceRoot: string): Promise<string | null> {
  const envBranch = firstEnv(BRANCH_ENV_KEYS);
  if (envBranch) {
    return normalizeBranch(envBranch);
  }
  try {
    const result = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspaceRoot
    });
    const branch = result.stdout.trim();
    return branch ? normalizeBranch(branch) : null;
  } catch {
    return null;
  }
}

function qualityGateDecision(branch: string | null): GateDecision {
  const mode = firstEnv(['AIOS_QUALITY_GATE_MODE', 'QUALITY_GATE_MODE'])?.toLowerCase();
  if (mode === 'warn' || mode === 'warning' || mode === 'soft') {
    return 'warn';
  }
  if (mode === 'block' || mode === 'blocking' || mode === 'hard') {
    return 'block';
  }
  if (branch && PROTECTED_BRANCHES.has(normalizeBranch(branch))) {
    return 'block';
  }
  if (DEV_ENV_KEYS.some((key) => truthy(process.env[key]))) {
    return 'block';
  }
  if (['production', 'development'].includes(process.env.VERCEL_ENV?.trim().toLowerCase() ?? '')) {
    return 'block';
  }
  return branch ? 'warn' : 'block';
}

function firstEnv(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizeBranch(branch: string): string {
  return branch.replace(/^refs\/heads\//, '').replace(/^origin\//, '');
}

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on', 'block'].includes(value?.trim().toLowerCase() ?? '');
}

const defaultQualityGateAuditAppender: QualityGateAuditAppender = {
  async append(workspaceRoot, event) {
    const auditDir = path.join(workspaceRoot, '.aios', 'audit');
    await mkdir(auditDir, { recursive: true });
    const eventsPath = path.join(auditDir, 'gate-events.jsonl');
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
    const events = await readAuditEvents(eventsPath);
    await writeFile(path.join(auditDir, 'gate-summary.md'), renderSummary(events), 'utf8');
    await writeFile(path.join(auditDir, 'learning-lessons.md'), renderLessons(events), 'utf8');
  }
};

async function readAuditEvents(eventsPath: string): Promise<QualityGateAuditEvent[]> {
  try {
    const text = await readFile(eventsPath, 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as QualityGateAuditEvent)
      .filter((event) => event.schema_version === '1.0');
  } catch {
    return [];
  }
}

function renderSummary(events: QualityGateAuditEvent[]): string {
  const latest = events.at(-1);
  const outcome = latest?.decision === 'warn'
    ? 'warnings only'
    : latest?.decision === 'force_iteration'
      ? 'forced iteration'
      : 'blocked';
  const decisions = events.slice(-10).map((event) => `- ${event.gate} ${event.decision} [${event.severity}]: ${event.summary}`);
  const lessons = [...new Set(events.map((event) => event.learning_lesson))].map((lesson) => `- ${lesson}`);
  return [
    '# Gate Audit Summary',
    '',
    '## Current run outcome',
    '',
    `- Outcome: ${outcome}`,
    '',
    '## Gate decisions',
    '',
    ...decisions,
    '',
    '## Repeated failure patterns',
    '',
    ...repeatedPatternLines(events),
    '',
    '## Agent learning lessons',
    '',
    ...lessons,
    '',
    '## Commit-readiness status',
    '',
    latest?.decision === 'warn' ? '- ready with warnings' : '- not ready to commit',
    ''
  ].join('\n');
}

function renderLessons(events: QualityGateAuditEvent[]): string {
  return [
    '# Gate Learning Lessons',
    '',
    '## Active repeated failure patterns',
    '',
    ...repeatedPatternLines(events),
    '',
    '## Current repo-specific rules learned from gate history',
    '',
    ...[...new Set(events.map((event) => event.learning_lesson))].map((lesson) => `- ${lesson}`),
    '',
    '## High-priority agent reminders',
    '',
    ...[...new Set(events.filter((event) => event.severity === 'error').map((event) => event.learning_lesson))].map((lesson) => `- ${lesson}`),
    ''
  ].join('\n');
}

function repeatedPatternLines(events: QualityGateAuditEvent[]): string[] {
  const grouped = new Map<string, QualityGateAuditEvent[]>();
  for (const event of events) {
    grouped.set(event.dedupe_fingerprint, [...(grouped.get(event.dedupe_fingerprint) ?? []), event]);
  }

  const lines: string[] = [];
  for (const rows of grouped.values()) {
    if (rows.length < 2) {
      continue;
    }
    const [first] = rows;
    lines.push(`### Pattern: ${first.failure_pattern}`);
    lines.push(`- Seen: ${rows.length} times`);
    lines.push(`- Gates: ${[...new Set(rows.map((event) => event.gate))].join(', ')}`);
    lines.push(`- Category: ${first.category}`);
    lines.push(`- Common cause: ${first.root_cause_hypothesis}`);
    lines.push(`- Avoid by: ${first.learning_lesson}`);
    lines.push(`- Example fix: ${first.required_fix}`);
  }

  return lines.length > 0 ? lines : ['No repeated failure patterns have been recorded yet.'];
}

function dedupeFingerprint(gate: string, ruleId: string, files: string[], failurePattern: string): string {
  const payload = [
    gate.trim().toLowerCase(),
    ruleId.trim().toLowerCase(),
    ...files.map((file) => file.trim().toLowerCase()).sort(),
    failurePattern.trim().toLowerCase()
  ].join('\n');
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

function redactSecrets(text: string): string {
  return text.replace(SECRET_RE, (_match, key: string) => `${key} = "[REDACTED]"`);
}

function writeProgress(stderr: { write: (chunk: string) => unknown }, message: string): void {
  stderr.write(`${message}\n`);
}

function elapsedSeconds(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
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
  const reason = coverage.unsupportedFiles.length > 0
    ? `; ${coverage.unsupportedFiles.length} unsupported surface file${coverage.unsupportedFiles.length === 1 ? '' : 's'} need${coverage.unsupportedFiles.length === 1 ? 's' : ''} setup guidance`
    : '';
  const lines = [
    `Pre-CR check ${status}: ${coverage.coveragePercent}% changed-line coverage (threshold ${coverage.threshold}%)${reason}.`,
    ...formatCoverageSurfaceLines(coverage),
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

function usage(): string {
  return [
    'Usage: pre-cr run [--json] [--workspace <path>]',
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
