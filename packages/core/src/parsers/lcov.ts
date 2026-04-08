/**
 * LCOV Parser
 * 
 * Parses lcov.info format coverage files.
 * 
 * LCOV Format Reference:
 * - TN:<test name>           - Test name (optional)
 * - SF:<source file>         - Source file path
 * - FN:<line>,<name>         - Function definition
 * - FNDA:<count>,<name>      - Function execution count
 * - FNF:<count>              - Functions found
 * - FNH:<count>              - Functions hit
 * - DA:<line>,<count>        - Line execution count
 * - LF:<count>               - Lines found
 * - LH:<count>               - Lines hit
 * - BRDA:<line>,<block>,<branch>,<count> - Branch data
 * - BRF:<count>              - Branches found
 * - BRH:<count>              - Branches hit
 * - end_of_record            - End of file record
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
  ParseError,
  createEmptySummary,
  calculatePercentage,
  mergeSummaries
} from '../types';
import { getLogger } from '../logger';

/**
 * Parse an LCOV file from disk
 */
export function parseLcovFile(
  filePath: string,
  workspaceRoot?: string
): ParseResult<WorkspaceCoverage> {
  const logger = getLogger();
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseLcovContent(content, workspaceRoot);
  } catch (err) {
    logger.error('Failed to read LCOV file', err, { path: filePath });
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
 * Parse LCOV content string
 */
export function parseLcovContent(
  content: string,
  workspaceRoot?: string
): ParseResult<WorkspaceCoverage> {
  const logger = getLogger();
  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const files = new Map<string, FileCoverage>();

  // Current file being parsed
  let currentFile: string | null = null;
  let currentLines = new Map<number, LineCoverage>();
  let currentFunctions: FunctionCoverage[] = [];
  let currentBranches = new Map<string, BranchCoverage[]>(); // keyed by line number

  // Function definitions (line -> name)
  const functionDefs = new Map<number, string>();

  const lines = content.split('\n');
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    const trimmed = line.trim();
    
    if (!trimmed) continue;

    // Source file
    if (trimmed.startsWith('SF:')) {
      currentFile = trimmed.slice(3);
      
      // Resolve relative paths
      if (workspaceRoot && !path.isAbsolute(currentFile)) {
        currentFile = path.resolve(workspaceRoot, currentFile);
      }
      
      // Normalize path separators
      currentFile = path.normalize(currentFile);
      continue;
    }

    // End of record - save current file
    if (trimmed === 'end_of_record') {
      if (currentFile) {
        // Apply branch data to lines
        for (const [lineStr, branches] of currentBranches) {
          const lineNumber = parseInt(lineStr, 10);
          const lineCov = currentLines.get(lineNumber);
          if (lineCov) {
            lineCov.branches = branches;
            // Update status to partial if not all branches taken
            const allTaken = branches.every(b => b.taken > 0);
            const someTaken = branches.some(b => b.taken > 0);
            if (!allTaken && someTaken) {
              lineCov.status = LineCoverageStatus.Partial;
            } else if (!someTaken && lineCov.status === LineCoverageStatus.Covered) {
              lineCov.status = LineCoverageStatus.Partial;
            }
          }
        }

        // Calculate summary
        const summary = calculateFileSummary(currentLines, currentFunctions, currentBranches);

        files.set(currentFile, {
          filePath: currentFile,
          lines: currentLines,
          functions: currentFunctions,
          summary
        });
      }

      // Reset for next file
      currentFile = null;
      currentLines = new Map();
      currentFunctions = [];
      currentBranches = new Map();
      functionDefs.clear();
      continue;
    }

    // Skip if no current file
    if (!currentFile) {
      if (trimmed !== 'TN:' && !trimmed.startsWith('TN:')) {
        warnings.push(`Line ${lineNum}: Data outside file record`);
      }
      continue;
    }

    // Function definition: FN:<line>,<name>
    if (trimmed.startsWith('FN:')) {
      const parts = trimmed.slice(3).split(',');
      if (parts.length >= 2) {
        const fnLine = parseInt(parts[0], 10);
        const fnName = parts.slice(1).join(','); // Name might contain commas
        functionDefs.set(fnLine, fnName);
      }
      continue;
    }

    // Function execution count: FNDA:<count>,<name>
    if (trimmed.startsWith('FNDA:')) {
      const parts = trimmed.slice(5).split(',');
      if (parts.length >= 2) {
        const count = parseInt(parts[0], 10);
        const fnName = parts.slice(1).join(',');
        
        // Find the line number for this function
        let fnLine = 0;
        for (const [line, name] of functionDefs) {
          if (name === fnName) {
            fnLine = line;
            break;
          }
        }
        
        currentFunctions.push({
          name: fnName,
          lineNumber: fnLine,
          executionCount: count
        });
      }
      continue;
    }

    // Line data: DA:<line>,<count>
    if (trimmed.startsWith('DA:')) {
      const parts = trimmed.slice(3).split(',');
      if (parts.length >= 2) {
        const lineNumber = parseInt(parts[0], 10);
        const count = parseInt(parts[1], 10);
        
        currentLines.set(lineNumber, {
          lineNumber,
          status: count > 0 ? LineCoverageStatus.Covered : LineCoverageStatus.Uncovered,
          executionCount: count
        });
      }
      continue;
    }

    // Branch data: BRDA:<line>,<block>,<branch>,<taken>
    if (trimmed.startsWith('BRDA:')) {
      const parts = trimmed.slice(5).split(',');
      if (parts.length >= 4) {
        const lineNumber = parts[0];
        const branchId = parseInt(parts[2], 10);
        const takenStr = parts[3];
        
        // '-' means branch was never taken
        const taken = takenStr === '-' ? 0 : parseInt(takenStr, 10);
        
        const lineKey = lineNumber;
        if (!currentBranches.has(lineKey)) {
          currentBranches.set(lineKey, []);
        }
        
        currentBranches.get(lineKey)!.push({
          branchId,
          taken
        });
      }
      continue;
    }

    // Ignore summary lines (LF, LH, FNF, FNH, BRF, BRH, TN)
    if (trimmed.match(/^(LF|LH|FNF|FNH|BRF|BRH|TN):/)) {
      continue;
    }
  }

  // Handle file without end_of_record
  if (currentFile && currentLines.size > 0) {
    warnings.push('File record not properly terminated with end_of_record');
    
    const summary = calculateFileSummary(currentLines, currentFunctions, currentBranches);
    files.set(currentFile, {
      filePath: currentFile,
      lines: currentLines,
      functions: currentFunctions,
      summary
    });
  }

  // Calculate overall summary
  let overallSummary = createEmptySummary();
  for (const file of files.values()) {
    overallSummary = mergeSummaries(overallSummary, file.summary);
  }

  logger.info('LCOV parsing complete', {
    files: files.size,
    linePercentage: overallSummary.linePercentage,
    errors: errors.length,
    warnings: warnings.length
  });

  return {
    success: errors.filter(e => e.fatal).length === 0,
    data: {
      files,
      summary: overallSummary,
      loadedAt: new Date(),
      format: 'lcov'
    },
    errors,
    warnings
  };
}

/**
 * Calculate summary for a single file
 */
function calculateFileSummary(
  lines: Map<number, LineCoverage>,
  functions: FunctionCoverage[],
  branches: Map<string, BranchCoverage[]>
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
