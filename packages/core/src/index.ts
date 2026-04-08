/**
 * @pre-cr/core
 * 
 * Core parsing and validation logic for Pre-CR Suite.
 * No editor dependencies - pure TypeScript.
 */

// Types
export * from './types';
export * from './protocol';

// Parsers
export { parseLcovFile, parseLcovContent } from './parsers/lcov';
export { parseIstanbulFile, parseIstanbulContent } from './parsers/istanbul';

// Beta workflow
export * from './beta';

// Validation
export {
  validateCoverageFile,
  validateSourcePath,
  sanitizeForDisplay,
  formatBytes,
  LIMITS
} from './validation';
export type { ValidationResult } from './validation';

// Logger
export {
  getLogger,
  setLogger,
  ConsoleLogger,
  NullLogger
} from './logger';
export type { Logger } from './logger';

// Checklist (Phase 2)
export * from './checklist';

// Documentation Generator (Phase 2)
export * from './docgen';

// Review Optimization (Phase 3)
export * from './review';

// Context Preservation (Phase 4)
export * from './context';

// Debug Intelligence (Phase 5)
export * from './debug';

// Test Runner & Coverage Checker
export * from './runner';
