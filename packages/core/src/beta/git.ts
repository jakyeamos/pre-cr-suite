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

export async function collectGitChangedFiles(workspaceRoot: string): Promise<ChangedFile[]> {
  const repository = await isGitRepository(workspaceRoot);
  if (!repository) {
    return [];
  }

  const statusResult = await runGitCommand(workspaceRoot, ['status', '--porcelain=v1']);
  if (statusResult.exitCode !== 0) {
    return [];
  }

  const headExists = await hasHeadCommit(workspaceRoot);
  const entries = parsePorcelainStatus(statusResult.stdout);
  const changedFiles: ChangedFile[] = [];

  for (const entry of entries) {
    if (entry.isDeleted) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, entry.path);
    const additions = entry.isNew
      ? readAllLineNumbers(absolutePath)
      : await getAddedLines(workspaceRoot, entry.path, headExists);

    changedFiles.push({
      path: entry.path,
      additions,
      modifications: [],
      isNew: entry.isNew
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

async function getAddedLines(
  workspaceRoot: string,
  relativePath: string,
  headExists: boolean
): Promise<number[]> {
  const args = headExists
    ? ['diff', '--no-color', '--unified=0', 'HEAD', '--', relativePath]
    : ['diff', '--no-color', '--unified=0', '--', relativePath];

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

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const lineCount = content.length === 0 ? 0 : content.split('\n').length;
  return Array.from({ length: lineCount }, (_unused, index) => index + 1);
}
