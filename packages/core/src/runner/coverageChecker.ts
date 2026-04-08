/**
 * Coverage Checker
 * 
 * Checks if code changes meet coverage requirements.
 * This is the core pre-CR validation logic.
 */

import { WorkspaceCoverage, FileCoverage, LineCoverageStatus } from '../types';

export interface ChangedLine {
  file: string;
  line: number;
  content: string;
  type: 'added' | 'modified';
}

export interface ChangedFile {
  path: string;
  additions: number[];      // Line numbers of added lines
  modifications: number[];  // Line numbers of modified lines
  isNew: boolean;
}

export interface CoverageCheckResult {
  passed: boolean;
  coveragePercent: number;
  threshold: number;
  summary: {
    totalChangedLines: number;
    coveredLines: number;
    uncoveredLines: number;
    skippedLines: number;  // Comments, blank lines, etc.
  };
  uncoveredDetails: UncoveredDetail[];
  fileBreakdown: FileBreakdown[];
}

export interface UncoveredDetail {
  file: string;
  line: number;
  content?: string;
  reason: 'not-covered' | 'no-coverage-data';
}

export interface FileBreakdown {
  file: string;
  changedLines: number;
  coveredLines: number;
  uncoveredLines: number;
  percent: number;
  passed: boolean;
}

export interface CoverageCheckOptions {
  threshold?: number;           // Default 80%
  excludePatterns?: string[];   // Files to skip
  includeNewFiles?: boolean;    // Check coverage on brand new files
  skipComments?: boolean;       // Don't count comment-only lines
  skipBlankLines?: boolean;     // Don't count blank lines
}

const DEFAULT_OPTIONS: Required<CoverageCheckOptions> = {
  threshold: 80,
  excludePatterns: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/node_modules/**',
    '**/*.d.ts',
    '**/types/**'
  ],
  includeNewFiles: true,
  skipComments: true,
  skipBlankLines: true
};

/**
 * Check if changed lines meet coverage requirements
 */
export function checkChangesCoverage(
  changedFiles: ChangedFile[],
  coverageData: WorkspaceCoverage,
  options?: CoverageCheckOptions
): CoverageCheckResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const fileBreakdown: FileBreakdown[] = [];
  const uncoveredDetails: UncoveredDetail[] = [];
  
  let totalChangedLines = 0;
  let totalCoveredLines = 0;
  let totalUncoveredLines = 0;
  let totalSkippedLines = 0;

  for (const changed of changedFiles) {
    // Skip excluded files
    if (shouldExclude(changed.path, opts.excludePatterns)) {
      continue;
    }

    // Get coverage for this file
    const fileCoverage = findFileCoverage(changed.path, coverageData);
    
    // All changed lines (additions + modifications)
    const allChangedLines = [...changed.additions, ...changed.modifications];
    
    if (allChangedLines.length === 0) {
      continue;
    }

    // If no coverage data for this file
    if (!fileCoverage) {
      // For new files, we might want to require coverage
      if (changed.isNew && opts.includeNewFiles) {
        const uncoveredCount = allChangedLines.length;
        totalChangedLines += uncoveredCount;
        totalUncoveredLines += uncoveredCount;
        
        for (const line of allChangedLines) {
          uncoveredDetails.push({
            file: changed.path,
            line,
            reason: 'no-coverage-data'
          });
        }
        
        fileBreakdown.push({
          file: changed.path,
          changedLines: uncoveredCount,
          coveredLines: 0,
          uncoveredLines: uncoveredCount,
          percent: 0,
          passed: false
        });
      }
      continue;
    }

    // Check each changed line
    let fileCovered = 0;
    let fileUncovered = 0;
    let fileSkipped = 0;

    for (const lineNum of allChangedLines) {
      const lineData = fileCoverage.lines.get(lineNum);
      
      // Line not in coverage data - might be comment/blank/non-executable
      if (!lineData) {
        fileSkipped++;
        totalSkippedLines++;
        continue;
      }

      // Check if line is covered based on status
      const isCovered = lineData.status === LineCoverageStatus.Covered || 
                       lineData.status === LineCoverageStatus.Partial;
      
      totalChangedLines++;

      if (isCovered) {
        fileCovered++;
        totalCoveredLines++;
      } else {
        fileUncovered++;
        totalUncoveredLines++;
        uncoveredDetails.push({
          file: changed.path,
          line: lineNum,
          reason: 'not-covered'
        });
      }
    }

    const fileTotal = fileCovered + fileUncovered;
    const filePercent = fileTotal > 0 ? (fileCovered / fileTotal) * 100 : 100;

    fileBreakdown.push({
      file: changed.path,
      changedLines: fileTotal,
      coveredLines: fileCovered,
      uncoveredLines: fileUncovered,
      percent: Math.round(filePercent * 10) / 10,
      passed: filePercent >= opts.threshold
    });
  }

  const coveragePercent = totalChangedLines > 0 
    ? (totalCoveredLines / totalChangedLines) * 100 
    : 100;

  return {
    passed: coveragePercent >= opts.threshold,
    coveragePercent: Math.round(coveragePercent * 10) / 10,
    threshold: opts.threshold,
    summary: {
      totalChangedLines,
      coveredLines: totalCoveredLines,
      uncoveredLines: totalUncoveredLines,
      skippedLines: totalSkippedLines
    },
    uncoveredDetails,
    fileBreakdown
  };
}

/**
 * Find coverage data for a file (handles path variations)
 */
function findFileCoverage(filePath: string, coverageData: WorkspaceCoverage): FileCoverage | null {
  // Normalize the path
  const normalized = normalizePath(filePath);
  
  // Try to find in the Map
  for (const [coveragePath, coverage] of coverageData.files) {
    const normalizedCoverage = normalizePath(coveragePath);
    
    // Check exact match
    if (normalizedCoverage === normalized) {
      return coverage;
    }
    
    // Check if paths end the same way
    if (normalizedCoverage.endsWith(normalized) || normalized.endsWith(normalizedCoverage)) {
      return coverage;
    }
    
    // Check filename match for simple cases
    const fileBasename = normalized.split('/').pop();
    const coverageBasename = normalizedCoverage.split('/').pop();
    if (fileBasename && coverageBasename && fileBasename === coverageBasename) {
      // Verify it's likely the same file by checking parent dirs
      const fileParts = normalized.split('/');
      const coverageParts = normalizedCoverage.split('/');
      
      if (fileParts.length >= 2 && coverageParts.length >= 2) {
        const fileParent = fileParts[fileParts.length - 2];
        const coverageParent = coverageParts[coverageParts.length - 2];
        if (fileParent === coverageParent) {
          return coverage;
        }
      }
    }
  }

  return null;
}

/**
 * Normalize file path for comparison
 */
function normalizePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

/**
 * Check if file should be excluded
 */
function shouldExclude(filePath: string, patterns: string[]): boolean {
  const normalized = normalizePath(filePath);
  
  for (const pattern of patterns) {
    if (matchGlob(normalized, pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Simple glob matching
 */
function matchGlob(path: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  
  const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`);
  return regex.test(path);
}

/**
 * Format coverage check result as a human-readable report
 */
export function formatCoverageReport(result: CoverageCheckResult): string {
  const lines: string[] = [];
  
  // Header
  const status = result.passed ? '✅ PASSED' : '❌ FAILED';
  lines.push(`Coverage Check: ${status}`);
  lines.push(`Coverage: ${result.coveragePercent}% (threshold: ${result.threshold}%)`);
  lines.push('');
  
  // Summary
  lines.push('Summary:');
  lines.push(`  Changed lines: ${result.summary.totalChangedLines}`);
  lines.push(`  Covered: ${result.summary.coveredLines}`);
  lines.push(`  Uncovered: ${result.summary.uncoveredLines}`);
  if (result.summary.skippedLines > 0) {
    lines.push(`  Skipped (non-executable): ${result.summary.skippedLines}`);
  }
  lines.push('');
  
  // File breakdown (show failed files first)
  if (result.fileBreakdown.length > 0) {
    lines.push('File Breakdown:');
    
    const sorted = [...result.fileBreakdown].sort((a, b) => {
      if (a.passed === b.passed) return a.file.localeCompare(b.file);
      return a.passed ? 1 : -1; // Failed files first
    });
    
    for (const file of sorted) {
      const fileStatus = file.passed ? '✓' : '✗';
      lines.push(`  ${fileStatus} ${file.file}: ${file.percent}% (${file.coveredLines}/${file.changedLines})`);
    }
    lines.push('');
  }
  
  // Uncovered lines (limit to first 20)
  if (result.uncoveredDetails.length > 0) {
    lines.push('Uncovered Lines:');
    const toShow = result.uncoveredDetails.slice(0, 20);
    
    for (const detail of toShow) {
      const reason = detail.reason === 'no-coverage-data' ? ' (no coverage data)' : '';
      lines.push(`  ${detail.file}:${detail.line}${reason}`);
    }
    
    if (result.uncoveredDetails.length > 20) {
      lines.push(`  ... and ${result.uncoveredDetails.length - 20} more`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Get a short summary for status bar / notifications
 */
export function getShortSummary(result: CoverageCheckResult): string {
  if (result.passed) {
    return `✅ Coverage: ${result.coveragePercent}%`;
  } else {
    return `❌ Coverage: ${result.coveragePercent}% (need ${result.threshold}%)`;
  }
}
