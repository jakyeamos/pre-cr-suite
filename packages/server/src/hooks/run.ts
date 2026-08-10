import * as fs from 'fs';
import * as path from 'path';
import type { PreCrProjectConfig, RunPreCrCheckResult } from '@pre-cr/core';
import { loadProjectConfig, runWorkspacePreCrCheck } from '@pre-cr/core';

import { appendHookAuditEvents } from './audit';
import { stagedFiles, stagedPaths } from './git';
import { DEFAULT_HOOK_RULE_POLICY, evaluateHookRules, findingForRule, hasSourceFiles } from './rules';
import type { HookFinding, HookName, HookRunResult } from './types';

export interface HookRunDependencies {
  runCheck?: (workspaceRoot: string, options?: { changeScope?: 'worktree' | 'staged' }) => Promise<RunPreCrCheckResult>;
  collectStagedPaths?: (workspaceRoot: string) => Promise<string[]>;
}

export interface HookRunOptions {
  workspaceRoot: string;
  hook: HookName;
  json: boolean;
}

export async function runHook(options: HookRunOptions, dependencies: HookRunDependencies = {}): Promise<HookRunResult> {
  const collectPaths = dependencies.collectStagedPaths ?? stagedPaths;
  const paths = await collectPaths(options.workspaceRoot);
  const sourceChanged = hasSourceFiles(paths);
  const configPath = path.join(options.workspaceRoot, '.pre-cr.json');
  const configExists = fs.existsSync(configPath);

  if (!sourceChanged) {
    const files = await stagedFiles(options.workspaceRoot, paths);
    const policy = configExists ? loadProjectConfig(options.workspaceRoot).config.hook.rules : DEFAULT_HOOK_RULE_POLICY;
    const findings = evaluateHookRules(files, policy);
    await appendHookAuditEvents(options.workspaceRoot, auditConfig(configExists ? loadProjectConfig(options.workspaceRoot).config : null), findings);
    return {
      ok: !findings.some((finding) => finding.severity === 'block'),
      skipped: true,
      findings
    };
  }

  const loadedConfig = loadProjectConfig(options.workspaceRoot);
  const policy = configExists ? loadedConfig.config.hook.rules : DEFAULT_HOOK_RULE_POLICY;
  const findings: HookFinding[] = [];

  if (!configExists) {
    const finding = findingForRule(
      policy,
      '.pre-cr.json',
      1,
      'pre-cr-required',
      'every project must define .pre-cr.json before source commits'
    );
    if (finding) {
      findings.push(finding);
    }
  }

  const files = await stagedFiles(options.workspaceRoot, paths);
  findings.push(...evaluateHookRules(files, policy));

  if (!findings.some((finding) => finding.severity === 'block') && configExists) {
    const runCheck = dependencies.runCheck ?? runWorkspacePreCrCheck;
    const result = await runCheck(options.workspaceRoot, { changeScope: 'staged' });
    const coverageRequired = result.result?.health.config.checks.coverage ?? true;
    const coveragePassed = !coverageRequired || (result.result?.coverageCheck?.passed ?? false);
    const qualityAdaptersPassed = result.result?.qualityAdaptersPassed ?? true;
    const ok = Boolean(result.result && !result.error && coveragePassed && qualityAdaptersPassed);
    if (!ok) {
      const finding = findingForRule(
        policy,
        '.pre-cr.json',
        1,
        'pre-cr-failed',
        preCrFailureSummary(result)
      );
      if (finding) {
        findings.push(finding);
      }
    }
  }

  await appendHookAuditEvents(options.workspaceRoot, auditConfig(configExists ? loadedConfig.config : null), findings);
  return {
    ok: !findings.some((finding) => finding.severity === 'block'),
    findings
  };
}

function auditConfig(config: PreCrProjectConfig | null): PreCrProjectConfig['hook']['audit'] {
  return config?.hook.audit ?? {
    enabled: false,
    path: '.pre-cr/audit.jsonl'
  };
}

function preCrFailureSummary(result: RunPreCrCheckResult): string {
  if (result.error) {
    return result.error;
  }
  const failedAdapters = (result.result?.qualityAdapters ?? []).filter((adapter) => !adapter.success && adapter.required);
  if (failedAdapters.length > 0) {
    return `Pre-CR quality adapter failed: ${failedAdapters.map((adapter) => adapter.name).join(', ')}`;
  }
  const coverage = result.result?.coverageCheck;
  if (coverage) {
    return `Pre-CR changed-line coverage failed: ${coverage.coveragePercent}% below ${coverage.threshold}% or unsupported surfaces were present`;
  }
  return 'Pre-CR changed-line readiness failed';
}
