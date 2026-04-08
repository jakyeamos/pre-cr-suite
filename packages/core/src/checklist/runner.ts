/**
 * PR Checklist Runner
 * 
 * Orchestrates all checklist analyzers and produces
 * a unified checklist result.
 */

import { getLogger } from '../logger';
import { WorkspaceCoverage } from '../types';
import {
  ChecklistConfig,
  ChecklistResult,
  ChecklistItem,
  CheckStatus,
  CheckSeverity,
  DEFAULT_CHECKLIST_CONFIG,
  PRSizeResult,
  SecurityResult,
  DocCoverageResult,
  TestCoverageDeltaResult,
  DEFAULT_PR_SIZE_CONFIG,
  DEFAULT_DOC_COVERAGE_CONFIG,
  DEFAULT_TEST_COVERAGE_DELTA_CONFIG
} from './types';
import { analyzePRSize, FileChange } from './prSize';
import { scanSecurity, FileContent } from './security';
import { analyzeDocCoverage, SourceFile, ParsedExport } from './docCoverage';

// ============================================================================
// Input Types
// ============================================================================

export interface ChecklistInput {
  /** Changed files with diff info */
  changes: FileChange[];
  /** File contents for analysis */
  files: FileContent[];
  /** Source files for doc analysis */
  sourceFiles: SourceFile[];
  /** Current coverage data */
  headCoverage?: WorkspaceCoverage;
  /** Base branch coverage data */
  baseCoverage?: WorkspaceCoverage;
  /** Base branch exports (for detecting new undocumented exports) */
  baseExports?: ParsedExport[];
  /** Git blame info for reviewer suggestions */
  blameInfo?: Map<string, string[]>;
}

// ============================================================================
// Checklist Runner
// ============================================================================

/**
 * Run all checklist analyzers
 */
export function runChecklist(
  input: ChecklistInput,
  config: Partial<ChecklistConfig> = {}
): ChecklistResult {
  const logger = getLogger();
  const startTime = Date.now();
  
  const fullConfig: ChecklistConfig = {
    ...DEFAULT_CHECKLIST_CONFIG,
    ...config
  };
  
  const items: ChecklistItem[] = [];
  const details: ChecklistResult['details'] = {};
  
  // 1. PR Size Analysis
  logger.info('Running PR size analysis');
  const prSizeResult = analyzePRSize(input.changes, fullConfig.prSize);
  details.prSize = prSizeResult;
  items.push(createPRSizeItem(prSizeResult, fullConfig.prSize));
  
  // 2. Security Scan
  logger.info('Running security scan');
  const securityResult = scanSecurity(input.files, fullConfig.security);
  details.security = securityResult;
  items.push(createSecurityItem(securityResult));
  
  // 3. Documentation Coverage
  logger.info('Running documentation coverage analysis');
  const docResult = analyzeDocCoverage(
    input.sourceFiles,
    input.baseExports,
    fullConfig.docCoverage
  );
  details.docCoverage = docResult;
  items.push(createDocCoverageItem(docResult, fullConfig.docCoverage));
  
  // 4. Test Coverage Delta
  if (input.headCoverage) {
    logger.info('Running test coverage delta analysis');
    const coverageDeltaResult = analyzeTestCoverageDelta(
      input.changes,
      input.headCoverage,
      input.baseCoverage,
      fullConfig.testCoverageDelta
    );
    details.testCoverageDelta = coverageDeltaResult;
    items.push(createTestCoverageDeltaItem(coverageDeltaResult, fullConfig.testCoverageDelta));
  }
  
  // Calculate overall status
  const hasErrors = items.some(i => i.status === CheckStatus.Fail && i.severity === CheckSeverity.Error);
  const hasWarnings = items.some(i => i.status === CheckStatus.Warn || 
    (i.status === CheckStatus.Fail && i.severity === CheckSeverity.Warning));
  
  let status: ChecklistResult['status'];
  if (hasErrors) {
    status = 'fail';
  } else if (hasWarnings) {
    status = 'warn';
  } else {
    status = 'pass';
  }
  
  // Generate summary
  const passCount = items.filter(i => i.status === CheckStatus.Pass).length;
  const totalCount = items.filter(i => i.status !== CheckStatus.Skip).length;
  const summary = `${passCount}/${totalCount} checks passed`;
  
  // Suggest reviewers
  const suggestedReviewers = suggestReviewers(input.changes, input.blameInfo);
  
  const elapsed = Date.now() - startTime;
  logger.info('Checklist complete', { status, elapsed, passCount, totalCount });
  
  return {
    status,
    summary,
    items,
    details,
    suggestedReviewers,
    timestamp: new Date()
  };
}

// ============================================================================
// Check Item Creators
// ============================================================================

function createPRSizeItem(result: PRSizeResult, _config: typeof DEFAULT_PR_SIZE_CONFIG): ChecklistItem {
  const { linesChanged, filesChanged, recommendation, suggestedSplitPoints } = result;
  
  let status: CheckStatus;
  let severity: CheckSeverity;
  let message: string;
  
  switch (recommendation) {
    case 'good':
      status = CheckStatus.Pass;
      severity = CheckSeverity.Info;
      message = `PR size is good (${linesChanged} lines, ${filesChanged} files)`;
      break;
    case 'consider-splitting':
      status = CheckStatus.Warn;
      severity = CheckSeverity.Warning;
      message = `Consider splitting PR (${linesChanged} lines, ${filesChanged} files)`;
      break;
    case 'too-large':
      status = CheckStatus.Fail;
      severity = CheckSeverity.Warning;
      message = `PR is too large (${linesChanged} lines, ${filesChanged} files)`;
      break;
  }
  
  return {
    id: 'pr-size',
    name: 'PR Size',
    status,
    severity,
    message,
    details: suggestedSplitPoints?.join('\n')
  };
}

function createSecurityItem(result: SecurityResult): ChecklistItem {
  const { findings, scannedFiles } = result;
  
  const errors = findings.filter(f => f.severity === CheckSeverity.Error);
  const warnings = findings.filter(f => f.severity === CheckSeverity.Warning);
  
  let status: CheckStatus;
  let severity: CheckSeverity;
  let message: string;
  
  if (errors.length > 0) {
    status = CheckStatus.Fail;
    severity = CheckSeverity.Error;
    message = `${errors.length} security issue(s) found`;
  } else if (warnings.length > 0) {
    status = CheckStatus.Warn;
    severity = CheckSeverity.Warning;
    message = `${warnings.length} potential security issue(s) to review`;
  } else {
    status = CheckStatus.Pass;
    severity = CheckSeverity.Info;
    message = `No security issues found (${scannedFiles} files scanned)`;
  }
  
  return {
    id: 'security',
    name: 'Security Scan',
    status,
    severity,
    message,
    details: findings.length > 0 
      ? findings.map(f => `${f.file}:${f.line} - ${f.message}`).join('\n')
      : undefined,
    locations: findings.map(f => ({
      file: f.file,
      line: f.line,
      snippet: f.snippet
    }))
  };
}

function createDocCoverageItem(
  result: DocCoverageResult, 
  config: typeof DEFAULT_DOC_COVERAGE_CONFIG
): ChecklistItem {
  const { coveragePercent, undocumented, newUndocumented, totalExports } = result;
  
  let status: CheckStatus;
  let severity: CheckSeverity;
  let message: string;
  
  if (totalExports === 0) {
    status = CheckStatus.Skip;
    severity = CheckSeverity.Info;
    message = 'No exports to document';
  } else if (newUndocumented.length > 0) {
    status = CheckStatus.Fail;
    severity = CheckSeverity.Warning;
    message = `${newUndocumented.length} new export(s) without documentation`;
  } else if (coveragePercent < config.minCoverage) {
    status = CheckStatus.Warn;
    severity = CheckSeverity.Warning;
    message = `Documentation coverage is ${coveragePercent}% (target: ${config.minCoverage}%)`;
  } else {
    status = CheckStatus.Pass;
    severity = CheckSeverity.Info;
    message = `Documentation coverage: ${coveragePercent}%`;
  }
  
  return {
    id: 'doc-coverage',
    name: 'Documentation Coverage',
    status,
    severity,
    message,
    details: undocumented.length > 0
      ? undocumented.map(u => `${u.file}:${u.line} - ${u.kind} ${u.name}`).join('\n')
      : undefined,
    locations: undocumented.map(u => ({
      file: u.file,
      line: u.line
    })),
    fixable: true
  };
}

function createTestCoverageDeltaItem(
  result: TestCoverageDeltaResult,
  config: typeof DEFAULT_TEST_COVERAGE_DELTA_CONFIG
): ChecklistItem {
  const { deltaCoverage, newCodeCoverage, uncoveredChanges, newLinesTotal } = result;
  
  let status: CheckStatus;
  let severity: CheckSeverity;
  let message: string;
  
  if (newLinesTotal === 0) {
    status = CheckStatus.Skip;
    severity = CheckSeverity.Info;
    message = 'No new code to cover';
  } else if (newCodeCoverage < config.minNewCodeCoverage) {
    status = CheckStatus.Fail;
    severity = CheckSeverity.Warning;
    message = `New code coverage is ${newCodeCoverage}% (target: ${config.minNewCodeCoverage}%)`;
  } else if (deltaCoverage < -config.coverageDropThreshold) {
    status = CheckStatus.Warn;
    severity = CheckSeverity.Warning;
    message = `Overall coverage dropped by ${Math.abs(deltaCoverage)}%`;
  } else {
    status = CheckStatus.Pass;
    severity = CheckSeverity.Info;
    message = `Test coverage: ${newCodeCoverage}% of new code covered`;
  }
  
  return {
    id: 'test-coverage',
    name: 'Test Coverage',
    status,
    severity,
    message,
    details: uncoveredChanges.length > 0
      ? `${uncoveredChanges.length} new lines without coverage`
      : undefined,
    locations: uncoveredChanges.slice(0, 10).map(u => ({
      file: u.file,
      line: u.line,
      snippet: u.snippet
    }))
  };
}

// ============================================================================
// Test Coverage Delta Analysis
// ============================================================================

function analyzeTestCoverageDelta(
  changes: FileChange[],
  headCoverage: WorkspaceCoverage,
  baseCoverage?: WorkspaceCoverage,
  _config: typeof DEFAULT_TEST_COVERAGE_DELTA_CONFIG = DEFAULT_TEST_COVERAGE_DELTA_CONFIG
): TestCoverageDeltaResult {
  const baseCoveragePercent = baseCoverage?.summary.linePercentage ?? headCoverage.summary.linePercentage;
  const headCoveragePercent = headCoverage.summary.linePercentage;
  const deltaCoverage = headCoveragePercent - baseCoveragePercent;
  
  // Find uncovered new lines
  const uncoveredChanges: TestCoverageDeltaResult['uncoveredChanges'] = [];
  let newLinesTotal = 0;
  let newLinesCovered = 0;
  
  for (const change of changes) {
    if (change.isDeleted) continue;
    
    // Get coverage for this file
    const fileCoverage = headCoverage.files.get(change.path);
    if (!fileCoverage) continue;
    
    // For new files, all lines are "new"
    if (change.isNew) {
      for (const [lineNum, lineCov] of fileCoverage.lines) {
        newLinesTotal++;
        if (lineCov.executionCount > 0) {
          newLinesCovered++;
        } else {
          uncoveredChanges.push({
            file: change.path,
            line: lineNum,
            snippet: '' // Would need file content to get snippet
          });
        }
      }
    }
    // For modified files, we'd need the actual diff hunks
    // This is a simplified version
    else {
      newLinesTotal += change.additions;
      // Approximate: assume same ratio as file coverage
      newLinesCovered += Math.round(change.additions * (fileCoverage.summary.linePercentage / 100));
    }
  }
  
  const newCodeCoverage = newLinesTotal > 0 
    ? Math.round((newLinesCovered / newLinesTotal) * 100)
    : 100;
  
  return {
    baseCoverage: baseCoveragePercent,
    headCoverage: headCoveragePercent,
    deltaCoverage,
    newLinesTotal,
    newLinesCovered,
    newCodeCoverage,
    uncoveredChanges
  };
}

// ============================================================================
// Reviewer Suggestions
// ============================================================================

function suggestReviewers(
  changes: FileChange[],
  blameInfo?: Map<string, string[]>
): string[] {
  if (!blameInfo) {
    return [];
  }
  
  // Count contributions by author
  const authorCounts = new Map<string, number>();
  
  for (const change of changes) {
    const authors = blameInfo.get(change.path);
    if (authors) {
      for (const author of authors) {
        authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
      }
    }
  }
  
  // Sort by contribution count
  const sorted = [...authorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([author]) => author);
  
  return sorted;
}

// ============================================================================
// Quick Check Functions
// ============================================================================

/**
 * Quick security check (just secrets, no full analysis)
 */
export function quickSecurityCheck(files: FileContent[]): boolean {
  const result = scanSecurity(files);
  return result.findings.filter(f => f.severity === CheckSeverity.Error).length === 0;
}

/**
 * Quick size check
 */
export function quickSizeCheck(changes: FileChange[]): PRSizeResult['recommendation'] {
  const result = analyzePRSize(changes);
  return result.recommendation;
}
