import type { PreCrCheckResult, RunPreCrCheckResult } from '../protocol';

export type ReadinessState = 'ready' | 'warning' | 'blocked' | 'setup-needed';
export type ReadinessGateDecision = 'pass' | 'warn' | 'block';
export type ReadinessScope = 'staged' | 'worktree';

export interface ReadinessRemediation {
  code: string;
  message: string;
  hint?: string;
}

export interface ReadinessResultEnvelope {
  schemaVersion: 1;
  state: ReadinessState;
  gateDecision: ReadinessGateDecision;
  scope: ReadinessScope;
  ok: boolean;
  result: PreCrCheckResult | null;
  error?: string;
  remediation: ReadinessRemediation[];
}

export function buildReadinessState(
  run: RunPreCrCheckResult,
  ok: boolean,
  gateDecision: ReadinessGateDecision
): ReadinessState {
  if (!run.result || !run.result.health.ready) {
    return 'setup-needed';
  }
  if (ok) {
    return gateDecision === 'warn' ? 'warning' : 'ready';
  }
  return gateDecision === 'warn' ? 'warning' : 'blocked';
}

export function buildReadinessRemediation(run: RunPreCrCheckResult): ReadinessRemediation[] {
  const remediations: ReadinessRemediation[] = [];
  for (const issue of run.result?.health.issues ?? []) {
    remediations.push({
      code: issue.code,
      message: issue.message,
      hint: issue.hint
    });
  }

  for (const file of run.result?.coverageCheck?.unsupportedFiles ?? []) {
    remediations.push({
      code: 'unsupported-surface',
      message: `${file} is outside the configured coverage surface.`,
      hint: 'Add a coverage adapter or classify the file in .pre-cr.json.'
    });
  }

  return remediations;
}

export function buildReadinessEnvelope(
  run: RunPreCrCheckResult,
  options: {
    scope: ReadinessScope;
    ok: boolean;
    gateDecision: ReadinessGateDecision;
  }
): ReadinessResultEnvelope {
  return {
    schemaVersion: 1,
    state: buildReadinessState(run, options.ok, options.gateDecision),
    gateDecision: options.gateDecision,
    scope: options.scope,
    ok: options.ok,
    result: run.result ?? null,
    ...(run.error ? { error: run.error } : {}),
    remediation: buildReadinessRemediation(run)
  };
}
