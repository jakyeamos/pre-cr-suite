/**
 * Core type definitions for Pre-CR Suite
 * 
 * These types are shared across all packages (core, server, clients).
 * NO editor-specific imports allowed here.
 */

/**
 * Line coverage status
 */
export enum LineCoverageStatus {
  /** Line was executed at least once */
  Covered = 'covered',
  /** Line was never executed */
  Uncovered = 'uncovered',
  /** Line has branches, some taken, some not */
  Partial = 'partial',
  /** Line is not executable (comments, blank lines, declarations) */
  NotExecutable = 'not-executable'
}

/**
 * Branch coverage information
 */
export interface BranchCoverage {
  /** Unique branch ID within the file */
  branchId: number;
  /** Number of times this branch was taken */
  taken: number;
  /** Branch type (if, else, ternary, switch case) */
  type?: 'if' | 'else' | 'ternary' | 'switch' | 'default';
}

/**
 * Coverage information for a single line
 */
export interface LineCoverage {
  /** 1-based line number */
  lineNumber: number;
  /** Coverage status */
  status: LineCoverageStatus;
  /** Number of times line was executed */
  executionCount: number;
  /** Branch coverage details (if line has branches) */
  branches?: BranchCoverage[];
}

/**
 * Function coverage information
 */
export interface FunctionCoverage {
  /** Function name */
  name: string;
  /** 1-based line number where function starts */
  lineNumber: number;
  /** Number of times function was called */
  executionCount: number;
}

/**
 * Coverage summary statistics
 */
export interface CoverageSummary {
  /** Total lines in scope */
  totalLines: number;
  /** Lines executed at least once */
  coveredLines: number;
  /** Line coverage percentage (0-100) */
  linePercentage: number;
  
  /** Total branches */
  totalBranches: number;
  /** Branches taken at least once */
  coveredBranches: number;
  /** Branch coverage percentage (0-100) */
  branchPercentage: number;
  
  /** Total functions */
  totalFunctions: number;
  /** Functions called at least once */
  coveredFunctions: number;
  /** Function coverage percentage (0-100) */
  functionPercentage: number;
}

/**
 * Coverage data for a single file
 */
export interface FileCoverage {
  /** Absolute file path */
  filePath: string;
  /** Line coverage data (keyed by 1-based line number) */
  lines: Map<number, LineCoverage>;
  /** Function coverage data */
  functions: FunctionCoverage[];
  /** Summary statistics for this file */
  summary: CoverageSummary;
}

/**
 * Coverage data for entire workspace
 */
export interface WorkspaceCoverage {
  /** File coverage data (keyed by absolute file path) */
  files: Map<string, FileCoverage>;
  /** Overall summary across all files */
  summary: CoverageSummary;
  /** When coverage was loaded */
  loadedAt: Date;
  /** Coverage format that was parsed */
  format: 'lcov' | 'istanbul';
}

/**
 * Parse error information
 */
export interface ParseError {
  /** Error message */
  message: string;
  /** Line number in coverage file where error occurred */
  line?: number;
  /** Is this a fatal error? */
  fatal: boolean;
}

/**
 * Result of parsing a coverage file
 */
export interface ParseResult<T> {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed data (if successful) */
  data?: T;
  /** Errors encountered during parsing */
  errors: ParseError[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * LSP-compatible range (0-based line and character)
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * LSP-compatible position (0-based)
 */
export interface Position {
  /** 0-based line number */
  line: number;
  /** 0-based character offset */
  character: number;
}

/**
 * Coverage decoration for a line (used in LSP communication)
 */
export interface CoverageDecoration {
  /** Range to decorate (0-based) */
  range: Range;
  /** Coverage status */
  status: 'covered' | 'uncovered' | 'partial';
  /** Execution count */
  executionCount: number;
  /** Branch details (if applicable) */
  branches?: BranchCoverage[];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create an empty coverage summary
 */
export function createEmptySummary(): CoverageSummary {
  return {
    totalLines: 0,
    coveredLines: 0,
    linePercentage: 0,
    totalBranches: 0,
    coveredBranches: 0,
    branchPercentage: 0,
    totalFunctions: 0,
    coveredFunctions: 0,
    functionPercentage: 0
  };
}

/**
 * Calculate percentage safely (handles division by zero)
 */
export function calculatePercentage(covered: number, total: number): number {
  if (total === 0) {
    return 100; // No items = 100% coverage (nothing to cover)
  }
  return Math.round((covered / total) * 100);
}

/**
 * Merge two coverage summaries
 */
export function mergeSummaries(a: CoverageSummary, b: CoverageSummary): CoverageSummary {
  const totalLines = a.totalLines + b.totalLines;
  const coveredLines = a.coveredLines + b.coveredLines;
  const totalBranches = a.totalBranches + b.totalBranches;
  const coveredBranches = a.coveredBranches + b.coveredBranches;
  const totalFunctions = a.totalFunctions + b.totalFunctions;
  const coveredFunctions = a.coveredFunctions + b.coveredFunctions;

  return {
    totalLines,
    coveredLines,
    linePercentage: calculatePercentage(coveredLines, totalLines),
    totalBranches,
    coveredBranches,
    branchPercentage: calculatePercentage(coveredBranches, totalBranches),
    totalFunctions,
    coveredFunctions,
    functionPercentage: calculatePercentage(coveredFunctions, totalFunctions)
  };
}

/**
 * Convert 1-based line coverage to 0-based LSP decoration
 */
export function lineCoverageToDecoration(
  lineCoverage: LineCoverage,
  lineLength: number
): CoverageDecoration {
  const lineIndex = lineCoverage.lineNumber - 1; // Convert to 0-based
  
  let status: 'covered' | 'uncovered' | 'partial';
  switch (lineCoverage.status) {
    case LineCoverageStatus.Covered:
      status = 'covered';
      break;
    case LineCoverageStatus.Uncovered:
      status = 'uncovered';
      break;
    case LineCoverageStatus.Partial:
      status = 'partial';
      break;
    default:
      status = 'covered'; // Default for not-executable
  }

  return {
    range: {
      start: { line: lineIndex, character: 0 },
      end: { line: lineIndex, character: lineLength }
    },
    status,
    executionCount: lineCoverage.executionCount,
    branches: lineCoverage.branches
  };
}
