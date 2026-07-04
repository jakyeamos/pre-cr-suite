import { execFile } from 'child_process';
import { promisify } from 'util';

import type { HookFile } from './types';

const execFileAsync = promisify(execFile);
const SOURCE_DIFF_FILTER = 'ACMR';

export async function stagedPaths(workspaceRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['diff', '--cached', '--name-only', `--diff-filter=${SOURCE_DIFF_FILTER}`], {
    cwd: workspaceRoot
  });
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
  try {
    const { stdout } = await execFileAsync('git', ['show', `:${filePath}`], {
      cwd: workspaceRoot,
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024
    });
    return stdout.includes('\0') ? null : stdout;
  } catch {
    return null;
  }
}
