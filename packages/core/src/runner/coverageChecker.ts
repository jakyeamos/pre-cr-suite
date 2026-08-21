/**
 * Coverage Checker
 *
 * Checks if code changes meet coverage requirements.
 * This is the core pre-CR validation logic.
 */

import * as path from 'path';

import { WorkspaceCoverage, FileCoverage, LineCoverageStatus } from '../types';
import type { PreCrSurfaceConfig } from '../protocol';

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
  /**
   * Exact source text for changed lines when the caller can provide it.
   * Missing coverage may only be skipped after this text proves the line is
   * blank or a full-line comment; absent text is treated as executable.
   */
  lineContents?: Readonly<Record<number, string>>;
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
  surfaceSummary: {
    coveredFiles: number;
    ignoredFiles: number;
    unsupportedFiles: number;
  };
  unsupportedFiles: string[];
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
  surfaces?: PreCrSurfaceConfig;
  /** Workspace used to match coverage reporters' absolute source paths. */
  workspaceRoot?: string;
}

type UnsupportedSurfaceFields = Pick<CoverageCheckResult, 'unsupportedFiles'>;

export function formatUnsupportedSurfaceSetupGuidance(coverage: UnsupportedSurfaceFields): string[] {
  if (coverage.unsupportedFiles.length === 0) {
    return [];
  }

  return [
    'Fix Setup: Unsupported files are outside the current coverage surface.',
    '  Add a coverage adapter for these paths or reclassify them in .pre-cr.json under surfaces.covered, surfaces.ignored, or surfaces.unsupported.'
  ];
}

type ResolvedCoverageCheckOptions = Required<Omit<CoverageCheckOptions, 'workspaceRoot'>> &
  Pick<CoverageCheckOptions, 'workspaceRoot'>;

const DEFAULT_OPTIONS: Omit<ResolvedCoverageCheckOptions, 'workspaceRoot'> = {
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
  skipBlankLines: true,
  surfaces: {
    covered: [],
    ignored: [],
    unsupported: []
  }
};

/**
 * Check if changed lines meet coverage requirements
 */
export function checkChangesCoverage(
  changedFiles: ChangedFile[],
  coverageData: WorkspaceCoverage,
  options?: CoverageCheckOptions
): CoverageCheckResult {
  const opts: ResolvedCoverageCheckOptions = { ...DEFAULT_OPTIONS, ...options };

  const fileBreakdown: FileBreakdown[] = [];
  const uncoveredDetails: UncoveredDetail[] = [];

  let totalChangedLines = 0;
  let totalCoveredLines = 0;
  let totalUncoveredLines = 0;
  let totalSkippedLines = 0;
  const surfaceSummary = {
    coveredFiles: 0,
    ignoredFiles: 0,
    unsupportedFiles: 0
  };
  const unsupportedFiles: string[] = [];

  for (const changed of changedFiles) {
    const surface = classifySurface(changed.path, opts.surfaces);
    if (surface === 'ignored') {
      surfaceSummary.ignoredFiles += 1;
      continue;
    }

    if (surface === 'unsupported') {
      surfaceSummary.unsupportedFiles += 1;
      unsupportedFiles.push(changed.path);
      continue;
    }

    surfaceSummary.coveredFiles += 1;

    // Skip excluded files
    if (shouldExclude(changed.path, opts.excludePatterns)) {
      continue;
    }

    // Get coverage for this file
    const fileCoverage = findFileCoverage(changed.path, coverageData, opts.workspaceRoot);

    // All changed lines (additions + modifications)
    const allChangedLines = [...changed.additions, ...changed.modifications];

    if (allChangedLines.length === 0) {
      continue;
    }

    // Preserve the existing opt-out for brand new files. Modified files always
    // require a coverage decision when they contain executable changed lines.
    if (!fileCoverage && changed.isNew && !opts.includeNewFiles) {
      continue;
    }

    // Check each changed line
    let fileCovered = 0;
    let fileUncovered = 0;

    for (const lineNum of allChangedLines) {
      const lineData = fileCoverage?.lines.get(lineNum);

      // A missing coverage entry is not evidence that a line is non-executable.
      // Only source text that proves a blank or full-line comment may be skipped.
      if (!lineData) {
        if (shouldSkipMissingCoverageLine(changed, lineNum, opts)) {
          totalSkippedLines++;
          continue;
        }

        fileUncovered++;
        totalChangedLines++;
        totalUncoveredLines++;
        uncoveredDetails.push(createNoCoverageDetail(changed, lineNum));
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

    if (fileCoverage || fileTotal > 0) {
      fileBreakdown.push({
        file: changed.path,
        changedLines: fileTotal,
        coveredLines: fileCovered,
        uncoveredLines: fileUncovered,
        percent: Math.round(filePercent * 10) / 10,
        passed: filePercent >= opts.threshold
      });
    }
  }

  const coveragePercent = totalChangedLines > 0
    ? (totalCoveredLines / totalChangedLines) * 100
    : 100;

  const hasUnsupportedFiles = unsupportedFiles.length > 0;

  return {
    passed: coveragePercent >= opts.threshold && !hasUnsupportedFiles,
    coveragePercent: Math.round(coveragePercent * 10) / 10,
    threshold: opts.threshold,
    summary: {
      totalChangedLines,
      coveredLines: totalCoveredLines,
      uncoveredLines: totalUncoveredLines,
      skippedLines: totalSkippedLines
    },
    surfaceSummary,
    unsupportedFiles,
    uncoveredDetails,
    fileBreakdown
  };
}

function createNoCoverageDetail(changed: ChangedFile, line: number): UncoveredDetail {
  const content = changed.lineContents?.[line];
  return content === undefined
    ? {
      file: changed.path,
      line,
      reason: 'no-coverage-data'
    }
    : {
      file: changed.path,
      line,
      content,
      reason: 'no-coverage-data'
    };
}

function shouldSkipMissingCoverageLine(
  changed: ChangedFile,
  line: number,
  options: Pick<ResolvedCoverageCheckOptions, 'skipBlankLines' | 'skipComments'>
): boolean {
  const content = changed.lineContents?.[line];
  if (content === undefined) {
    return false;
  }

  if (options.skipBlankLines && content.trim().length === 0) {
    return true;
  }

  return options.skipComments && isProvenFullLineComment(changed.path, content);
}

function isProvenFullLineComment(filePath: string, content: string): boolean {
  const trimmed = content.trim();
  const extension = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();

  if (supportsSlashComments(extension) && trimmed.startsWith('//')) {
    return true;
  }

  if (supportsHashComments(extension) && trimmed.startsWith('#')) {
    return true;
  }

  if (supportsDashComments(extension) && trimmed.startsWith('--')) {
    return true;
  }

  return supportsBlockComments(extension) &&
    trimmed.startsWith('/*') &&
    trimmed.endsWith('*/');
}

function supportsSlashComments(extension: string): boolean {
  return [
    'c', 'cc', 'cpp', 'cs', 'cxx', 'dart', 'go', 'h', 'hpp', 'java', 'js',
    'jsx', 'kt', 'kts', 'mjs', 'php', 'rs', 'scala', 'swift', 'ts', 'tsx'
  ].includes(extension);
}

function supportsHashComments(extension: string): boolean {
  return [
    'bash', 'cfg', 'ini', 'pl', 'properties', 'py', 'rb', 'r', 'sh', 'toml',
    'yaml', 'yml', 'zsh'
  ].includes(extension);
}

function supportsDashComments(extension: string): boolean {
  return ['hs', 'lua', 'sql'].includes(extension);
}

function supportsBlockComments(extension: string): boolean {
  return [
    'c', 'cc', 'cpp', 'cs', 'css', 'cxx', 'dart', 'go', 'h', 'hpp', 'java',
    'js', 'jsx', 'kt', 'kts', 'less', 'mjs', 'php', 'rs', 'scss', 'scala',
    'swift', 'ts', 'tsx'
  ].includes(extension);
}

function classifySurface(filePath: string, surfaces: PreCrSurfaceConfig): 'covered' | 'ignored' | 'unsupported' {
  if (shouldExclude(filePath, surfaces.ignored)) {
    return 'ignored';
  }

  if (shouldExclude(filePath, surfaces.unsupported)) {
    return 'unsupported';
  }

  if (surfaces.covered.length === 0 || shouldExclude(filePath, surfaces.covered)) {
    return 'covered';
  }

  // A non-empty covered surface is an explicit contract. Treat a file that is
  // not classified by any configured surface as unsupported instead of silently
  // exempting it from the check.
  return 'unsupported';
}

/**
 * Find coverage data for a file (handles path variations)
 */
function findFileCoverage(
  filePath: string,
  coverageData: WorkspaceCoverage,
  workspaceRoot?: string
): FileCoverage | null {
  // Normalize the path
  const normalized = normalizePath(filePath);
  const normalizedWorkspacePath = workspaceRoot
    ? normalizePath(path.resolve(workspaceRoot, filePath))
    : null;

  // Try to find in the Map
  for (const [coveragePath, coverage] of coverageData.files) {
    const normalizedCoverage = normalizePath(coveragePath);

    // Check exact match
    if (normalizedCoverage === normalized) {
      return coverage;
    }

    // Coverage reporters may use an absolute path while Git gives us a
    // workspace-relative path. The workspace root gives us one unambiguous
    // absolute candidate; suffix or basename matching could borrow coverage
    // from an unrelated file.
    if (normalizedCoverage === normalized || normalizedCoverage === normalizedWorkspacePath) {
      return coverage;
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
  if (result.unsupportedFiles.length > 0) {
    lines.push(`  Unsupported surface files: ${result.unsupportedFiles.length}`);
  }
  lines.push('');

  if (result.unsupportedFiles.length > 0) {
    lines.push('Unsupported Files:');
    const toShow = result.unsupportedFiles.slice(0, 20);

    for (const file of toShow) {
      lines.push(`  ${file}`);
    }

    if (result.unsupportedFiles.length > 20) {
      lines.push(`  ... and ${result.unsupportedFiles.length - 20} more`);
    }
    lines.push('', ...formatUnsupportedSurfaceSetupGuidance(result));
    lines.push('');
  }

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
  } else if (result.unsupportedFiles.length > 0) {
    return `❌ Unsupported surface files: ${result.unsupportedFiles.length}`;
  } else {
    return `❌ Coverage: ${result.coveragePercent}% (need ${result.threshold}%)`;
  }
}
