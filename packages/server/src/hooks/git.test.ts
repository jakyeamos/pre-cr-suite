import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { stagedFiles, stagedPaths } from './git';

const temporaryRoots: string[] = [];

function createRepository(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-hook-git-'));
  temporaryRoots.push(root);
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root });
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('hook Git access', () => {
  it('preserves unusual staged filenames through NUL-delimited output', async () => {
    const workspaceRoot = createRepository();
    const relativePath = 'src/quoted name\t✓\nfile.ts';
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, relativePath), 'export const value = 1;\n');
    execFileSync('git', ['add', relativePath], { cwd: workspaceRoot });

    const paths = await stagedPaths(workspaceRoot);
    const files = await stagedFiles(workspaceRoot, paths);

    expect(paths).toEqual([relativePath]);
    expect(files).toEqual([{ path: relativePath, text: 'export const value = 1;\n' }]);
  });
});
