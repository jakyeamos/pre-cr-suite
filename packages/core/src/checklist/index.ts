/**
 * Checklist Module
 * 
 * Pre-submission checks for PRs:
 * - PR size analysis
 * - Security scanning
 * - Documentation coverage
 * - Test coverage delta
 * - Documentation health monitoring
 */

// Types
export * from './types';

// Analyzers
export { analyzePRSize, calculateFileComplexity } from './prSize';
export type { FileChange, ChangeHunk, SplitSuggestion } from './prSize';

export { scanSecurity, mightContainSecrets, DEFAULT_SECURITY_CONFIG } from './security';
export type { FileContent } from './security';

export { 
  analyzeDocCoverage, 
  parseExports, 
  checkDocHealth 
} from './docCoverage';
export type { SourceFile, ParsedExport, DocHealthIssue } from './docCoverage';

// Health Monitor
export {
  checkFileHealth,
  checkWorkspaceHealth,
  checkReadmeHealth,
  detectStaleDocumentation,
  DEFAULT_HEALTH_CONFIG
} from './healthMonitor';
export type {
  HealthIssue,
  HealthIssueType,
  HealthIssueSeverity,
  FileHealthReport,
  WorkspaceHealthReport,
  HealthMonitorConfig,
  ReadmeIssue,
  StaleDetectionResult
} from './healthMonitor';

// Runner
export { runChecklist, quickSecurityCheck, quickSizeCheck } from './runner';
export type { ChecklistInput } from './runner';
