/**
 * Review Time Estimator
 * 
 * Estimates how long a PR will take to review based on:
 * - Lines changed
 * - File complexity
 * - Reviewer familiarity with the code
 * - Number of files
 * - Type of changes (logic vs config vs tests)
 */

import { getLogger } from '../logger';
import { FileChange } from '../checklist/prSize';

// ============================================================================
// Types
// ============================================================================

/**
 * Complexity level of a file
 */
export enum ComplexityLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  VeryHigh = 'very-high'
}

/**
 * Category of file change
 */
export type ChangeCategory = 
  | 'logic'      // Core business logic
  | 'test'       // Test files
  | 'config'     // Configuration files
  | 'docs'       // Documentation
  | 'style'      // CSS/styling
  | 'types'      // Type definitions
  | 'generated'; // Auto-generated files

/**
 * Metrics for a single file
 */
export interface FileMetrics {
  path: string;
  category: ChangeCategory;
  linesChanged: number;
  complexity: ComplexityLevel;
  /** Estimated minutes to review this file */
  estimatedMinutes: number;
  /** Factors affecting the estimate */
  factors: string[];
}

/**
 * Reviewer information
 */
export interface ReviewerInfo {
  /** Reviewer identifier (email or username) */
  id: string;
  /** Files this reviewer has recently touched */
  recentFiles?: string[];
  /** Directories this reviewer owns */
  ownedPaths?: string[];
  /** Average review speed (lines per minute) */
  reviewSpeed?: number;
}

/**
 * Suggested reviewer with reasoning
 */
export interface SuggestedReviewer {
  id: string;
  /** Why this reviewer is suggested */
  reason: string;
  /** Familiarity score 0-100 */
  familiarityScore: number;
  /** Files they're familiar with in this PR */
  familiarFiles: string[];
}

/**
 * Configuration for time estimation
 */
export interface ReviewTimeConfig {
  /** Base minutes per 100 lines of code */
  baseMinutesPer100Lines: number;
  /** Multiplier for high complexity files */
  complexityMultipliers: Record<ComplexityLevel, number>;
  /** Multiplier by change category */
  categoryMultipliers: Record<ChangeCategory, number>;
  /** Additional minutes per file (context switching) */
  minutesPerFile: number;
  /** Minimum review time in minutes */
  minimumMinutes: number;
  /** Maximum reasonable review time before suggesting split */
  maxReasonableMinutes: number;
}

export const DEFAULT_REVIEW_TIME_CONFIG: ReviewTimeConfig = {
  baseMinutesPer100Lines: 10,
  complexityMultipliers: {
    [ComplexityLevel.Low]: 0.5,
    [ComplexityLevel.Medium]: 1.0,
    [ComplexityLevel.High]: 1.5,
    [ComplexityLevel.VeryHigh]: 2.0
  },
  categoryMultipliers: {
    logic: 1.5,
    test: 0.8,
    config: 0.5,
    docs: 0.3,
    style: 0.4,
    types: 0.7,
    generated: 0.1
  },
  minutesPerFile: 2,
  minimumMinutes: 5,
  maxReasonableMinutes: 60
};

/**
 * Full review time estimate
 */
export interface ReviewTimeEstimate {
  /** Total estimated minutes */
  totalMinutes: number;
  /** Formatted string like "~15 min" or "~1 hr" */
  formatted: string;
  /** Breakdown by file */
  fileBreakdown: FileMetrics[];
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
  /** Suggested reviewers */
  suggestedReviewers: SuggestedReviewer[];
  /** Warnings about the estimate */
  warnings: string[];
  /** Suggested title prefix */
  titlePrefix: string;
}

// ============================================================================
// Complexity Analysis
// ============================================================================

/**
 * Analyze complexity of a file based on content
 */
export function analyzeFileComplexity(
  content: string,
  filePath: string
): ComplexityLevel {
  // Quick heuristics for complexity
  const lines = content.split('\n');
  const lineCount = lines.length;
  
  let complexityScore = 0;
  
  // Nesting depth
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    currentNesting += opens - closes;
    maxNesting = Math.max(maxNesting, currentNesting);
  }
  if (maxNesting > 5) complexityScore += 3;
  else if (maxNesting > 3) complexityScore += 2;
  else if (maxNesting > 2) complexityScore += 1;
  
  // Cyclomatic complexity indicators
  const conditionals = (content.match(/\b(if|else|switch|case|\?|&&|\|\|)\b/g) || []).length;
  const conditionalsPerLine = conditionals / Math.max(lineCount, 1);
  if (conditionalsPerLine > 0.15) complexityScore += 3;
  else if (conditionalsPerLine > 0.1) complexityScore += 2;
  else if (conditionalsPerLine > 0.05) complexityScore += 1;
  
  // Loop complexity
  const loops = (content.match(/\b(for|while|do)\b/g) || []).length;
  if (loops > 5) complexityScore += 2;
  else if (loops > 2) complexityScore += 1;
  
  // Callback/Promise chains
  const callbacks = (content.match(/\.(then|catch|finally)\s*\(/g) || []).length;
  const asyncAwait = (content.match(/\b(async|await)\b/g) || []).length;
  if (callbacks > 5 || asyncAwait > 10) complexityScore += 2;
  else if (callbacks > 2 || asyncAwait > 5) complexityScore += 1;
  
  // Type complexity (for TypeScript)
  const generics = (content.match(/<[^>]+>/g) || []).length;
  if (generics > 20) complexityScore += 2;
  else if (generics > 10) complexityScore += 1;
  
  // Regex complexity
  const regexes = (content.match(/\/[^/]+\/[gimsuvy]*/g) || []).length;
  if (regexes > 5) complexityScore += 2;
  else if (regexes > 2) complexityScore += 1;
  
  // File size factor
  if (lineCount > 500) complexityScore += 2;
  else if (lineCount > 200) complexityScore += 1;
  
  // Map score to level
  if (complexityScore >= 8) return ComplexityLevel.VeryHigh;
  if (complexityScore >= 5) return ComplexityLevel.High;
  if (complexityScore >= 2) return ComplexityLevel.Medium;
  return ComplexityLevel.Low;
}

/**
 * Categorize a file based on path
 */
export function categorizeFile(filePath: string): ChangeCategory {
  const lowerPath = filePath.toLowerCase();
  
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
  
  // Generated files
  if (
    lowerPath.includes('.generated.') ||
    lowerPath.includes('.g.') ||
    lowerPath.includes('/generated/') ||
    lowerPath.endsWith('.d.ts') ||
    lowerPath.includes('package-lock') ||
    lowerPath.includes('yarn.lock') ||
    lowerPath.includes('pnpm-lock')
  ) {
    return 'generated';
  }
  
  // Config files
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.yaml') ||
    lowerPath.endsWith('.yml') ||
    lowerPath.endsWith('.toml') ||
    lowerPath.endsWith('.ini') ||
    lowerPath.endsWith('.env') ||
    lowerPath.includes('config') ||
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
    lowerPath.includes('/docs/')
  ) {
    return 'docs';
  }
  
  // Style files
  if (
    lowerPath.endsWith('.css') ||
    lowerPath.endsWith('.scss') ||
    lowerPath.endsWith('.sass') ||
    lowerPath.endsWith('.less') ||
    lowerPath.endsWith('.styl')
  ) {
    return 'style';
  }
  
  // Type definitions
  if (
    lowerPath.endsWith('.d.ts') ||
    lowerPath.includes('/types/') ||
    lowerPath.includes('.types.')
  ) {
    return 'types';
  }
  
  // Default to logic
  return 'logic';
}

// ============================================================================
// Time Estimation
// ============================================================================

/**
 * Estimate review time for a set of changes
 */
export function estimateReviewTime(
  changes: FileChange[],
  fileContents?: Map<string, string>,
  reviewers?: ReviewerInfo[],
  config: Partial<ReviewTimeConfig> = {}
): ReviewTimeEstimate {
  const logger = getLogger();
  const fullConfig: ReviewTimeConfig = { ...DEFAULT_REVIEW_TIME_CONFIG, ...config };
  
  const fileBreakdown: FileMetrics[] = [];
  const warnings: string[] = [];
  let totalMinutes = 0;
  
  for (const change of changes) {
    if (change.isDeleted) continue;
    
    const category = categorizeFile(change.path);
    const linesChanged = change.additions + change.deletions;
    
    // Get complexity from content if available
    let complexity = ComplexityLevel.Medium;
    if (fileContents?.has(change.path)) {
      complexity = analyzeFileComplexity(fileContents.get(change.path)!, change.path);
    }
    
    // Calculate time for this file
    const baseTime = (linesChanged / 100) * fullConfig.baseMinutesPer100Lines;
    const complexityMultiplier = fullConfig.complexityMultipliers[complexity];
    const categoryMultiplier = fullConfig.categoryMultipliers[category];
    
    let fileMinutes = baseTime * complexityMultiplier * categoryMultiplier;
    fileMinutes += fullConfig.minutesPerFile; // Context switching overhead
    fileMinutes = Math.max(1, fileMinutes); // At least 1 minute per file
    
    const factors: string[] = [];
    if (complexityMultiplier > 1) factors.push(`High complexity (${complexity})`);
    if (categoryMultiplier < 1) factors.push(`${category} file (faster review)`);
    if (categoryMultiplier > 1) factors.push(`${category} file (careful review needed)`);
    if (linesChanged > 200) factors.push('Large file change');
    
    fileBreakdown.push({
      path: change.path,
      category,
      linesChanged,
      complexity,
      estimatedMinutes: Math.round(fileMinutes),
      factors
    });
    
    totalMinutes += fileMinutes;
  }
  
  // Apply minimum
  totalMinutes = Math.max(fullConfig.minimumMinutes, totalMinutes);
  
  // Round to nice numbers
  totalMinutes = roundToNiceNumber(totalMinutes);
  
  // Generate warnings
  if (totalMinutes > fullConfig.maxReasonableMinutes) {
    warnings.push(`Review time exceeds ${fullConfig.maxReasonableMinutes} minutes - consider splitting PR`);
  }
  
  const logicFiles = fileBreakdown.filter(f => f.category === 'logic');
  if (logicFiles.length > 10) {
    warnings.push('Many logic files changed - ensure thorough review');
  }
  
  const veryHighComplexity = fileBreakdown.filter(f => f.complexity === ComplexityLevel.VeryHigh);
  if (veryHighComplexity.length > 0) {
    warnings.push(`${veryHighComplexity.length} file(s) have very high complexity`);
  }
  
  // Calculate confidence
  let confidence: ReviewTimeEstimate['confidence'] = 'medium';
  if (fileContents && fileContents.size === changes.length) {
    confidence = 'high'; // We have content for all files
  } else if (!fileContents || fileContents.size === 0) {
    confidence = 'low'; // No content analysis
  }
  
  // Get suggested reviewers
  const suggestedReviewers = reviewers 
    ? suggestReviewers(changes, reviewers)
    : [];
  
  // Format the time
  const formatted = formatTime(totalMinutes);
  const titlePrefix = `[~${formatted} review]`;
  
  logger.info('Review time estimate complete', {
    totalMinutes,
    fileCount: changes.length,
    confidence
  });
  
  return {
    totalMinutes: Math.round(totalMinutes),
    formatted,
    fileBreakdown,
    confidence,
    suggestedReviewers,
    warnings,
    titlePrefix
  };
}

/**
 * Round to nice human-friendly numbers
 */
function roundToNiceNumber(minutes: number): number {
  if (minutes <= 5) return 5;
  if (minutes <= 10) return 10;
  if (minutes <= 15) return 15;
  if (minutes <= 20) return 20;
  if (minutes <= 30) return 30;
  if (minutes <= 45) return 45;
  if (minutes <= 60) return 60;
  if (minutes <= 90) return 90;
  return Math.ceil(minutes / 30) * 30; // Round to nearest 30 min
}

/**
 * Format minutes to human-readable string
 */
function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return hours === 1 ? '1 hr' : `${hours} hrs`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

// ============================================================================
// Reviewer Suggestions
// ============================================================================

/**
 * Suggest reviewers based on file ownership and familiarity
 */
function suggestReviewers(
  changes: FileChange[],
  reviewers: ReviewerInfo[]
): SuggestedReviewer[] {
  const suggestions: SuggestedReviewer[] = [];
  
  for (const reviewer of reviewers) {
    let familiarityScore = 0;
    const familiarFiles: string[] = [];
    const reasons: string[] = [];
    
    for (const change of changes) {
      // Check owned paths
      if (reviewer.ownedPaths) {
        for (const owned of reviewer.ownedPaths) {
          if (change.path.startsWith(owned)) {
            familiarityScore += 30;
            familiarFiles.push(change.path);
            if (!reasons.includes('Code owner')) {
              reasons.push('Code owner');
            }
          }
        }
      }
      
      // Check recent files
      if (reviewer.recentFiles) {
        if (reviewer.recentFiles.includes(change.path)) {
          familiarityScore += 20;
          if (!familiarFiles.includes(change.path)) {
            familiarFiles.push(change.path);
          }
          if (!reasons.includes('Recently worked on these files')) {
            reasons.push('Recently worked on these files');
          }
        }
        
        // Check same directory
        const changeDir = change.path.split('/').slice(0, -1).join('/');
        const hasRecentInDir = reviewer.recentFiles.some(f => 
          f.startsWith(changeDir + '/')
        );
        if (hasRecentInDir) {
          familiarityScore += 10;
          if (!reasons.includes('Familiar with this area')) {
            reasons.push('Familiar with this area');
          }
        }
      }
    }
    
    // Cap at 100
    familiarityScore = Math.min(100, familiarityScore);
    
    if (familiarityScore > 0) {
      suggestions.push({
        id: reviewer.id,
        reason: reasons.join(', '),
        familiarityScore,
        familiarFiles
      });
    }
  }
  
  // Sort by familiarity score
  return suggestions.sort((a, b) => b.familiarityScore - a.familiarityScore);
}

/**
 * Track actual vs estimated review times for model improvement
 */
export interface ReviewTimeTracking {
  prId: string;
  estimatedMinutes: number;
  actualMinutes: number;
  fileCount: number;
  linesChanged: number;
  timestamp: Date;
}

/**
 * Calculate accuracy of estimates over time
 */
export function calculateEstimateAccuracy(
  trackingData: ReviewTimeTracking[]
): {
  averageError: number;
  averageErrorPercent: number;
  underestimateRate: number;
  suggestions: string[];
} {
  if (trackingData.length === 0) {
    return {
      averageError: 0,
      averageErrorPercent: 0,
      underestimateRate: 0,
      suggestions: ['No tracking data available']
    };
  }
  
  let totalError = 0;
  let totalErrorPercent = 0;
  let underestimates = 0;
  
  for (const data of trackingData) {
    const error = data.actualMinutes - data.estimatedMinutes;
    totalError += Math.abs(error);
    totalErrorPercent += Math.abs(error) / Math.max(data.actualMinutes, 1) * 100;
    if (error > 0) underestimates++;
  }
  
  const averageError = totalError / trackingData.length;
  const averageErrorPercent = totalErrorPercent / trackingData.length;
  const underestimateRate = underestimates / trackingData.length;
  
  const suggestions: string[] = [];
  if (underestimateRate > 0.6) {
    suggestions.push('Estimates tend to be too low - consider increasing base time');
  }
  if (underestimateRate < 0.4) {
    suggestions.push('Estimates tend to be too high - consider decreasing base time');
  }
  if (averageErrorPercent > 50) {
    suggestions.push('High variance in estimates - consider more factors');
  }
  
  return {
    averageError: Math.round(averageError),
    averageErrorPercent: Math.round(averageErrorPercent),
    underestimateRate: Math.round(underestimateRate * 100) / 100,
    suggestions
  };
}
