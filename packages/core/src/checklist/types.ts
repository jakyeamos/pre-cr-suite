/**
 * PR Checklist Types
 * 
 * Types for the Smart PR Checklist feature that analyzes
 * code changes before submission.
 */

/**
 * Severity levels for checklist items
 */
export enum CheckSeverity {
  /** Informational - no action needed */
  Info = 'info',
  /** Warning - consider addressing */
  Warning = 'warning',
  /** Error - should fix before submitting */
  Error = 'error'
}

/**
 * Status of a checklist item
 */
export enum CheckStatus {
  /** Check passed */
  Pass = 'pass',
  /** Check failed */
  Fail = 'fail',
  /** Check produced a warning */
  Warn = 'warn',
  /** Check was skipped (not applicable) */
  Skip = 'skip'
}

/**
 * A single checklist item result
 */
export interface ChecklistItem {
  /** Unique identifier for this check */
  id: string;
  /** Human-readable name */
  name: string;
  /** Current status */
  status: CheckStatus;
  /** Severity if status is Fail or Warn */
  severity: CheckSeverity;
  /** Short description of the result */
  message: string;
  /** Detailed explanation or suggestions */
  details?: string;
  /** Affected files/lines */
  locations?: CheckLocation[];
  /** Quick fix available? */
  fixable?: boolean;
}

/**
 * Location reference for a check finding
 */
export interface CheckLocation {
  /** File path (relative to workspace) */
  file: string;
  /** Line number (1-based) */
  line?: number;
  /** End line for ranges */
  endLine?: number;
  /** Column (1-based) */
  column?: number;
  /** Snippet of code */
  snippet?: string;
}

// ============================================================================
// PR Size Check
// ============================================================================

export interface PRSizeConfig {
  /** Lines changed threshold for warning */
  warnThreshold: number;
  /** Lines changed threshold for error */
  errorThreshold: number;
  /** Files changed threshold for warning */
  fileWarnThreshold: number;
}

export const DEFAULT_PR_SIZE_CONFIG: PRSizeConfig = {
  warnThreshold: 200,
  errorThreshold: 500,
  fileWarnThreshold: 10
};

export interface PRSizeResult {
  linesAdded: number;
  linesRemoved: number;
  linesChanged: number;
  filesChanged: number;
  recommendation: 'good' | 'consider-splitting' | 'too-large';
  suggestedSplitPoints?: string[];
}

// ============================================================================
// Security Check
// ============================================================================

export interface SecurityConfig {
  /** Patterns to detect hardcoded secrets */
  secretPatterns: RegExp[];
  /** Patterns for SQL injection risks */
  sqlInjectionPatterns: RegExp[];
  /** Patterns for other security issues */
  additionalPatterns: SecurityPattern[];
  /** File patterns to exclude from scanning */
  excludePatterns: string[];
}

export interface SecurityPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: CheckSeverity;
  message: string;
}

export interface SecurityFinding {
  type: 'secret' | 'sql-injection' | 'xss' | 'path-traversal' | 'other';
  pattern: string;
  severity: CheckSeverity;
  file: string;
  line: number;
  snippet: string;
  message: string;
}

export interface SecurityResult {
  findings: SecurityFinding[];
  scannedFiles: number;
  skippedFiles: number;
}

// ============================================================================
// Documentation Check
// ============================================================================

export interface DocCoverageConfig {
  /** Require docs for exported functions */
  requireExportedFunctions: boolean;
  /** Require docs for exported classes */
  requireExportedClasses: boolean;
  /** Require docs for exported interfaces */
  requireExportedInterfaces: boolean;
  /** Require docs for exported types */
  requireExportedTypes: boolean;
  /** Minimum doc coverage percentage */
  minCoverage: number;
}

export const DEFAULT_DOC_COVERAGE_CONFIG: DocCoverageConfig = {
  requireExportedFunctions: true,
  requireExportedClasses: true,
  requireExportedInterfaces: true,
  requireExportedTypes: false,
  minCoverage: 80
};

export interface UndocumentedExport {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'const';
  file: string;
  line: number;
  isNew: boolean;
}

export interface DocCoverageResult {
  totalExports: number;
  documentedExports: number;
  coveragePercent: number;
  undocumented: UndocumentedExport[];
  newUndocumented: UndocumentedExport[];
}

// ============================================================================
// Test Coverage Delta Check
// ============================================================================

export interface TestCoverageDeltaConfig {
  /** Minimum coverage for new code */
  minNewCodeCoverage: number;
  /** Warn if coverage drops by this percentage */
  coverageDropThreshold: number;
}

export const DEFAULT_TEST_COVERAGE_DELTA_CONFIG: TestCoverageDeltaConfig = {
  minNewCodeCoverage: 80,
  coverageDropThreshold: 5
};

export interface UncoveredChange {
  file: string;
  line: number;
  snippet: string;
}

export interface TestCoverageDeltaResult {
  baseCoverage: number;
  headCoverage: number;
  deltaCoverage: number;
  newLinesTotal: number;
  newLinesCovered: number;
  newCodeCoverage: number;
  uncoveredChanges: UncoveredChange[];
}

// ============================================================================
// Breaking Changes Check
// ============================================================================

export interface BreakingChangeConfig {
  /** Check for removed exports */
  checkRemovedExports: boolean;
  /** Check for changed function signatures */
  checkSignatureChanges: boolean;
  /** Check for changed types */
  checkTypeChanges: boolean;
}

export const DEFAULT_BREAKING_CHANGE_CONFIG: BreakingChangeConfig = {
  checkRemovedExports: true,
  checkSignatureChanges: true,
  checkTypeChanges: true
};

export type BreakingChangeKind = 
  | 'removed-export'
  | 'changed-signature'
  | 'changed-return-type'
  | 'removed-parameter'
  | 'added-required-parameter'
  | 'changed-type';

export interface BreakingChange {
  kind: BreakingChangeKind;
  name: string;
  file: string;
  line: number;
  before: string;
  after: string;
  message: string;
}

export interface BreakingChangesResult {
  hasBreakingChanges: boolean;
  changes: BreakingChange[];
}

// ============================================================================
// Full Checklist Result
// ============================================================================

export interface ChecklistConfig {
  prSize: PRSizeConfig;
  security: Partial<SecurityConfig>;
  docCoverage: DocCoverageConfig;
  testCoverageDelta: TestCoverageDeltaConfig;
  breakingChanges: BreakingChangeConfig;
}

export const DEFAULT_CHECKLIST_CONFIG: ChecklistConfig = {
  prSize: DEFAULT_PR_SIZE_CONFIG,
  security: {},
  docCoverage: DEFAULT_DOC_COVERAGE_CONFIG,
  testCoverageDelta: DEFAULT_TEST_COVERAGE_DELTA_CONFIG,
  breakingChanges: DEFAULT_BREAKING_CHANGE_CONFIG
};

export interface ChecklistResult {
  /** Overall status */
  status: 'pass' | 'warn' | 'fail';
  /** Summary message */
  summary: string;
  /** Individual check results */
  items: ChecklistItem[];
  /** Detailed results by category */
  details: {
    prSize?: PRSizeResult;
    security?: SecurityResult;
    docCoverage?: DocCoverageResult;
    testCoverageDelta?: TestCoverageDeltaResult;
    breakingChanges?: BreakingChangesResult;
  };
  /** Suggested reviewers */
  suggestedReviewers?: string[];
  /** Timestamp */
  timestamp: Date;
}
