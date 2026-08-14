import { getHookStatus, installHook, uninstallHook } from './manager';
import { runHook } from './run';
import type { HookManager, HookName, HookRunResult } from './types';
import type { RunPreCrCheckResult } from '@pre-cr/core';

interface HookCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface HookCliDependencies {
  cwd: string;
  usageText: string;
  runCheck?: (workspaceRoot: string, options?: { changeScope?: 'worktree' | 'staged' }) => Promise<RunPreCrCheckResult>;
}

export type ParsedHookArgs =
  | {
      command: 'install';
      manager: HookManager;
      hook: HookName;
      force: boolean;
      workspaceRoot: string;
    }
  | {
      command: 'status';
      json: boolean;
      workspaceRoot: string;
    }
  | {
      command: 'uninstall';
      manager: HookManager;
      hook: HookName;
      workspaceRoot: string;
    }
  | {
      command: 'run';
      json: boolean;
      workspaceRoot: string;
      hook: HookName;
    };

export async function runHookCli(argv: string[], dependencies: HookCliDependencies): Promise<HookCliResult> {
  const parsed = parseHookArgs(argv, dependencies.cwd);
  if (!parsed) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: dependencies.usageText
    };
  }

  if (parsed.command === 'install') {
    const result = await installHook(parsed);
    return {
      exitCode: 0,
      stdout: `Installed Pre-CR ${result.hook} hook via ${result.manager}: ${result.path}\n`,
      stderr: ''
    };
  }

  if (parsed.command === 'uninstall') {
    const result = await uninstallHook(parsed);
    return {
      exitCode: 0,
      stdout: `${result.changed ? 'Removed' : 'No'} Pre-CR ${result.hook} hook via ${result.manager}: ${result.path}\n`,
      stderr: ''
    };
  }

  if (parsed.command === 'status') {
    const status = await getHookStatus({ workspaceRoot: parsed.workspaceRoot });
    return {
      exitCode: 0,
      stdout: parsed.json ? `${JSON.stringify(status, null, 2)}\n` : formatHookStatus(status),
      stderr: ''
    };
  }

  const result = await runHook(parsed, { runCheck: dependencies.runCheck });
  return {
    exitCode: result.ok ? 0 : 1,
    stdout: parsed.json ? `${JSON.stringify(result, null, 2)}\n` : formatHookRunResult(result),
    stderr: ''
  };
}

export function parseHookArgs(argv: string[], cwd: string): ParsedHookArgs | null {
  const command = argv[0];
  if (command !== 'install' && command !== 'status' && command !== 'uninstall' && command !== 'run') {
    return null;
  }

  let manager: HookManager = 'auto';
  let hook: HookName = 'pre-commit';
  let json = false;
  let force = false;
  let workspaceRoot = cwd;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--manager') {
      const value = argv[index + 1];
      if (!isHookManager(value)) {
        return null;
      }
      manager = value;
      index += 1;
      continue;
    }
    if (arg === '--hook') {
      const value = argv[index + 1];
      if (!isHookName(value)) {
        return null;
      }
      hook = value;
      index += 1;
      continue;
    }
    if (arg === '--workspace') {
      const value = argv[index + 1];
      if (!value) {
        return null;
      }
      workspaceRoot = value;
      index += 1;
      continue;
    }
    return null;
  }

  if (command === 'install') {
    return { command, manager, hook, force, workspaceRoot };
  }
  if (command === 'uninstall') {
    return { command, manager, hook, workspaceRoot };
  }
  if (command === 'status') {
    return { command, json, workspaceRoot };
  }
  return { command, json, workspaceRoot, hook };
}

function isHookManager(value: string | undefined): value is HookManager {
  return value === 'auto'
    || value === 'native'
    || value === 'husky'
    || value === 'lefthook'
    || value === 'pre-commit'
    || value === 'all';
}

function isHookName(value: string | undefined): value is HookName {
  return value === 'pre-commit' || value === 'pre-push';
}

function formatHookRunResult(result: HookRunResult): string {
  const lines = result.findings.length === 0
    ? [result.skipped ? 'Pre-CR hook skipped: no staged source files.' : 'Pre-CR hook passed.']
    : [
        result.ok ? 'Pre-CR hook completed with warnings.' : 'Pre-CR hook failed.',
        ...result.findings.map((finding) => {
          return `  - ${finding.path}:${finding.line} [${finding.rule}] ${finding.message}`;
        })
      ];
  return `${lines.join('\n')}\n`;
}

function formatHookStatus(status: Awaited<ReturnType<typeof getHookStatus>>): string {
  const lines = [
    `Pre-CR hook status for ${status.workspaceRoot}`,
    `.pre-cr.json: ${status.preCrConfigExists ? 'present' : 'missing'}`,
    ...status.managers.map((manager) => {
      return `  - ${manager.manager}: ${manager.installed ? 'installed' : 'not installed'} (${manager.path})`;
    }),
    ''
  ];
  return lines.join('\n');
}
