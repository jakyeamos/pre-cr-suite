import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { collectGitChangedFiles } from './git';

const tempRoots: string[] = [];

function createGitWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-git-'));
  tempRoots.push(workspaceRoot);
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspaceRoot });
  fs.writeFileSync(path.join(workspaceRoot, 'tracked.ts'), 'export const tracked = true;\n');
  execFileSync('git', ['add', 'tracked.ts'], { cwd: workspaceRoot });
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'initial'], { cwd: workspaceRoot });
  return workspaceRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('collectGitChangedFiles', () => {
  it('expands untracked directory placeholders into files', async () => {
    const workspaceRoot = createGitWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, 'new-dir'));
    fs.writeFileSync(path.join(workspaceRoot, 'new-dir', 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(workspaceRoot, 'new-dir', 'b.ts'), 'export const b = 2;\n');

    const result = await collectGitChangedFiles(workspaceRoot);

    expect(result.map((entry) => entry.path).sort()).toEqual([
      'new-dir/a.ts',
      'new-dir/b.ts'
    ]);
    expect(result.every((entry) => entry.isNew)).toBe(true);
  });

  it('can limit results to staged files only', async () => {
    const workspaceRoot = createGitWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'covered.ts'), 'export const oldValue = 1;\n');
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), '{"version":1}\n');
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot });
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'initial'], { cwd: workspaceRoot });

    fs.appendFileSync(path.join(workspaceRoot, 'src', 'covered.ts'), 'export const newValue = 2;\n');
    execFileSync('git', ['add', 'src/covered.ts'], { cwd: workspaceRoot });
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), '{"version":1,"dirty":true}\n');

    const changedFiles = await collectGitChangedFiles(workspaceRoot, { scope: 'staged' });

    expect(changedFiles).toEqual([
      {
        path: 'src/covered.ts',
        additions: [2],
        modifications: [],
        isNew: false
      }
    ]);
  }, 15000);
});
