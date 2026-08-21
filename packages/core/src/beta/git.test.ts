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

function createUncommittedGitWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-git-'));
  tempRoots.push(workspaceRoot);
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspaceRoot });
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
    fs.appendFileSync(path.join(workspaceRoot, 'src', 'covered.ts'), 'export const worktreeOnly = 3;\n');
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), '{"version":1,"dirty":true}\n');

    const changedFiles = await collectGitChangedFiles(workspaceRoot, { scope: 'staged' });

    expect(changedFiles).toEqual([
      {
        path: 'src/covered.ts',
        additions: [2],
        modifications: [],
        isNew: false,
        lineContents: {
          2: 'export const newValue = 2;'
        }
      }
    ]);
  }, 15000);

  it('combines staged and unstaged changes before the first commit', async () => {
    const workspaceRoot = createUncommittedGitWorkspace();
    fs.writeFileSync(path.join(workspaceRoot, 'new.ts'), 'export const staged = 1;\n');
    execFileSync('git', ['add', 'new.ts'], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, 'new.ts'), 'export const worktree = 2;\n');

    const stagedFiles = await collectGitChangedFiles(workspaceRoot, { scope: 'staged' });
    const worktreeFiles = await collectGitChangedFiles(workspaceRoot, { scope: 'worktree' });

    expect(stagedFiles).toEqual([
      {
        path: 'new.ts',
        additions: [1],
        modifications: [],
        isNew: true,
        lineContents: {
          1: 'export const staged = 1;'
        }
      }
    ]);
    expect(worktreeFiles).toEqual([
      {
        path: 'new.ts',
        additions: [1, 2],
        modifications: [],
        isNew: true,
        lineContents: {
          1: 'export const staged = 1;',
          2: 'export const worktree = 2;'
        }
      }
    ]);
  }, 15000);

  it('uses the final worktree content before the first commit', async () => {
    const workspaceRoot = createUncommittedGitWorkspace();
    fs.writeFileSync(path.join(workspaceRoot, 'new.ts'), [
      'export const removed = 1;',
      'export const retained = 2;',
      ''
    ].join('\n'));
    execFileSync('git', ['add', 'new.ts'], { cwd: workspaceRoot });
    fs.writeFileSync(path.join(workspaceRoot, 'new.ts'), 'export const retained = 2;\n');

    const worktreeFiles = await collectGitChangedFiles(workspaceRoot, { scope: 'worktree' });

    expect(worktreeFiles).toEqual([
      {
        path: 'new.ts',
        additions: [1],
        modifications: [],
        isNew: true,
        lineContents: {
          1: 'export const retained = 2;'
        }
      }
    ]);
  }, 15000);

  it('preserves tabs, Unicode, and newlines in renamed staged paths', async () => {
    const workspaceRoot = createGitWorkspace();
    const originalPath = 'src/old\tname-✓\nline.ts';
    const renamedPath = 'src/new\tname-✓\nline.ts';
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, originalPath), [
      'export const one = 1;',
      'export const two = 2;',
      'export const three = 3;',
      'export const four = 4;',
      ''
    ].join('\n'));
    execFileSync('git', ['add', originalPath], { cwd: workspaceRoot });
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'add unusual path'], {
      cwd: workspaceRoot
    });

    execFileSync('git', ['mv', originalPath, renamedPath], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, renamedPath), 'export const five = 5;\n');
    execFileSync('git', ['add', renamedPath], { cwd: workspaceRoot });

    const changedFiles = await collectGitChangedFiles(workspaceRoot, { scope: 'staged' });

    expect(changedFiles).toEqual([
      {
        path: renamedPath,
        additions: [5],
        modifications: [],
        isNew: false,
        lineContents: {
          5: 'export const five = 5;'
        }
      }
    ]);
  }, 15000);

  it('reads every untracked file line and retains its exact path and content', async () => {
    const workspaceRoot = createGitWorkspace();
    const relativePath = 'new dir/untracked\tname-✓\nline.ts';
    fs.mkdirSync(path.join(workspaceRoot, 'new dir'));
    fs.writeFileSync(
      path.join(workspaceRoot, relativePath),
      '// full-line comment\nexport const value = 1;\n'
    );

    const changedFiles = await collectGitChangedFiles(workspaceRoot);

    expect(changedFiles).toEqual([
      {
        path: relativePath,
        additions: [1, 2],
        modifications: [],
        isNew: true,
        lineContents: {
          1: '// full-line comment',
          2: 'export const value = 1;'
        }
      }
    ]);
  }, 15000);

  it('fails closed when an untracked path resolves through an external symlink', async () => {
    const workspaceRoot = createGitWorkspace();
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-external-'));
    tempRoots.push(externalRoot);
    const externalFile = path.join(externalRoot, 'external.ts');
    fs.writeFileSync(externalFile, 'export const external = true;\n');
    fs.symlinkSync(externalFile, path.join(workspaceRoot, 'escape.ts'));

    await expect(collectGitChangedFiles(workspaceRoot)).rejects.toThrow('outside workspace');
  }, 15000);

  it('fails closed when Git reports a binary diff without changed text lines', async () => {
    const workspaceRoot = createGitWorkspace();
    const binaryPath = path.join(workspaceRoot, 'source.bin');
    fs.writeFileSync(binaryPath, Buffer.from([0, 1, 2, 3]));
    execFileSync('git', ['add', 'source.bin'], { cwd: workspaceRoot });
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'add binary'], {
      cwd: workspaceRoot
    });
    fs.writeFileSync(binaryPath, Buffer.from([0, 1, 2, 4]));

    await expect(collectGitChangedFiles(workspaceRoot)).rejects.toThrow('binary diff');
  }, 15000);
});
