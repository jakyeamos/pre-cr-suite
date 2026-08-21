import type { CoverageCheckResult, ChangedFile } from './runner/coverageChecker';
import type { CoverageDecoration, CoverageSummary } from './types';
import { PRE_CR_METHODS } from './contracts/methods';
import type { ReadinessResultEnvelope, ReadinessScope } from './contracts/readiness';

export type PreCrCoverageFormat = 'auto' | 'lcov' | 'istanbul';

export interface PreCrCoverageAdapterConfig {
  name: string;
  command: string;
  coveragePath: string;
  coverageFormat: Exclude<PreCrCoverageFormat, 'auto'>;
}

export interface PreCrQualityAdapterConfig {
  name: string;
  command: string;
  required: boolean;
}

export interface PreCrSurfaceConfig {
  covered: string[];
  ignored: string[];
  unsupported: string[];
}

export interface PreCrChecksConfig {
  coverage: boolean;
  security: boolean;
  checklist: boolean;
}

export type PreCrHookName = 'pre-commit' | 'pre-push';
export type PreCrHookRuleSeverity = 'block' | 'warn' | 'off';

export interface PreCrHookConfig {
  defaultHook: PreCrHookName;
  rules: Record<string, PreCrHookRuleSeverity>;
  audit: {
    enabled: boolean;
    path: string;
  };
}

export interface PreCrProjectConfig {
  version: 1;
  testCommand?: string;
  coveragePaths: string[];
  coverageFormat: PreCrCoverageFormat;
  coverageAdapters: PreCrCoverageAdapterConfig[];
  qualityAdapters: PreCrQualityAdapterConfig[];
  surfaces: PreCrSurfaceConfig;
  threshold: number;
  excludePatterns: string[];
  checks: PreCrChecksConfig;
  hook: PreCrHookConfig;
}

export interface LoadedPreCrProjectConfig {
  config: PreCrProjectConfig;
  path: string | null;
  isLegacyConfig: boolean;
  warnings: string[];
}

export type ProjectHealthIssueCode =
  | 'missing-config'
  | 'invalid-config'
  | 'missing-git'
  | 'missing-test-command'
  | 'missing-coverage'
  | 'no-changes'
  | 'untrusted-workspace';

export interface ProjectHealthIssue {
  code: ProjectHealthIssueCode;
  severity: 'error' | 'warning';
  message: string;
  hint?: string;
  suggestedCommand?: string;
}

export interface ProjectHealth {
  workspaceRoot: string;
  configPath: string | null;
  isLegacyConfig: boolean;
  config: PreCrProjectConfig;
  framework: {
    name: string | null;
    command: string | null;
    source: 'config' | 'auto' | 'none';
    configFile: string | null;
  };
  coverage: {
    loaded: boolean;
    path: string | null;
    format: Exclude<PreCrCoverageFormat, 'auto'> | null;
    summary: CoverageSummary | null;
  };
  issues: ProjectHealthIssue[];
  warnings: string[];
  ready: boolean;
}

export interface CoverageFileData {
  path: string;
  lines: Record<number, number>;
  summary: CoverageSummary;
}

export interface CoverageFileResult {
  coverage: CoverageFileData | null;
}

export interface GetProjectHealthResult {
  health: ProjectHealth;
}

export interface RefreshCoverageResult {
  success: boolean;
  coveragePath: string | null;
  summary: CoverageSummary | null;
  error?: string;
}

export interface GetCoverageSummaryResult {
  summary: CoverageSummary | null;
  coveragePath: string | null;
}

export interface GetCoverageParams {
  uri: string;
}

export interface GetCoverageDecorationsParams {
  textDocument: {
    uri: string;
  };
}

export interface GetCoverageDecorationsResult {
  decorations: CoverageDecoration[];
}

export interface PreCrCheckExecution {
  framework: string | null;
  command: string | null;
  success: boolean;
  exitCode: number;
  duration: number;
  coveragePath: string | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface PreCrQualityAdapterResult {
  name: string;
  command: string;
  required: boolean;
  success: boolean;
  skipped: boolean;
  exitCode: number | null;
  duration: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface PreCrCheckResult {
  health: ProjectHealth;
  changedFiles: ChangedFile[];
  testRun: PreCrCheckExecution | null;
  coverageCheck: CoverageCheckResult | null;
  qualityAdapters: PreCrQualityAdapterResult[];
  qualityAdaptersPassed: boolean;
  coveragePath: string | null;
}

export interface RunPreCrCheckResult {
  result: PreCrCheckResult | null;
  error?: string;
  readiness?: ReadinessResultEnvelope;
}

export interface WorkspaceRequestParams {
  workspaceUri?: string;
}

export interface RunPreCrCheckParams extends WorkspaceRequestParams {
  scope?: ReadinessScope;
}

export interface PreCrBetaMethodMap {
  [PRE_CR_METHODS.getProjectHealth]: {
    params: WorkspaceRequestParams;
    result: GetProjectHealthResult;
  };
  [PRE_CR_METHODS.runPreCrCheck]: {
    params: RunPreCrCheckParams;
    result: RunPreCrCheckResult;
  };
  [PRE_CR_METHODS.refreshCoverage]: {
    params: WorkspaceRequestParams;
    result: RefreshCoverageResult;
  };
  [PRE_CR_METHODS.getCoverageSummary]: {
    params: WorkspaceRequestParams;
    result: GetCoverageSummaryResult;
  };
  [PRE_CR_METHODS.getCoverage]: {
    params: GetCoverageParams;
    result: CoverageFileResult;
  };
  [PRE_CR_METHODS.getCoverageDecorations]: {
    params: GetCoverageDecorationsParams;
    result: GetCoverageDecorationsResult;
  };
}

export type PreCrBetaMethod = keyof PreCrBetaMethodMap;
