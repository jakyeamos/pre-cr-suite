import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import type { ChangedFile } from '../runner/coverageChecker';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runGitCommand(workspaceRoot: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: workspaceRoot,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0
      });
    });
  });
}

export async function isGitRepository(workspaceRoot: string): Promise<boolean> {
  try {
    const result = await runGitCommand(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
    return result.exitCode === 0 && result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function hasHeadCommit(workspaceRoot: string): Promise<boolean> {
  try {
    const result = await runGitCommand(workspaceRoot, ['rev-parse', '--verify', 'HEAD']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

interface GitStatusEntry {
  path: string;
  isNew: boolean;
  isDeleted: boolean;
}

export type GitChangeScope = 'worktree' | 'staged';

export interface CollectGitChangedFilesOptions {
  scope?: GitChangeScope;
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
  const statusArgs = scope === 'staged'
    ? ['diff', '--cached', '--name-status']
    : ['status', '--porcelain=v1'];
  const statusResult = await runGitCommand(workspaceRoot, statusArgs);
  if (statusResult.exitCode !== 0) {
    return [];
  }

  const headExists = await hasHeadCommit(workspaceRoot);
  const entries = scope === 'staged'
    ? parseNameStatus(statusResult.stdout)
    : parsePorcelainStatus(statusResult.stdout);
  const changedFiles: ChangedFile[] = [];

  for (const entry of entries) {
    if (entry.isDeleted) {
      continue;
    }

    if (entry.isNew) {
      const newPaths = scope === 'staged'
        ? [entry.path]
        : expandNewPath(workspaceRoot, entry.path);

      for (const filePath of newPaths) {
        changedFiles.push({
          path: filePath,
          additions: scope === 'staged'
            ? await getAddedLines(workspaceRoot, filePath, headExists, scope)
            : readAllLineNumbers(path.join(workspaceRoot, filePath)),
          modifications: [],
          isNew: true
        });
      }
      continue;
    }

    changedFiles.push({
      path: entry.path,
      additions: await getAddedLines(workspaceRoot, entry.path, headExists, scope),
      modifications: [],
      isNew: false
    });
  }

  return changedFiles;
}

function parsePorcelainStatus(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const rawLine of output.split('\n')) {
    if (!rawLine.trim()) {
      continue;
    }

    const status = rawLine.slice(0, 2);
    const rawPath = rawLine.slice(3).trim();
    const resolvedPath = rawPath.includes(' -> ')
      ? rawPath.split(' -> ').pop() ?? rawPath
      : rawPath;

    entries.push({
      path: resolvedPath,
      isNew: status === '??' || status.includes('A'),
      isDeleted: status.includes('D')
    });
  }

  return entries;
}

function parseNameStatus(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];

  for (const rawLine of output.split('\n')) {
    if (!rawLine.trim()) {
      continue;
    }

    const [status, firstPath, secondPath] = rawLine.split('\t');
    const resolvedPath = secondPath ?? firstPath;
    if (!resolvedPath) {
      continue;
    }

    entries.push({
      path: resolvedPath,
      isNew: status.startsWith('A'),
      isDeleted: status.startsWith('D')
    });
  }

  return entries;
}

async function getAddedLines(
  workspaceRoot: string,
  relativePath: string,
  headExists: boolean,
  scope: GitChangeScope
): Promise<number[]> {
  const args = scope === 'staged'
    ? (headExists
      ? ['diff', '--cached', '--no-color', '--unified=0', 'HEAD', '--', relativePath]
      : ['diff', '--cached', '--no-color', '--unified=0', '--', relativePath])
    : (headExists
      ? ['diff', '--no-color', '--unified=0', 'HEAD', '--', relativePath]
      : ['diff', '--no-color', '--unified=0', '--', relativePath]);

  const result = await runGitCommand(workspaceRoot, args);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  const additions: number[] = [];
  let currentLine = 0;

  for (const line of result.stdout.split('\n')) {
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(currentLine);
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

  return additions;
}

function readAllLineNumbers(absolutePath: string): number[] {
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return [];
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const lineCount = content.length === 0 ? 0 : content.split('\n').length;
  return Array.from({ length: lineCount }, (_unused, index) => index + 1);
}

function expandNewPath(workspaceRoot: string, relativePath: string): string[] {
  const absolutePath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return [relativePath];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const childPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...expandNewPath(workspaceRoot, childPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(childPath);
    }
  }

  return files.sort();
}
