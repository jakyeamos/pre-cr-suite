import * as fs from 'fs';

import type { ChangedFile } from '../runner/coverageChecker';
import { runProcess } from '../runner/processRunner';
import { resolveWorkspacePath } from '../validation';

const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  outputTruncated: boolean;
  error?: string;
}

interface GitStatusEntry {
  path: string;
  previousPath?: string;
  isNew: boolean;
  isDeleted: boolean;
  source: 'diff' | 'untracked';
}

interface ChangedLines {
  additions: number[];
  lineContents: Record<number, string>;
  binary: boolean;
}

export type GitChangeScope = 'worktree' | 'staged';

export interface CollectGitChangedFilesOptions {
  scope?: GitChangeScope;
}

async function runGitCommand(workspaceRoot: string, args: readonly string[]): Promise<CommandResult> {
  const result = await runProcess({
    command: 'git',
    args,
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat'
    },
    maxStdoutBytes: MAX_GIT_OUTPUT_BYTES,
    maxStderrBytes: MAX_GIT_OUTPUT_BYTES
  });

  return {
    stdout: result.stdout.text,
    stderr: result.stderr.text,
    exitCode: result.exitCode ?? 1,
    outputTruncated: result.stdout.truncated || result.stderr.truncated,
    ...(result.error ? { error: result.error } : {})
  };
}

export async function isGitRepository(workspaceRoot: string): Promise<boolean> {
  try {
    const result = await runGitCommand(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
    return !result.outputTruncated && result.exitCode === 0 && result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function hasHeadCommit(workspaceRoot: string): Promise<boolean> {
  try {
    const result = await runGitCommand(workspaceRoot, ['rev-parse', '--verify', 'HEAD']);
    return !result.outputTruncated && result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Collect paths from Git's NUL-delimited output. Git treats file names as byte
 * sequences, so line- and tab-delimited forms are unsafe for valid filenames.
 */
function parseNameStatus(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  const fields = output.split('\0');

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) {
      continue;
    }

    const statusCode = status[0];
    if (!statusCode) {
      continue;
    }

    const hasPreviousPath = statusCode === 'R' || statusCode === 'C';
    const previousPath = hasPreviousPath ? fields[index++] : undefined;
    const filePath = fields[index++];

    if (!filePath) {
      continue;
    }

    entries.push({
      path: filePath,
      ...(hasPreviousPath && previousPath ? { previousPath } : {}),
      isNew: statusCode === 'A' || statusCode === 'C',
      isDeleted: statusCode === 'D',
      source: 'diff'
    });
  }

  return entries;
}

function parseUntrackedPaths(output: string): GitStatusEntry[] {
  return output
    .split('\0')
    .filter((filePath) => filePath.length > 0)
    .map((filePath) => ({
      path: filePath,
      isNew: true,
      isDeleted: false,
      source: 'untracked' as const
    }));
}

function mergeStatusEntries(entryLists: readonly GitStatusEntry[][]): GitStatusEntry[] {
  const entries = new Map<string, GitStatusEntry>();

  for (const entry of entryLists.flat()) {
    const existing = entries.get(entry.path);
    if (!existing) {
      entries.set(entry.path, entry);
      continue;
    }

    entries.set(entry.path, {
      ...existing,
      ...entry,
      previousPath: entry.previousPath ?? existing.previousPath,
      isNew: existing.isNew || entry.isNew,
      isDeleted: entry.isDeleted
    });
  }

  return [...entries.values()];
}

async function readNameStatus(workspaceRoot: string, args: readonly string[]): Promise<GitStatusEntry[]> {
  const result = await runGitCommand(workspaceRoot, args);
  assertGitCommandSucceeded(result, 'read changed Git paths');
  return parseNameStatus(result.stdout);
}

async function readUntrackedStatus(workspaceRoot: string): Promise<GitStatusEntry[]> {
  const result = await runGitCommand(workspaceRoot, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z'
  ]);
  assertGitCommandSucceeded(result, 'read untracked Git paths');
  return parseUntrackedPaths(result.stdout);
}

async function collectStatusEntries(
  workspaceRoot: string,
  scope: GitChangeScope,
  headExists: boolean
): Promise<GitStatusEntry[]> {
  const commonArgs = ['--name-status', '-z', '--find-renames', '--no-ext-diff'];

  if (scope === 'staged') {
    return readNameStatus(workspaceRoot, [
      'diff',
      '--cached',
      ...commonArgs,
      ...(headExists ? ['HEAD'] : [])
    ]);
  }

  const trackedEntries = headExists
    ? await readNameStatus(workspaceRoot, ['diff', ...commonArgs, 'HEAD'])
    : mergeStatusEntries([
      await readNameStatus(workspaceRoot, ['diff', '--cached', ...commonArgs]),
      await readNameStatus(workspaceRoot, ['diff', ...commonArgs])
    ]);
  const untrackedEntries = await readUntrackedStatus(workspaceRoot);

  return mergeStatusEntries([trackedEntries, untrackedEntries]);
}

export async function collectGitChangedFiles(
  workspaceRoot: string,
  options: CollectGitChangedFilesOptions = {}
): Promise<ChangedFile[]> {
  const repository = await isGitRepository(workspaceRoot);
  if (!repository) {
    return [];
  }

  const scope = options.scope ?? 'worktree';
  const headExists = await hasHeadCommit(workspaceRoot);
  const entries = await collectStatusEntries(workspaceRoot, scope, headExists);
  const changedFiles: ChangedFile[] = [];

  for (const entry of entries) {
    if (entry.isDeleted) {
      continue;
    }

    assertWorkspacePath(workspaceRoot, entry.path, true);
    if (entry.previousPath) {
      assertWorkspacePath(workspaceRoot, entry.previousPath, true);
    }

    const changedLines = entry.source === 'untracked'
      ? readWorkspaceFileLines(workspaceRoot, entry.path)
      : await getChangedLines(workspaceRoot, entry, scope, headExists);

    changedFiles.push({
      path: entry.path,
      additions: changedLines.additions,
      modifications: [],
      isNew: entry.isNew,
      ...(Object.keys(changedLines.lineContents).length > 0
        ? { lineContents: changedLines.lineContents }
        : {})
    });
  }

  return changedFiles;
}

async function getChangedLines(
  workspaceRoot: string,
  entry: GitStatusEntry,
  scope: GitChangeScope,
  headExists: boolean
): Promise<ChangedLines> {
  if (scope === 'worktree' && !headExists) {
    // Before the first commit, the working tree is the only authoritative
    // candidate. Combining index-vs-empty and worktree-vs-index hunks can keep
    // a line that a later unstaged deletion removed.
    return readWorkspaceFileLines(workspaceRoot, entry.path);
  }

  return readDiffChangedLines(workspaceRoot, entry, scope, headExists);
}

async function readDiffChangedLines(
  workspaceRoot: string,
  entry: GitStatusEntry,
  scope: GitChangeScope,
  headExists: boolean
): Promise<ChangedLines> {
  const paths = entry.previousPath ? [entry.previousPath, entry.path] : [entry.path];
  const args = [
    'diff',
    ...(scope === 'staged' ? ['--cached'] : []),
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--unified=0',
    '--find-renames',
    ...(headExists ? ['HEAD'] : []),
    '--',
    ...paths
  ];
  const result = await runGitCommand(workspaceRoot, args);
  assertGitCommandSucceeded(result, `read changed lines for ${entry.path}`);
  const changedLines = parseDiffChangedLines(result.stdout);
  if (changedLines.binary) {
    throw new Error(`Unable to read changed lines for ${entry.path}: Git reported a binary diff.`);
  }

  return changedLines;
}

function assertGitCommandSucceeded(result: CommandResult, action: string): void {
  if (result.outputTruncated) {
    throw new Error(`Unable to ${action}: Git output exceeded ${MAX_GIT_OUTPUT_BYTES} bytes.`);
  }

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.error || `git exited with code ${result.exitCode}.`;
    throw new Error(`Unable to ${action}: ${detail}`);
  }
}

function parseDiffChangedLines(output: string): ChangedLines {
  const additions: number[] = [];
  const lineContents: Record<number, string> = {};
  let currentLine = 0;

  for (const line of output.split('\n')) {
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(currentLine);
      lineContents[currentLine] = line.slice(1);
      currentLine += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }

    if (!line.startsWith('\\')) {
      currentLine += 1;
    }
  }

  return {
    additions,
    lineContents,
    binary: output.includes('Binary files ') || output.includes('GIT binary patch')
  };
}

function readWorkspaceFileLines(workspaceRoot: string, relativePath: string): ChangedLines {
  const pathResult = resolveWorkspacePath(workspaceRoot, relativePath, { access: 'read' });
  if (!pathResult.valid) {
    throw new Error(`Unable to read untracked Git path ${relativePath}: ${pathResult.error}`);
  }

  const absolutePath = pathResult.realPath ?? pathResult.resolvedPath;
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile()) {
    return emptyChangedLines();
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const lines = content.length === 0 ? [] : content.split('\n');
  if (content.endsWith('\n')) {
    lines.pop();
  }

  const additions: number[] = [];
  const lineContents: Record<number, string> = {};
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    additions.push(lineNumber);
    lineContents[lineNumber] = line;
  }

  return { additions, lineContents, binary: false };
}

function emptyChangedLines(): ChangedLines {
  return { additions: [], lineContents: {}, binary: false };
}

function assertWorkspacePath(workspaceRoot: string, requestedPath: string, allowMissing: boolean): void {
  const pathResult = resolveWorkspacePath(workspaceRoot, requestedPath, {
    access: 'read',
    allowMissing
  });
  if (!pathResult.valid) {
    throw new Error(`Unable to use Git path ${requestedPath}: ${pathResult.error}`);
  }
}
