import * as fs from 'fs';
import * as path from 'path';
import type { PreCrProjectConfig, RunPreCrCheckResult, RunWorkspacePreCrCheckOptions } from '@pre-cr/core';
import { buildReadinessEnvelope, loadProjectConfig, runWorkspacePreCrCheck } from '@pre-cr/core';

import { appendHookAuditEvents } from './audit';
import { stagedFiles, stagedPaths } from './git';
import { DEFAULT_HOOK_RULE_POLICY, evaluateHookRules, findingForRule, hasSourceFiles } from './rules';
import type { HookFinding, HookName, HookRunResult } from './types';

export interface HookRunDependencies {
  runCheck?: (workspaceRoot: string, options?: RunWorkspacePreCrCheckOptions) => Promise<RunPreCrCheckResult>;
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
      schemaVersion: 1,
      scope: 'staged',
      state: readinessState(!findings.some((finding) => finding.severity === 'block'), findings),
      gateDecision: readinessDecision(findings),
      ok: !findings.some((finding) => finding.severity === 'block'),
      skipped: true,
      findings,
      remediation: readinessRemediation(findings)
    };
  }

  const loadedConfig = loadProjectConfig(options.workspaceRoot);
  const policy = configExists ? loadedConfig.config.hook.rules : DEFAULT_HOOK_RULE_POLICY;
  const findings: HookFinding[] = [];
  let readiness: ReturnType<typeof buildReadinessEnvelope> | undefined;

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
    const result = await runCheck(options.workspaceRoot, {
      changeScope: 'staged',
      allowConfigExecution: true
    });
    const coveragePassed = result.result?.coverageCheck?.passed ?? false;
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
    const decision = findings.some((finding) => finding.severity === 'block')
      ? 'block'
      : findings.length > 0 || !ok
        ? 'warn'
        : 'pass';
    readiness = buildReadinessEnvelope(result, {
      scope: 'staged',
      ok: !findings.some((finding) => finding.severity === 'block') && ok,
      gateDecision: decision
    });
  }

  await appendHookAuditEvents(options.workspaceRoot, auditConfig(configExists ? loadedConfig.config : null), findings);
  const ok = !findings.some((finding) => finding.severity === 'block');
  return {
    schemaVersion: 1,
    scope: 'staged',
    state: readinessState(ok, findings),
    gateDecision: readinessDecision(findings),
    ok,
    findings,
    remediation: readinessRemediation(findings),
    readiness
  };
}

function readinessDecision(findings: HookFinding[]): 'pass' | 'warn' | 'block' {
  if (findings.some((finding) => finding.severity === 'block')) {
    return 'block';
  }
  return findings.length > 0 ? 'warn' : 'pass';
}

function readinessState(ok: boolean, findings: HookFinding[]): 'ready' | 'warning' | 'blocked' | 'setup-needed' {
  if (!ok) {
    return findings.some((finding) => finding.rule === 'pre-cr-required') ? 'setup-needed' : 'blocked';
  }
  return findings.length > 0 ? 'warning' : 'ready';
}

function readinessRemediation(findings: HookFinding[]): Array<{ code: string; message: string }> {
  return findings.map((finding) => ({
    code: finding.rule,
    message: finding.message
  }));
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
