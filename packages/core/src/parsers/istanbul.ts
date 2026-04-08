/**
 * Istanbul JSON Parser
 * 
 * Parses coverage-final.json format from Istanbul/nyc.
 * 
 * Istanbul JSON Format:
 * {
 *   "/path/to/file.ts": {
 *     "path": "/path/to/file.ts",
 *     "statementMap": { "0": { start: {line, column}, end: {line, column} }, ... },
 *     "fnMap": { "0": { name, decl: {...}, loc: {...} }, ... },
 *     "branchMap": { "0": { type, loc, locations: [...] }, ... },
 *     "s": { "0": count, ... },        // Statement execution counts
 *     "f": { "0": count, ... },        // Function execution counts
 *     "b": { "0": [count, count], ... } // Branch execution counts
 *   }
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ParseResult,
  WorkspaceCoverage,
  FileCoverage,
  LineCoverage,
  LineCoverageStatus,
  FunctionCoverage,
  BranchCoverage,
  createEmptySummary,
  calculatePercentage,
  mergeSummaries
} from '../types';
import { getLogger } from '../logger';

/**
 * Istanbul location object
 */
interface IstanbulLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Istanbul statement map entry
 */
interface IstanbulStatement {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Istanbul function map entry
 */
interface IstanbulFunction {
  name: string;
  decl: IstanbulLocation;
  loc: IstanbulLocation;
}

/**
 * Istanbul branch map entry
 */
interface IstanbulBranch {
  type: string;  // 'if', 'cond-expr', 'switch', 'binary-expr'
  loc: IstanbulLocation;
  locations: IstanbulLocation[];
}

/**
 * Istanbul file coverage entry
 */
interface IstanbulFileCoverage {
  path: string;
  statementMap: Record<string, IstanbulStatement>;
  fnMap: Record<string, IstanbulFunction>;
  branchMap: Record<string, IstanbulBranch>;
  s: Record<string, number>;  // Statement counts
  f: Record<string, number>;  // Function counts
  b: Record<string, number[]>; // Branch counts
}

/**
 * Istanbul coverage JSON structure
 */
type IstanbulCoverage = Record<string, IstanbulFileCoverage>;

/**
 * Parse an Istanbul JSON file from disk
 */
export function parseIstanbulFile(
  filePath: string,
  workspaceRoot?: string
): ParseResult<WorkspaceCoverage> {
  const logger = getLogger();
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseIstanbulContent(content, workspaceRoot);
  } catch (err) {
    logger.error('Failed to read Istanbul JSON file', err, { path: filePath });
    return {
      success: false,
      errors: [{
        message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        fatal: true
      }],
      warnings: []
    };
  }
}

/**
 * Parse Istanbul JSON content string
 */
export function parseIstanbulContent(
  content: string,
  workspaceRoot?: string
): ParseResult<WorkspaceCoverage> {
  const logger = getLogger();
  const warnings: string[] = [];

  let data: IstanbulCoverage;
  try {
    data = JSON.parse(content) as IstanbulCoverage;
  } catch (err) {
    return {
      success: false,
      errors: [{
        message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        fatal: true
      }],
      warnings: []
    };
  }

  const files = new Map<string, FileCoverage>();

  for (const [filePath, fileCov] of Object.entries(data)) {
    // Normalize and resolve path
    let normalizedPath = fileCov.path || filePath;
    if (workspaceRoot && !path.isAbsolute(normalizedPath)) {
      normalizedPath = path.resolve(workspaceRoot, normalizedPath);
    }
    normalizedPath = path.normalize(normalizedPath);

    // Parse line coverage from statements
    const lines = new Map<number, LineCoverage>();
    const lineExecCounts = new Map<number, number>();
    
    for (const [stmtId, stmt] of Object.entries(fileCov.statementMap)) {
      const lineNumber = stmt.start.line;
      const count = fileCov.s[stmtId] ?? 0;
      
      // Track max execution count per line (multiple statements can be on same line)
      const existing = lineExecCounts.get(lineNumber) ?? 0;
      lineExecCounts.set(lineNumber, Math.max(existing, count));
    }

    // Create line coverage entries
    for (const [lineNumber, executionCount] of lineExecCounts) {
      lines.set(lineNumber, {
        lineNumber,
        status: executionCount > 0 ? LineCoverageStatus.Covered : LineCoverageStatus.Uncovered,
        executionCount
      });
    }

    // Parse function coverage
    const functions: FunctionCoverage[] = [];
    for (const [fnId, fn] of Object.entries(fileCov.fnMap)) {
      const count = fileCov.f[fnId] ?? 0;
      functions.push({
        name: fn.name || `<anonymous@${fn.loc.start.line}>`,
        lineNumber: fn.loc.start.line,
        executionCount: count
      });
    }

    // Parse branch coverage
    const branchesByLine = new Map<number, BranchCoverage[]>();
    let branchIdCounter = 0;
    
    for (const [branchId, branch] of Object.entries(fileCov.branchMap)) {
      const counts = fileCov.b[branchId] ?? [];
      const lineNumber = branch.loc.start.line;
      
      if (!branchesByLine.has(lineNumber)) {
        branchesByLine.set(lineNumber, []);
      }
      
      const lineBranches = branchesByLine.get(lineNumber)!;
      
      // Map Istanbul branch types to our types
      const branchType = mapBranchType(branch.type);
      
      for (let i = 0; i < counts.length; i++) {
        lineBranches.push({
          branchId: branchIdCounter++,
          taken: counts[i],
          type: branchType
        });
      }
    }

    // Apply branch data to lines
    for (const [lineNumber, branches] of branchesByLine) {
      const lineCov = lines.get(lineNumber);
      if (lineCov) {
        lineCov.branches = branches;
        
        // Update status based on branch coverage
        const allTaken = branches.every(b => b.taken > 0);
        const someTaken = branches.some(b => b.taken > 0);
        
        if (!allTaken && someTaken) {
          lineCov.status = LineCoverageStatus.Partial;
        } else if (!someTaken && lineCov.executionCount > 0) {
          lineCov.status = LineCoverageStatus.Partial;
        }
      }
    }

    // Calculate summary
    const summary = calculateFileSummary(lines, functions, branchesByLine);

    files.set(normalizedPath, {
      filePath: normalizedPath,
      lines,
      functions,
      summary
    });
  }

  // Calculate overall summary
  let overallSummary = createEmptySummary();
  for (const file of files.values()) {
    overallSummary = mergeSummaries(overallSummary, file.summary);
  }

  logger.info('Istanbul parsing complete', {
    files: files.size,
    linePercentage: overallSummary.linePercentage
  });

  return {
    success: true,
    data: {
      files,
      summary: overallSummary,
      loadedAt: new Date(),
      format: 'istanbul'
    },
    errors: [],
    warnings
  };
}

/**
 * Map Istanbul branch types to our branch types
 */
function mapBranchType(istanbulType: string): BranchCoverage['type'] {
  switch (istanbulType) {
    case 'if':
      return 'if';
    case 'cond-expr':
      return 'ternary';
    case 'switch':
      return 'switch';
    case 'binary-expr':
      return 'if'; // Binary expressions are similar to if conditions
    default:
      return undefined;
  }
}

/**
 * Calculate summary for a single file
 */
function calculateFileSummary(
  lines: Map<number, LineCoverage>,
  functions: FunctionCoverage[],
  branches: Map<number, BranchCoverage[]>
): FileCoverage['summary'] {
  let totalLines = 0;
  let coveredLines = 0;

  for (const line of lines.values()) {
    if (line.status !== LineCoverageStatus.NotExecutable) {
      totalLines++;
      if (line.status === LineCoverageStatus.Covered || 
          line.status === LineCoverageStatus.Partial) {
        coveredLines++;
      }
    }
  }

  const totalFunctions = functions.length;
  const coveredFunctions = functions.filter(f => f.executionCount > 0).length;

  let totalBranches = 0;
  let coveredBranches = 0;
  for (const branchList of branches.values()) {
    totalBranches += branchList.length;
    coveredBranches += branchList.filter(b => b.taken > 0).length;
  }

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
