import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { describe, expect, it } from 'vitest';

import { getHookStatus, installHook, uninstallHook } from './manager';

function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-hook-manager-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

describe('hook manager', () => {
  it('installs, reports, and uninstalls a native managed hook without deleting unmanaged content', async () => {
    const workspaceRoot = makeRepo();
    const hookPath = path.join(workspaceRoot, '.git', 'hooks', 'pre-commit');
    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, '#!/usr/bin/env sh\nprintf "existing\\n"\n');

    const install = await installHook({ workspaceRoot, manager: 'native', hook: 'pre-commit', force: false });
    expect(install.changed).toBe(true);
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('BEGIN PRE-CR MANAGED BLOCK');
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('printf "existing\\n"');

    const status = await getHookStatus({ workspaceRoot });
    expect(status.managers).toContainEqual(expect.objectContaining({
      manager: 'native',
      installed: true,
      hook: 'pre-commit',
      hasManagedBlock: true
    }));

    const uninstall = await uninstallHook({ workspaceRoot, manager: 'native', hook: 'pre-commit' });
    expect(uninstall.changed).toBe(true);
    expect(fs.readFileSync(hookPath, 'utf-8')).not.toContain('BEGIN PRE-CR MANAGED BLOCK');
    expect(fs.readFileSync(hookPath, 'utf-8')).toContain('printf "existing\\n"');
  });

  it('requires existing Husky setup unless forced', async () => {
    const workspaceRoot = makeRepo();

    await expect(installHook({
      workspaceRoot,
      manager: 'husky',
      hook: 'pre-commit',
      force: false
    })).rejects.toThrow('Husky setup not found');

    const install = await installHook({
      workspaceRoot,
      manager: 'husky',
      hook: 'pre-commit',
      force: true
    });

    expect(install.changed).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, '.husky', 'pre-commit'), 'utf-8')).toContain('pre-cr hook run');
  });

  it('updates Lefthook and pre-commit framework config through managed entries', async () => {
    const workspaceRoot = makeRepo();
    fs.writeFileSync(path.join(workspaceRoot, 'lefthook.yml'), 'pre-commit:\n  commands:\n    existing:\n      run: echo existing\n');
    fs.writeFileSync(path.join(workspaceRoot, '.pre-commit-config.yaml'), 'repos: []\n');

    await installHook({ workspaceRoot, manager: 'lefthook', hook: 'pre-commit', force: false });
    await installHook({ workspaceRoot, manager: 'pre-commit', hook: 'pre-commit', force: false });

    const lefthook = fs.readFileSync(path.join(workspaceRoot, 'lefthook.yml'), 'utf-8');
    const preCommit = fs.readFileSync(path.join(workspaceRoot, '.pre-commit-config.yaml'), 'utf-8');

    expect(lefthook).toContain('pre-cr');
    expect(lefthook).toContain('echo existing');
    expect(preCommit).toContain('repo: local');
    expect(preCommit).toContain('id: pre-cr');
    expect(preCommit).toContain('pre-cr hook run');
  });

  it('reports installed Lefthook status from lefthook.yaml', async () => {
    const workspaceRoot = makeRepo();
    const configPath = path.join(workspaceRoot, 'lefthook.yaml');
    fs.writeFileSync(configPath, 'pre-commit:\n  commands:\n    existing:\n      run: echo existing\n');

    await installHook({ workspaceRoot, manager: 'lefthook', hook: 'pre-commit', force: false });

    const status = await getHookStatus({ workspaceRoot });
    expect(status.managers).toContainEqual(expect.objectContaining({
      manager: 'lefthook',
      path: configPath,
      installed: true,
      hasManagedBlock: true
    }));
  });
});
