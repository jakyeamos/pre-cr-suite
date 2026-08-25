import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';

import {
  evaluateContributionProof,
  type ContributionProofBinding,
  type ContributionProofEnvelope
} from '@pre-cr/core/experimental';

import type { HeadlessCliResult } from './cli';

const execFileAsync = promisify(execFile);

export interface ContributionProofCliDependencies {
  cwd?: string;
  readManifest?: (manifestPath: string) => Promise<string>;
  readStdin?: () => Promise<string>;
  inspectBinding?: (workspaceRoot: string, baseCommit: string) => Promise<ContributionProofBinding>;
}

interface ParsedContributionProofArgs {
  json: boolean;
  manifestPath: string;
  workspaceRoot: string;
}

export async function runContributionProofCli(
  argv: string[],
  dependencies: ContributionProofCliDependencies = {}
): Promise<HeadlessCliResult> {
  const parsed = parseContributionProofArgs(argv, dependencies.cwd ?? process.cwd());
  if (!parsed) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: contributionProofUsage()
    };
  }

  let candidate: unknown;
  try {
    const source = parsed.manifestPath === '-'
      ? await (dependencies.readStdin ?? defaultReadStdin)()
      : await (dependencies.readManifest ?? defaultReadManifest)(
        path.resolve(parsed.workspaceRoot, parsed.manifestPath)
      );
    candidate = JSON.parse(source) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const envelope = invalidEnvelope(`Could not read Contribution Proof manifest: ${message}`);
    return formatResult(envelope, parsed.json);
  }

  const baseCommit = readBaseCommit(candidate);
  const binding = baseCommit
    ? await safelyInspectBinding(
      dependencies.inspectBinding ?? defaultInspectBinding,
      parsed.workspaceRoot,
      baseCommit
    )
    : emptyBinding('The manifest does not contain a valid baseCommit.');
  const envelope = evaluateContributionProof(candidate, binding);
  return formatResult(envelope, parsed.json);
}

export async function defaultInspectBinding(
  workspaceRoot: string,
  baseCommit: string
): Promise<ContributionProofBinding> {
  const resolvedBase = await git(workspaceRoot, ['rev-parse', `${baseCommit}^{commit}`]);
  const headCommit = await git(workspaceRoot, ['rev-parse', 'HEAD']);
  const status = await git(workspaceRoot, ['status', '--porcelain=v1', '--untracked-files=normal']);
  const baseIsAncestor = await gitExitCode(workspaceRoot, ['merge-base', '--is-ancestor', resolvedBase, headCommit]) === 0;
  const changedFilesText = await git(workspaceRoot, ['diff', '--name-only', `${resolvedBase}..${headCommit}`]);

  return {
    baseCommit: resolvedBase,
    headCommit,
    baseIsAncestor,
    clean: status.length === 0,
    changedFiles: changedFilesText.length === 0 ? [] : changedFilesText.split('\n').filter(Boolean)
  };
}

function parseContributionProofArgs(
  argv: string[],
  cwd: string
): ParsedContributionProofArgs | null {
  let json = false;
  let manifestPath: string | null = null;
  let workspaceRoot = cwd;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--manifest') {
      const value = argv[index + 1];
      if (!value) {
        return null;
      }
      manifestPath = value;
      index += 1;
      continue;
    }
    if (arg === '--workspace') {
      const value = argv[index + 1];
      if (!value) {
        return null;
      }
      workspaceRoot = path.resolve(cwd, value);
      index += 1;
      continue;
    }
    return null;
  }

  if (!manifestPath) {
    return null;
  }

  return { json, manifestPath, workspaceRoot };
}

async function safelyInspectBinding(
  inspect: (workspaceRoot: string, baseCommit: string) => Promise<ContributionProofBinding>,
  workspaceRoot: string,
  baseCommit: string
): Promise<ContributionProofBinding> {
  try {
    return await inspect(workspaceRoot, baseCommit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return emptyBinding(`Could not bind proof to Git: ${message}`, baseCommit);
  }
}

function readBaseCommit(candidate: unknown): string | null {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return null;
  }
  const value = (candidate as Record<string, unknown>).baseCommit;
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) ? value : null;
}

function invalidEnvelope(message: string): ContributionProofEnvelope {
  const envelope = evaluateContributionProof(null, emptyBinding());
  envelope.gaps = [{ code: 'manifest-read-error', severity: 'block', message }];
  return envelope;
}

function emptyBinding(error?: string, baseCommit = ''): ContributionProofBinding {
  return {
    baseCommit,
    headCommit: '',
    baseIsAncestor: false,
    clean: false,
    changedFiles: [],
    ...(error ? { error } : {})
  };
}

function formatResult(envelope: ContributionProofEnvelope, json: boolean): HeadlessCliResult {
  const exitCode = envelope.gateDecision === 'block' ? 1 : 0;
  if (json) {
    return {
      exitCode,
      stdout: `${JSON.stringify(envelope, null, 2)}\n`,
      stderr: ''
    };
  }

  const diff = envelope.binding.baseCommit && envelope.binding.headCommit
    ? `${envelope.binding.baseCommit}..${envelope.binding.headCommit}`
    : 'unbound';
  const lines = [
    `Contribution Proof ${envelope.state}${envelope.risk ? ` (${envelope.risk} risk)` : ''}.`,
    `  Diff: ${diff}`,
    `  Changed files: ${envelope.binding.changedFiles.length}`,
    `  Claims: ${envelope.claims.length}`
  ];
  if (envelope.gaps.length > 0) {
    lines.push('', 'Evidence gaps');
    for (const gap of envelope.gaps) {
      lines.push(`  - [${gap.severity}] ${gap.message}`);
    }
  }
  lines.push('');

  return { exitCode, stdout: lines.join('\n'), stderr: '' };
}

async function defaultReadManifest(manifestPath: string): Promise<string> {
  return readFile(manifestPath, 'utf8');
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function git(workspaceRoot: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout.trim();
}

async function gitExitCode(workspaceRoot: string, args: string[]): Promise<number> {
  try {
    await execFileAsync('git', args, { cwd: workspaceRoot, encoding: 'utf8' });
    return 0;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number') {
      return error.code;
    }
    throw error;
  }
}

function contributionProofUsage(): string {
  return 'Usage: pre-cr proof --manifest <path|-> [--json] [--workspace <path>]\n';
}
