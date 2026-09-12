import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, expect, it } from 'vitest';

import { repositoryPackageManager } from './package-manager';
import { runHook } from './run';
import { DEFAULT_HOOK_RULE_POLICY, evaluateHookRules } from './rules';

const roots: string[] = [];
const manifest = { name: 'fixture', version: '1.0.0', packageManager: 'npm@10.9.2' };
const lock = { name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } };

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' });
}

function write(root: string, name: string, value: unknown): void {
  fs.writeFileSync(path.join(root, name), JSON.stringify(value));
}

function repository(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-package-contract-'));
  roots.push(root);
  git(root, 'init');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.com');
  write(root, 'package.json', manifest);
  write(root, 'package-lock.json', lock);
  git(root, 'add', 'package.json', 'package-lock.json');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Fixture package contract');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('honors a committed npm contract from the target index and keeps other managers blocked', async () => {
  const root = repository();
  const manager = await repositoryPackageManager(root);
  expect(manager).toBe('npm');
  const findings = evaluateHookRules([
    { path: 'README.md', text: ['npm', 'test'].join(' ') + '\n' + ['yarn', 'test'].join(' ') },
    { path: 'package-lock.json', text: JSON.stringify(lock) }
  ], DEFAULT_HOOK_RULE_POLICY, manager);
  expect(findings).toEqual([expect.objectContaining({ path: 'README.md', line: 2, rule: 'package-manager' })]);
});

it('does not trust an unstaged package or lock change', async () => {
  const root = repository();
  write(root, 'package.json', { ...manifest, packageManager: 'yarn@1.22.0' });
  write(root, 'package-lock.json', { ...lock, name: 'wrong' });
  expect(await repositoryPackageManager(root)).toBe('npm');
  git(root, 'add', 'package.json', 'package-lock.json');
  expect(await repositoryPackageManager(root)).toBe('pnpm');
});

it.each(['mismatch', 'malformed', 'conflicting', 'deleted', 'new-manager'])('fails closed for %s indexed contracts', async (variant) => {
  const root = repository();
  if (variant === 'mismatch') write(root, 'package-lock.json', { ...lock, name: 'other' });
  if (variant === 'malformed') fs.writeFileSync(path.join(root, 'package-lock.json'), '{');
  if (variant === 'conflicting') write(root, 'pnpm-lock.yaml', {});
  if (variant === 'deleted') fs.unlinkSync(path.join(root, 'package-lock.json'));
  if (variant === 'new-manager') {
    write(root, 'package.json', { ...manifest, packageManager: 'pnpm@11.7.0' });
    git(root, 'add', 'package.json');
    git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'Fixture prior manager');
    write(root, 'package.json', manifest);
  }
  git(root, 'add', '-A');
  expect(await repositoryPackageManager(root)).toBe('pnpm');
});

// Exercise both public hook branches with real index reads. The source branch
// deliberately returns a failed check to prove package policy cannot bypass it.
it.each(['metadata', 'source'])('uses the indexed contract on the %s hook path', async (kind) => {
  const root = repository();
  write(root, '.pre-cr.json', { version: 1 });
  fs.writeFileSync(path.join(root, 'README.md'), ['npm', 'test'].join(' '));
  if (kind === 'source') fs.writeFileSync(path.join(root, 'app.ts'), 'export const value = 1;');
  git(root, 'add', '-A');
  let checks = 0;
  const result = await runHook({ workspaceRoot: root, hook: 'pre-commit', json: true }, {
    runCheck: async () => { checks += 1; return { error: 'Fixture readiness failure' }; }
  });
  expect(result.findings.filter(finding => finding.rule === 'package-manager')).toEqual([]);
  expect(checks).toBe(kind === 'source' ? 1 : 0);
  expect(result.ok).toBe(kind === 'metadata');
  if (kind === 'source') expect(result.findings).toContainEqual(expect.objectContaining({ rule: 'pre-cr-failed' }));
  fs.writeFileSync(path.join(root, 'README.md'), ['npm', 'test', '&&', 'yarn', 'test'].join(' '));
  git(root, 'add', 'README.md');
  const blocked = await runHook({ workspaceRoot: root, hook: 'pre-commit', json: true });
  expect(blocked.ok).toBe(false);
  expect(blocked.findings).toContainEqual(expect.objectContaining({ rule: 'package-manager' }));
});

it('rejects a symlinked indexed lock and an uncommitted initial contract', async () => {
  const root = repository();
  fs.unlinkSync(path.join(root, 'package-lock.json'));
  fs.symlinkSync('package.json', path.join(root, 'package-lock.json'));
  git(root, 'add', 'package-lock.json');
  expect(await repositoryPackageManager(root)).toBe('pnpm');
  const initial = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-package-contract-'));
  roots.push(initial);
  git(initial, 'init');
  write(initial, 'package.json', manifest);
  write(initial, 'package-lock.json', lock);
  git(initial, 'add', '-A');
  expect(await repositoryPackageManager(initial)).toBe('pnpm');
});
