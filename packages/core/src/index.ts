/**
 * @pre-cr/core
 *
 * Core parsing and validation logic for Pre-CR Suite.
 * No editor dependencies - pure TypeScript.
 */

// Types
export * from './types';
export * from './protocol';
export * from './contracts';
export * from './engine';

// Parsers
export { parseLcovFile, parseLcovContent } from './parsers/lcov';
export { parseIstanbulFile, parseIstanbulContent } from './parsers/istanbul';

// Beta workflow
export * from './beta';

// Validation
export {
  validateCoverageFile,
  validateSourcePath,
  resolveWorkspacePath,
  sanitizeForDisplay,
  formatBytes,
  LIMITS
} from './validation';
export type {
  ResolveWorkspacePathOptions,
  ValidationResult,
  WorkspacePathAccess,
  WorkspacePathErrorCode,
  WorkspacePathResult
} from './validation';

// Logger
export {
  getLogger,
  setLogger,
  ConsoleLogger,
  NullLogger
} from './logger';
export type { Logger } from './logger';

// Stable changed-line coverage and bounded process primitives.
export {
  checkChangesCoverage,
  formatCoverageReport,
  formatUnsupportedSurfaceSetupGuidance,
  getShortSummary
} from './runner/coverageChecker';
export type {
  ChangedFile,
  ChangedLine,
  CoverageCheckOptions,
  CoverageCheckResult,
  FileBreakdown,
  UncoveredDetail
} from './runner/coverageChecker';
export {
  DEFAULT_MAX_PROCESS_OUTPUT_BYTES,
  DEFAULT_PROCESS_TIMEOUT_MS,
  runProcess
} from './runner/processRunner';
export type {
  ProcessOutput,
  ProcessRunResult,
  RunProcessOptions
} from './runner/processRunner';
