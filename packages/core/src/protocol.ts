import type { CoverageCheckResult, ChangedFile } from './runner/coverageChecker';
import type { CoverageDecoration, CoverageSummary } from './types';

export type PreCrCoverageFormat = 'auto' | 'lcov' | 'istanbul';

export interface PreCrChecksConfig {
  coverage: boolean;
  security: boolean;
  checklist: boolean;
}

export interface PreCrProjectConfig {
  version: 1;
  testCommand?: string;
  coveragePaths: string[];
  coverageFormat: PreCrCoverageFormat;
  threshold: number;
  excludePatterns: string[];
  checks: PreCrChecksConfig;
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
  | 'no-changes';

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

export interface PreCrCheckResult {
  health: ProjectHealth;
  changedFiles: ChangedFile[];
  testRun: PreCrCheckExecution | null;
  coverageCheck: CoverageCheckResult | null;
  coveragePath: string | null;
}

export interface RunPreCrCheckResult {
  result: PreCrCheckResult | null;
  error?: string;
}

export interface PreCrBetaMethodMap {
  '$/preCr/getProjectHealth': {
    params: Record<string, never>;
    result: GetProjectHealthResult;
  };
  '$/preCr/runPreCrCheck': {
    params: Record<string, never>;
    result: RunPreCrCheckResult;
  };
  '$/preCr/refreshCoverage': {
    params: Record<string, never>;
    result: RefreshCoverageResult;
  };
  '$/preCr/getCoverageSummary': {
    params: Record<string, never>;
    result: GetCoverageSummaryResult;
  };
  '$/preCr/getCoverage': {
    params: GetCoverageParams;
    result: CoverageFileResult;
  };
  '$/preCr/getCoverageDecorations': {
    params: GetCoverageDecorationsParams;
    result: GetCoverageDecorationsResult;
  };
}

export type PreCrBetaMethod = keyof PreCrBetaMethodMap;
