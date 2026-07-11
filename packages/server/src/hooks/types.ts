import type {
  PreCrHookName,
  PreCrHookRuleSeverity,
  ReadinessGateDecision,
  ReadinessRemediation,
  ReadinessResultEnvelope,
  ReadinessScope,
  ReadinessState
} from '@pre-cr/core';

export type HookName = PreCrHookName;
export type HookSeverity = PreCrHookRuleSeverity;
export type HookManager = 'auto' | 'native' | 'husky' | 'lefthook' | 'pre-commit' | 'all';

export type HookRuleId =
  | 'conflict-marker'
  | 'secret-literal'
  | 'package-manager'
  | 'typescript-any'
  | 'oversized-source'
  | 'weak-test'
  | 'low-value-static-ui-test'
  | 'handler-before-send'
  | 'pre-cr-required'
  | 'pre-cr-unavailable'
  | 'pre-cr-failed';

export type HookRulePolicy = Record<string, HookSeverity>;

export interface HookFile {
  path: string;
  text: string;
}

export interface HookFinding {
  path: string;
  line: number;
  rule: HookRuleId;
  message: string;
  severity: Exclude<HookSeverity, 'off'>;
}

export interface HookAuditConfig {
  enabled: boolean;
  path: string;
}

export interface HookRunResult {
  schemaVersion: 1;
  scope: ReadinessScope;
  state: ReadinessState;
  gateDecision: ReadinessGateDecision;
  ok: boolean;
  skipped?: boolean;
  findings: HookFinding[];
  remediation: ReadinessRemediation[];
  readiness?: ReadinessResultEnvelope;
}
