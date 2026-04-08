/**
 * Documentation Health Monitor
 * 
 * Monitors documentation health across a codebase:
 * - Detects stale documentation (code changed but docs didn't)
 * - Finds documentation-code drift
 * - Checks README staleness
 * - Reports documentation coverage trends
 */

import { getLogger } from '../logger';
import { parseExports, SourceFile, ParsedExport, checkDocHealth, DocHealthIssue } from './docCoverage';

// ============================================================================
// Types
// ============================================================================

/**
 * Severity of a health issue
 */
export enum HealthIssueSeverity {
  /** Informational - no action needed */
  Info = 'info',
  /** Warning - should be addressed */
  Warning = 'warning',
  /** Error - must be fixed */
  Error = 'error'
}

/**
 * Type of documentation health issue
 */
export type HealthIssueType = 
  | 'stale-doc'           // Docs don't match code
  | 'missing-doc'         // Export has no docs
  | 'missing-param'       // Parameter not documented
  | 'extra-param'         // Documented param doesn't exist
  | 'wrong-return'        // Return type doesn't match
  | 'outdated-example'    // Example code is outdated
  | 'broken-link'         // Link in docs is broken
  | 'readme-stale'        // README references deleted files
  | 'readme-outdated'     // README has outdated commands/info
  | 'changelog-missing';  // No changelog entry for changes

/**
 * A documentation health issue
 */
export interface HealthIssue {
  type: HealthIssueType;
  severity: HealthIssueSeverity;
  file: string;
  line: number;
  name: string;
  message: string;
  suggestion?: string;
  /** The outdated documentation text */
  oldDoc?: string;
  /** What the documentation should reflect */
  newCode?: string;
}

/**
 * Documentation health report for a file
 */
export interface FileHealthReport {
  file: string;
  issues: HealthIssue[];
  coverage: {
    total: number;
    documented: number;
    percentage: number;
  };
}

/**
 * Documentation health report for a workspace
 */
export interface WorkspaceHealthReport {
  files: FileHealthReport[];
  summary: {
    totalFiles: number;
    totalIssues: number;
    issuesByType: Record<HealthIssueType, number>;
    issuesBySeverity: Record<HealthIssueSeverity, number>;
    overallCoverage: number;
    criticalFiles: string[]; // Files with most issues
  };
  timestamp: Date;
}

/**
 * Configuration for health monitoring
 */
export interface HealthMonitorConfig {
  /** Check for stale documentation */
  checkStale: boolean;
  /** Check for missing documentation */
  checkMissing: boolean;
  /** Check README files */
  checkReadme: boolean;
  /** Minimum coverage to not warn */
  minCoverage: number;
  /** File patterns to exclude */
  excludePatterns: string[];
}

export const DEFAULT_HEALTH_CONFIG: HealthMonitorConfig = {
  checkStale: true,
  checkMissing: true,
  checkReadme: true,
  minCoverage: 80,
  excludePatterns: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/node_modules/**'
  ]
};

// ============================================================================
// Health Check Functions
// ============================================================================

/**
 * Check documentation health for a single file
 */
export function checkFileHealth(
  file: SourceFile,
  config: Partial<HealthMonitorConfig> = {}
): FileHealthReport {
  const logger = getLogger();
  const fullConfig = { ...DEFAULT_HEALTH_CONFIG, ...config };
  
  const issues: HealthIssue[] = [];
  
  // Skip excluded files
  if (shouldExclude(file.path, fullConfig.excludePatterns)) {
    return {
      file: file.path,
      issues: [],
      coverage: { total: 0, documented: 0, percentage: 100 }
    };
  }
  
  // Get existing doc health issues (param mismatches, etc.)
  if (fullConfig.checkStale) {
    const docIssues = checkDocHealth(file);
    for (const issue of docIssues) {
      issues.push({
        type: issue.type as HealthIssueType,
        severity: issue.type === 'stale' ? HealthIssueSeverity.Warning : HealthIssueSeverity.Info,
        file: issue.file,
        line: issue.line,
        name: issue.name,
        message: issue.message,
        suggestion: issue.suggestion
      });
    }
  }
  
  // Check for missing documentation
  const exports = parseExports(file);
  const documented = exports.filter(e => e.hasDoc);
  const undocumented = exports.filter(e => !e.hasDoc);
  
  if (fullConfig.checkMissing) {
    for (const exp of undocumented) {
      issues.push({
        type: 'missing-doc',
        severity: HealthIssueSeverity.Warning,
        file: exp.file,
        line: exp.line,
        name: exp.name,
        message: `${exp.kind} '${exp.name}' is not documented`,
        suggestion: `Add JSDoc documentation for ${exp.name}`
      });
    }
  }
  
  const coverage = {
    total: exports.length,
    documented: documented.length,
    percentage: exports.length > 0 
      ? Math.round((documented.length / exports.length) * 100) 
      : 100
  };
  
  logger.debug('File health check complete', {
    file: file.path,
    issues: issues.length,
    coverage: coverage.percentage
  });
  
  return { file: file.path, issues, coverage };
}

/**
 * Check documentation health for multiple files
 */
export function checkWorkspaceHealth(
  files: SourceFile[],
  config: Partial<HealthMonitorConfig> = {}
): WorkspaceHealthReport {
  const logger = getLogger();
  const fullConfig = { ...DEFAULT_HEALTH_CONFIG, ...config };
  
  const fileReports: FileHealthReport[] = [];
  
  for (const file of files) {
    const report = checkFileHealth(file, fullConfig);
    fileReports.push(report);
  }
  
  // Aggregate stats
  const issuesByType: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = {};
  let totalIssues = 0;
  let totalExports = 0;
  let totalDocumented = 0;
  
  for (const report of fileReports) {
    totalIssues += report.issues.length;
    totalExports += report.coverage.total;
    totalDocumented += report.coverage.documented;
    
    for (const issue of report.issues) {
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
    }
  }
  
  // Find critical files (most issues)
  const criticalFiles = fileReports
    .filter(r => r.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, 5)
    .map(r => r.file);
  
  const overallCoverage = totalExports > 0
    ? Math.round((totalDocumented / totalExports) * 100)
    : 100;
  
  logger.info('Workspace health check complete', {
    files: files.length,
    totalIssues,
    overallCoverage
  });
  
  return {
    files: fileReports,
    summary: {
      totalFiles: files.length,
      totalIssues,
      issuesByType: issuesByType as Record<HealthIssueType, number>,
      issuesBySeverity: issuesBySeverity as Record<HealthIssueSeverity, number>,
      overallCoverage,
      criticalFiles
    },
    timestamp: new Date()
  };
}

// ============================================================================
// README Health Checks
// ============================================================================

/**
 * Issues found in README files
 */
export interface ReadmeIssue {
  type: 'broken-link' | 'deleted-file' | 'outdated-command' | 'outdated-version';
  line: number;
  message: string;
  suggestion?: string;
}

/**
 * Check README for common issues
 */
export function checkReadmeHealth(
  readmeContent: string,
  existingFiles: Set<string>,
  packageJson?: { scripts?: Record<string, string>; version?: string }
): ReadmeIssue[] {
  const issues: ReadmeIssue[] = [];
  const lines = readmeContent.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Check for references to files
    const fileRefs = extractFileReferences(line);
    for (const ref of fileRefs) {
      // Check if file exists
      if (!existingFiles.has(ref) && !isExternalUrl(ref)) {
        // Could be a deleted file
        issues.push({
          type: 'deleted-file',
          line: lineNum,
          message: `Reference to '${ref}' - file may not exist`,
          suggestion: `Verify the file exists or update the reference`
        });
      }
    }
    
    // Check for npm/yarn commands
    if (packageJson?.scripts) {
      const commandMatch = line.match(/(?:npm run|yarn|pnpm)\s+(\w+)/);
      if (commandMatch) {
        const scriptName = commandMatch[1];
        if (!packageJson.scripts[scriptName]) {
          issues.push({
            type: 'outdated-command',
            line: lineNum,
            message: `Script '${scriptName}' not found in package.json`,
            suggestion: `Update to valid script or remove reference`
          });
        }
      }
    }
    
    // Check for version references
    if (packageJson?.version) {
      const versionMatch = line.match(/version[:\s]+["']?(\d+\.\d+\.\d+)/i);
      if (versionMatch && versionMatch[1] !== packageJson.version) {
        issues.push({
          type: 'outdated-version',
          line: lineNum,
          message: `Version ${versionMatch[1]} doesn't match package.json (${packageJson.version})`,
          suggestion: `Update version to ${packageJson.version}`
        });
      }
    }
  }
  
  return issues;
}

/**
 * Extract file references from a line
 */
function extractFileReferences(line: string): string[] {
  const refs: string[] = [];
  
  // Match markdown links: [text](path)
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkPattern.exec(line)) !== null) {
    refs.push(match[2]);
  }
  
  // Match code references: `path/to/file`
  const codePattern = /`([^`]+\.\w+)`/g;
  while ((match = codePattern.exec(line)) !== null) {
    refs.push(match[1]);
  }
  
  return refs;
}

/**
 * Check if a path is an external URL
 */
function isExternalUrl(path: string): boolean {
  return path.startsWith('http://') || 
         path.startsWith('https://') || 
         path.startsWith('//') ||
         path.startsWith('#');
}

/**
 * Check if file should be excluded
 */
function shouldExclude(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  
  for (const pattern of patterns) {
    // Simple glob matching
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');
    
    const regex = new RegExp(regexPattern);
    if (regex.test(normalized)) {
      return true;
    }
  }
  
  return false;
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Detect if documentation might be stale based on git changes
 */
export interface StaleDetectionResult {
  file: string;
  exportName: string;
  lastDocChange: Date | null;
  lastCodeChange: Date | null;
  isLikelyStale: boolean;
  reason?: string;
}

/**
 * Compare documentation timestamps with code timestamps
 * This would integrate with git blame data
 */
export function detectStaleDocumentation(
  file: SourceFile,
  gitBlameData?: Map<number, { date: Date; author: string }>
): StaleDetectionResult[] {
  const results: StaleDetectionResult[] = [];
  const exports = parseExports(file);
  
  if (!gitBlameData) {
    // Without git data, we can only do basic checks
    return exports
      .filter(e => e.hasDoc)
      .map(e => ({
        file: e.file,
        exportName: e.name,
        lastDocChange: null,
        lastCodeChange: null,
        isLikelyStale: false,
        reason: 'Git data not available'
      }));
  }
  
  // With git data, compare documentation line dates with code line dates
  for (const exp of exports) {
    if (!exp.hasDoc) continue;
    
    // This is a simplified check - real implementation would
    // analyze the full function body and doc block
    const docLine = exp.line - 1; // Doc is usually on the line before
    const codeLine = exp.line;
    
    const docBlame = gitBlameData.get(docLine);
    const codeBlame = gitBlameData.get(codeLine);
    
    const isLikelyStale = docBlame && codeBlame && 
      docBlame.date < codeBlame.date &&
      (codeBlame.date.getTime() - docBlame.date.getTime()) > 7 * 24 * 60 * 60 * 1000; // 7 days
    
    results.push({
      file: exp.file,
      exportName: exp.name,
      lastDocChange: docBlame?.date || null,
      lastCodeChange: codeBlame?.date || null,
      isLikelyStale: !!isLikelyStale,
      reason: isLikelyStale 
        ? `Code changed ${formatDateDiff(codeBlame!.date, docBlame!.date)} after documentation`
        : undefined
    });
  }
  
  return results;
}

/**
 * Format date difference in human-readable form
 */
function formatDateDiff(newer: Date, older: Date): string {
  const diffMs = newer.getTime() - older.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  
  if (diffDays < 1) return 'less than a day';
  if (diffDays === 1) return '1 day';
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
  return `${Math.floor(diffDays / 365)} years`;
}
