import { access, chmod, mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

import type { HookManager, HookName } from './types';

const BEGIN_MARKER = 'BEGIN PRE-CR MANAGED BLOCK';
const END_MARKER = 'END PRE-CR MANAGED BLOCK';

export interface HookInstallOptions {
  workspaceRoot: string;
  manager: HookManager;
  hook: HookName;
  force: boolean;
}

export interface HookUninstallOptions {
  workspaceRoot: string;
  manager: HookManager;
  hook: HookName;
}

export interface HookStatusOptions {
  workspaceRoot: string;
}

export interface HookOperationResult {
  manager: Exclude<HookManager, 'auto' | 'all'>;
  hook: HookName;
  path: string;
  changed: boolean;
}

export interface HookManagerStatus {
  manager: Exclude<HookManager, 'auto' | 'all'>;
  hook: HookName;
  path: string;
  installed: boolean;
  hasManagedBlock: boolean;
  configValid: boolean;
  preCrConfigExists: boolean;
}

export interface HookStatusResult {
  workspaceRoot: string;
  preCrConfigExists: boolean;
  managers: HookManagerStatus[];
}

type ConcreteHookManager = Exclude<HookManager, 'auto' | 'all'>;

export async function installHook(options: HookInstallOptions): Promise<HookOperationResult> {
  const manager = await resolveManagerForInstall(options.workspaceRoot, options.manager, options.force);
  const results: HookOperationResult[] = [];
  for (const item of manager) {
    results.push(await installConcreteHook({ ...options, manager: item }));
  }
  return results[0];
}

export async function uninstallHook(options: HookUninstallOptions): Promise<HookOperationResult> {
  const managers = await resolveManagerForUninstall(options.workspaceRoot, options.manager);
  const results: HookOperationResult[] = [];
  for (const manager of managers) {
    results.push(await uninstallConcreteHook({ ...options, manager }));
  }
  return results[0];
}

export async function getHookStatus(options: HookStatusOptions): Promise<HookStatusResult> {
  const preCrConfigExists = await exists(path.join(options.workspaceRoot, '.pre-cr.json'));
  const managers: HookManagerStatus[] = [];
  for (const manager of ['native', 'husky', 'lefthook', 'pre-commit'] as ConcreteHookManager[]) {
    managers.push(await getConcreteStatus(options.workspaceRoot, manager, 'pre-commit', preCrConfigExists));
  }
  return {
    workspaceRoot: options.workspaceRoot,
    preCrConfigExists,
    managers
  };
}

export function managedHookBlock(hook: HookName): string {
  return [
    `# ${BEGIN_MARKER}`,
    'if ! command -v pre-cr >/dev/null 2>&1; then',
    '  echo "[pre-cr] pre-cr CLI is required for source commits; install @pre-cr/server or expose pre-cr on PATH" >&2',
    '  exit 1',
    'fi',
    'repo_root="$(git rev-parse --show-toplevel)"',
    `pre-cr hook run --workspace "$repo_root" --hook ${hook}`,
    `# ${END_MARKER}`
  ].join('\n');
}

async function resolveManagerForInstall(
  workspaceRoot: string,
  manager: HookManager,
  force: boolean
): Promise<ConcreteHookManager[]> {
  if (manager === 'auto') {
    const detected = await detectedManagers(workspaceRoot);
    return detected.length > 0 ? [detected[0]] : ['native'];
  }
  if (manager === 'all') {
    const detected = await detectedManagers(workspaceRoot);
    if (detected.length > 0) {
      return force && !detected.includes('native') ? [...detected, 'native'] : detected;
    }
    return ['native'];
  }
  return [manager];
}

async function resolveManagerForUninstall(
  workspaceRoot: string,
  manager: HookManager
): Promise<ConcreteHookManager[]> {
  if (manager === 'auto' || manager === 'all') {
    const detected = await detectedManagers(workspaceRoot);
    return detected.length > 0 ? detected : ['native'];
  }
  return [manager];
}

async function detectedManagers(workspaceRoot: string): Promise<ConcreteHookManager[]> {
  const managers: ConcreteHookManager[] = [];
  if (await exists(path.join(workspaceRoot, '.husky'))) {
    managers.push('husky');
  }
  if (await findLefthookPath(workspaceRoot)) {
    managers.push('lefthook');
  }
  if (await exists(path.join(workspaceRoot, '.pre-commit-config.yaml'))) {
    managers.push('pre-commit');
  }
  if (await exists(nativeHookPath(workspaceRoot, 'pre-commit'))) {
    managers.push('native');
  }
  return managers;
}

async function installConcreteHook(
  options: HookInstallOptions & { manager: ConcreteHookManager }
): Promise<HookOperationResult> {
  switch (options.manager) {
    case 'native':
      return installManagedScript(nativeHookPath(options.workspaceRoot, options.hook), options.manager, options.hook);
    case 'husky':
      return installHuskyHook({ ...options, manager: 'husky' });
    case 'lefthook':
      return installLefthookHook({ ...options, manager: 'lefthook' });
    case 'pre-commit':
      return installPreCommitFrameworkHook({ ...options, manager: 'pre-commit' });
  }
}

async function uninstallConcreteHook(
  options: HookUninstallOptions & { manager: ConcreteHookManager }
): Promise<HookOperationResult> {
  switch (options.manager) {
    case 'native':
      return uninstallManagedScript(nativeHookPath(options.workspaceRoot, options.hook), options.manager, options.hook);
    case 'husky':
      return uninstallManagedScript(path.join(options.workspaceRoot, '.husky', options.hook), options.manager, options.hook);
    case 'lefthook':
      return uninstallLefthookHook({ ...options, manager: 'lefthook' });
    case 'pre-commit':
      return uninstallPreCommitFrameworkHook({ ...options, manager: 'pre-commit' });
  }
}

async function installHuskyHook(options: HookInstallOptions & { manager: 'husky' }): Promise<HookOperationResult> {
  const huskyDir = path.join(options.workspaceRoot, '.husky');
  if (!(await exists(huskyDir))) {
    if (!options.force) {
      throw new Error('Husky setup not found. Re-run with --force to create .husky.');
    }
    await mkdir(huskyDir, { recursive: true });
  }
  return installManagedScript(path.join(huskyDir, options.hook), options.manager, options.hook);
}

async function installManagedScript(
  scriptPath: string,
  manager: ConcreteHookManager,
  hook: HookName
): Promise<HookOperationResult> {
  await mkdir(path.dirname(scriptPath), { recursive: true });
  const existing = await readText(scriptPath);
  const prefix = existing.trim().length > 0 ? existing : '#!/usr/bin/env sh\n';
  const next = upsertManagedBlock(prefix, managedHookBlock(hook));
  await writeFile(scriptPath, next.endsWith('\n') ? next : `${next}\n`);
  await chmod(scriptPath, 0o755);
  return {
    manager,
    hook,
    path: scriptPath,
    changed: next !== existing
  };
}

async function uninstallManagedScript(
  scriptPath: string,
  manager: ConcreteHookManager,
  hook: HookName
): Promise<HookOperationResult> {
  const existing = await readText(scriptPath);
  const next = removeManagedBlock(existing);
  if (next !== existing) {
    await writeFile(scriptPath, next);
  }
  return {
    manager,
    hook,
    path: scriptPath,
    changed: next !== existing
  };
}

async function installLefthookHook(options: HookInstallOptions & { manager: 'lefthook' }): Promise<HookOperationResult> {
  const configPath = await findLefthookPath(options.workspaceRoot) ?? path.join(options.workspaceRoot, 'lefthook.yml');
  const config = await readYamlObject(configPath);
  const hookConfig = ensureRecord(config[options.hook]);
  const commands = ensureRecord(hookConfig.commands);
  commands['pre-cr'] = {
    run: `pre-cr hook run --workspace . --hook ${options.hook}`
  };
  hookConfig.commands = commands;
  config[options.hook] = hookConfig;
  await writeYamlObject(configPath, config);
  return {
    manager: options.manager,
    hook: options.hook,
    path: configPath,
    changed: true
  };
}

async function uninstallLefthookHook(options: HookUninstallOptions & { manager: 'lefthook' }): Promise<HookOperationResult> {
  const configPath = await findLefthookPath(options.workspaceRoot) ?? path.join(options.workspaceRoot, 'lefthook.yml');
  const config = await readYamlObject(configPath);
  const hookConfig = ensureRecord(config[options.hook]);
  const commands = ensureRecord(hookConfig.commands);
  const hadCommand = Object.prototype.hasOwnProperty.call(commands, 'pre-cr');
  delete commands['pre-cr'];
  hookConfig.commands = commands;
  config[options.hook] = hookConfig;
  if (hadCommand) {
    await writeYamlObject(configPath, config);
  }
  return {
    manager: options.manager,
    hook: options.hook,
    path: configPath,
    changed: hadCommand
  };
}

async function installPreCommitFrameworkHook(options: HookInstallOptions & { manager: 'pre-commit' }): Promise<HookOperationResult> {
  const configPath = path.join(options.workspaceRoot, '.pre-commit-config.yaml');
  const config = await readYamlObject(configPath);
  const repos = Array.isArray(config.repos) ? config.repos as unknown[] : [];
  const localRepo = findOrCreateLocalRepo(repos);
  const hooks = Array.isArray(localRepo.hooks) ? localRepo.hooks as Record<string, unknown>[] : [];
  const entry = {
    id: 'pre-cr',
    name: 'Pre-CR',
    entry: `pre-cr hook run --workspace . --hook ${options.hook}`,
    language: 'system',
    pass_filenames: false,
    stages: [options.hook]
  };
  const existingIndex = hooks.findIndex((hook) => hook.id === 'pre-cr');
  if (existingIndex >= 0) {
    hooks[existingIndex] = { ...hooks[existingIndex], ...entry };
  } else {
    hooks.push(entry);
  }
  localRepo.hooks = hooks;
  config.repos = repos;
  await writeYamlObject(configPath, config);
  return {
    manager: options.manager,
    hook: options.hook,
    path: configPath,
    changed: true
  };
}

async function uninstallPreCommitFrameworkHook(options: HookUninstallOptions & { manager: 'pre-commit' }): Promise<HookOperationResult> {
  const configPath = path.join(options.workspaceRoot, '.pre-commit-config.yaml');
  const config = await readYamlObject(configPath);
  const repos = Array.isArray(config.repos) ? config.repos as Record<string, unknown>[] : [];
  let changed = false;
  for (const repo of repos) {
    if (repo.repo !== 'local' || !Array.isArray(repo.hooks)) {
      continue;
    }
    const hooks = repo.hooks as Record<string, unknown>[];
    const nextHooks = hooks.filter((hook) => hook.id !== 'pre-cr');
    if (nextHooks.length !== hooks.length) {
      repo.hooks = nextHooks;
      changed = true;
    }
  }
  if (changed) {
    config.repos = repos;
    await writeYamlObject(configPath, config);
  }
  return {
    manager: options.manager,
    hook: options.hook,
    path: configPath,
    changed
  };
}

async function getConcreteStatus(
  workspaceRoot: string,
  manager: ConcreteHookManager,
  hook: HookName,
  preCrConfigExists: boolean
): Promise<HookManagerStatus> {
  const statusPath = manager === 'lefthook'
    ? await findLefthookPath(workspaceRoot) ?? managerPath(workspaceRoot, manager, hook)
    : managerPath(workspaceRoot, manager, hook);
  const text = await readText(statusPath);
  const hasManagedBlock = text.includes(BEGIN_MARKER) && text.includes(END_MARKER);
  const installed = manager === 'lefthook'
    ? await lefthookHasCommand(statusPath, hook)
    : manager === 'pre-commit'
      ? await preCommitHasHook(statusPath)
      : hasManagedBlock;
  return {
    manager,
    hook,
    path: statusPath,
    installed,
    hasManagedBlock: manager === 'native' || manager === 'husky' ? hasManagedBlock : installed,
    configValid: preCrConfigExists,
    preCrConfigExists
  };
}

function upsertManagedBlock(existing: string, block: string): string {
  const without = removeManagedBlock(existing).trimEnd();
  return `${without}${without.length > 0 ? '\n\n' : ''}${block}\n`;
}

function removeManagedBlock(existing: string): string {
  const pattern = new RegExp(`\\n?# ${BEGIN_MARKER}[\\s\\S]*?# ${END_MARKER}\\n?`, 'm');
  return existing.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n');
}

function nativeHookPath(workspaceRoot: string, hook: HookName): string {
  return path.join(workspaceRoot, '.git', 'hooks', hook);
}

function managerPath(workspaceRoot: string, manager: ConcreteHookManager, hook: HookName): string {
  switch (manager) {
    case 'native':
      return nativeHookPath(workspaceRoot, hook);
    case 'husky':
      return path.join(workspaceRoot, '.husky', hook);
    case 'lefthook':
      return path.join(workspaceRoot, 'lefthook.yml');
    case 'pre-commit':
      return path.join(workspaceRoot, '.pre-commit-config.yaml');
  }
}

async function findLefthookPath(workspaceRoot: string): Promise<string | null> {
  for (const candidate of ['lefthook.yml', 'lefthook.yaml']) {
    const configPath = path.join(workspaceRoot, candidate);
    if (await exists(configPath)) {
      return configPath;
    }
  }
  return null;
}

async function readText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readYamlObject(filePath: string): Promise<Record<string, unknown>> {
  const text = await readText(filePath);
  if (text.trim().length === 0) {
    return {};
  }
  const loaded = yaml.load(text);
  return typeof loaded === 'object' && loaded !== null && !Array.isArray(loaded)
    ? loaded as Record<string, unknown>
    : {};
}

async function writeYamlObject(filePath: string, value: Record<string, unknown>): Promise<void> {
  await writeFile(filePath, yaml.dump(value, { lineWidth: 120, noRefs: true }));
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function findOrCreateLocalRepo(repos: unknown[]): Record<string, unknown> {
  const local = repos.find((repo): repo is Record<string, unknown> => {
    return typeof repo === 'object' && repo !== null && (repo as Record<string, unknown>).repo === 'local';
  });
  if (local) {
    return local;
  }
  const created: Record<string, unknown> = { repo: 'local', hooks: [] };
  repos.push(created);
  return created;
}

async function lefthookHasCommand(configPath: string, hook: HookName): Promise<boolean> {
  if (!(await exists(configPath))) {
    return false;
  }
  const config = await readYamlObject(configPath);
  const hookConfig = ensureRecord(config[hook]);
  const commands = ensureRecord(hookConfig.commands);
  return Object.prototype.hasOwnProperty.call(commands, 'pre-cr');
}

async function preCommitHasHook(configPath: string): Promise<boolean> {
  if (!(await exists(configPath))) {
    return false;
  }
  const config = await readYamlObject(configPath);
  const repos = Array.isArray(config.repos) ? config.repos as Record<string, unknown>[] : [];
  return repos.some((repo) => {
    if (repo.repo !== 'local' || !Array.isArray(repo.hooks)) {
      return false;
    }
    return (repo.hooks as Record<string, unknown>[]).some((hook) => hook.id === 'pre-cr');
  });
}
