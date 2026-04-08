/**
 * PR Size Analyzer
 * 
 * Analyzes the size of changes and recommends whether to split.
 * Research shows PRs over 200 lines have significantly lower
 * review quality (70% lower defect detection rate).
 */

import { getLogger } from '../logger';
import {
  PRSizeConfig,
  PRSizeResult,
  DEFAULT_PR_SIZE_CONFIG
} from './types';

/**
 * Information about a changed file
 */
export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  /** Is this a new file? */
  isNew: boolean;
  /** Is this a deleted file? */
  isDeleted: boolean;
  /** Is this a renamed file? */
  isRenamed: boolean;
  /** Hunks/sections of changes */
  hunks?: ChangeHunk[];
}

/**
 * A contiguous section of changes in a file
 */
export interface ChangeHunk {
  startLine: number;
  lineCount: number;
  /** What kind of code is this section? */
  category?: 'logic' | 'test' | 'config' | 'docs' | 'style' | 'unknown';
}

/**
 * A potential split point in the PR
 */
export interface SplitSuggestion {
  /** Files that could be grouped together */
  files: string[];
  /** Suggested PR title for this group */
  suggestedTitle: string;
  /** Reason for grouping */
  reason: string;
  /** Lines in this group */
  lines: number;
}

/**
 * Analyze PR size and provide recommendations
 */
export function analyzePRSize(
  changes: FileChange[],
  config: Partial<PRSizeConfig> = {}
): PRSizeResult {
  const logger = getLogger();
  const fullConfig: PRSizeConfig = {
    ...DEFAULT_PR_SIZE_CONFIG,
    ...config
  };
  
  // Calculate totals
  let linesAdded = 0;
  let linesRemoved = 0;
  
  for (const change of changes) {
    linesAdded += change.additions;
    linesRemoved += change.deletions;
  }
  
  const linesChanged = linesAdded + linesRemoved;
  const filesChanged = changes.length;
  
  // Determine recommendation
  let recommendation: PRSizeResult['recommendation'];
  
  if (linesChanged <= fullConfig.warnThreshold && filesChanged <= fullConfig.fileWarnThreshold) {
    recommendation = 'good';
  } else if (linesChanged <= fullConfig.errorThreshold) {
    recommendation = 'consider-splitting';
  } else {
    recommendation = 'too-large';
  }
  
  // Generate split suggestions if needed
  let suggestedSplitPoints: string[] | undefined;
  
  if (recommendation !== 'good') {
    suggestedSplitPoints = generateSplitSuggestions(changes);
  }
  
  logger.info('PR size analysis complete', {
    linesChanged,
    filesChanged,
    recommendation
  });
  
  return {
    linesAdded,
    linesRemoved,
    linesChanged,
    filesChanged,
    recommendation,
    suggestedSplitPoints
  };
}

/**
 * Generate suggestions for splitting the PR
 */
function generateSplitSuggestions(changes: FileChange[]): string[] {
  const suggestions: string[] = [];
  
  // Group by category
  const categories = categorizeChanges(changes);
  
  // Suggest splitting tests
  if (categories.test.length > 0 && categories.logic.length > 0) {
    const testLines = categories.test.reduce((sum, c) => sum + c.additions + c.deletions, 0);
    if (testLines > 50) {
      suggestions.push(
        `Consider: Submit tests separately (${testLines} lines in ${categories.test.length} test files)`
      );
    }
  }
  
  // Suggest splitting config/setup changes
  if (categories.config.length > 0) {
    const configLines = categories.config.reduce((sum, c) => sum + c.additions + c.deletions, 0);
    if (configLines > 30) {
      suggestions.push(
        `Consider: Submit config changes separately (${configLines} lines in ${categories.config.length} config files)`
      );
    }
  }
  
  // Suggest splitting documentation
  if (categories.docs.length > 0) {
    const docLines = categories.docs.reduce((sum, c) => sum + c.additions + c.deletions, 0);
    if (docLines > 50) {
      suggestions.push(
        `Consider: Submit documentation separately (${docLines} lines in ${categories.docs.length} doc files)`
      );
    }
  }
  
  // Suggest splitting by directory
  const directorySuggestions = suggestSplitByDirectory(categories.logic);
  suggestions.push(...directorySuggestions);
  
  // Suggest splitting new files
  const newFiles = changes.filter(c => c.isNew);
  if (newFiles.length >= 3) {
    const newFileLines = newFiles.reduce((sum, c) => sum + c.additions, 0);
    if (newFileLines > 100) {
      suggestions.push(
        `Consider: Submit new files in a separate PR (${newFiles.length} new files, ${newFileLines} lines)`
      );
    }
  }
  
  // Suggest splitting refactoring
  const refactorFiles = changes.filter(c => 
    !c.isNew && 
    !c.isDeleted && 
    c.additions > 20 && 
    c.deletions > 20 &&
    Math.abs(c.additions - c.deletions) < Math.min(c.additions, c.deletions) * 0.5
  );
  
  if (refactorFiles.length >= 2) {
    suggestions.push(
      `Consider: Refactoring changes could be a separate PR (${refactorFiles.length} files with significant rewrites)`
    );
  }
  
  return suggestions;
}

/**
 * Categorize changes by file type
 */
function categorizeChanges(changes: FileChange[]): Record<string, FileChange[]> {
  const categories: Record<string, FileChange[]> = {
    test: [],
    config: [],
    docs: [],
    style: [],
    logic: []
  };
  
  for (const change of changes) {
    const category = categorizeFile(change.path);
    categories[category].push(change);
  }
  
  return categories;
}

/**
 * Determine category of a file based on path
 */
function categorizeFile(path: string): string {
  const lowerPath = path.toLowerCase();
  
  // Test files
  if (
    lowerPath.includes('.test.') ||
    lowerPath.includes('.spec.') ||
    lowerPath.includes('__tests__') ||
    lowerPath.includes('/test/') ||
    lowerPath.includes('/tests/')
  ) {
    return 'test';
  }
  
  // Config files
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.yaml') ||
    lowerPath.endsWith('.yml') ||
    lowerPath.endsWith('.toml') ||
    lowerPath.endsWith('.ini') ||
    lowerPath.endsWith('.env') ||
    lowerPath.endsWith('.env.example') ||
    lowerPath.includes('config') ||
    lowerPath.endsWith('.config.js') ||
    lowerPath.endsWith('.config.ts') ||
    lowerPath.endsWith('.rc') ||
    lowerPath === 'dockerfile' ||
    lowerPath.includes('docker-compose')
  ) {
    return 'config';
  }
  
  // Documentation
  if (
    lowerPath.endsWith('.md') ||
    lowerPath.endsWith('.mdx') ||
    lowerPath.endsWith('.txt') ||
    lowerPath.endsWith('.rst') ||
    lowerPath.includes('/docs/') ||
    lowerPath.includes('/documentation/')
  ) {
    return 'docs';
  }
  
  // Style/CSS
  if (
    lowerPath.endsWith('.css') ||
    lowerPath.endsWith('.scss') ||
    lowerPath.endsWith('.sass') ||
    lowerPath.endsWith('.less') ||
    lowerPath.endsWith('.styl')
  ) {
    return 'style';
  }
  
  // Everything else is logic
  return 'logic';
}

/**
 * Suggest splitting logic files by directory
 */
function suggestSplitByDirectory(logicFiles: FileChange[]): string[] {
  const suggestions: string[] = [];
  
  // Group by top-level directory
  const byDirectory: Record<string, FileChange[]> = {};
  
  for (const file of logicFiles) {
    const parts = file.path.split('/');
    const topDir = parts.length > 1 ? parts[0] : '(root)';
    
    if (!byDirectory[topDir]) {
      byDirectory[topDir] = [];
    }
    byDirectory[topDir].push(file);
  }
  
  // Find directories with significant changes
  const significantDirs = Object.entries(byDirectory)
    .filter(([_, files]) => {
      const lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
      return lines > 100 && files.length >= 2;
    })
    .sort((a, b) => {
      const linesA = a[1].reduce((sum, f) => sum + f.additions + f.deletions, 0);
      const linesB = b[1].reduce((sum, f) => sum + f.additions + f.deletions, 0);
      return linesB - linesA;
    });
  
  if (significantDirs.length >= 2) {
    for (const [dir, files] of significantDirs.slice(0, 3)) {
      const lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
      suggestions.push(
        `Consider: Split ${dir}/ changes into separate PR (${files.length} files, ${lines} lines)`
      );
    }
  }
  
  return suggestions;
}

/**
 * Calculate complexity score for a file
 */
export function calculateFileComplexity(change: FileChange): number {
  let score = 0;
  
  // Base score from lines
  score += change.additions * 1;
  score += change.deletions * 0.5; // Deletions are easier to review
  
  // New files are harder to review
  if (change.isNew) {
    score *= 1.2;
  }
  
  // Refactoring (high adds and deletes) is harder
  if (change.additions > 20 && change.deletions > 20) {
    score *= 1.3;
  }
  
  return Math.round(score);
}
