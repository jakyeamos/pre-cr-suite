import { runProcess, resolveWorkspacePath } from '@pre-cr/core';

import type { HookFile } from './types';

const SOURCE_DIFF_FILTER = 'ACMR';
const MAX_HOOK_OUTPUT_BYTES = 20 * 1024 * 1024;

export async function stagedPaths(workspaceRoot: string): Promise<string[]> {
  const result = await runProcess({
    command: 'git',
    args: ['diff', '--cached', '--name-only', '-z', `--diff-filter=${SOURCE_DIFF_FILTER}`],
    cwd: workspaceRoot,
    env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' },
    maxStdoutBytes: MAX_HOOK_OUTPUT_BYTES,
    maxStderrBytes: MAX_HOOK_OUTPUT_BYTES
  });
  if (!result.success || result.stdout.truncated) {
    throw new Error(`Unable to read staged paths from Git: ${result.error ?? 'output was truncated.'}`);
  }

  const paths = result.stdout.text.split('\0').filter(Boolean);
  for (const filePath of paths) {
    const pathResult = resolveWorkspacePath(workspaceRoot, filePath, {
      access: 'read',
      allowMissing: true
    });
    if (!pathResult.valid) {
      throw new Error(`Unable to use staged Git path ${filePath}: ${pathResult.error}`);
    }
  }

  return paths;
}

export async function stagedFiles(workspaceRoot: string, paths: string[]): Promise<HookFile[]> {
  const files: HookFile[] = [];
  for (const filePath of paths) {
    const text = await stagedText(workspaceRoot, filePath);
    if (text !== null) {
      files.push({ path: filePath, text });
    }
  }
  return files;
}

async function stagedText(workspaceRoot: string, filePath: string): Promise<string | null> {
  const pathResult = resolveWorkspacePath(workspaceRoot, filePath, {
    access: 'read',
    allowMissing: true
  });
  if (!pathResult.valid) {
    return null;
  }

  try {
    const result = await runProcess({
      command: 'git',
      args: ['show', `:${filePath}`],
      cwd: workspaceRoot,
      env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' },
      maxStdoutBytes: MAX_HOOK_OUTPUT_BYTES,
      maxStderrBytes: MAX_HOOK_OUTPUT_BYTES
    });
    if (!result.success || result.stdout.truncated || result.stderr.truncated) {
      return null;
    }
    return result.stdout.text.includes('\0') ? null : result.stdout.text;
  } catch {
    return null;
  }
}
