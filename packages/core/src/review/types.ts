/**
 * Review Time Estimator Types
 * 
 * Types for estimating PR review time and suggesting reviewers.
 */

/**
 * Complexity level for code changes
 */
export enum ComplexityLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  VeryHigh = 'very-high'
}

/**
 * Factors that affect review time
 */
export interface ReviewFactors {
  /** Total lines added */
  linesAdded: number;
  /** Total lines removed */
  linesRemoved: number;
  /** Number of files changed */
  filesChanged: number;
  /** Average cyclomatic complexity of changed code */
  avgComplexity: number;
  /** Maximum nesting depth in changes */
  maxNestingDepth: number;
  /** Number of new functions/classes introduced */
  newSymbols: number;
  /** Whether changes touch critical paths (auth, payments, etc) */
  touchesCriticalPath: boolean;
  /** Number of test files included */
  testFilesCount: number;
  /** Whether this is primarily a refactor */
  isRefactor: boolean;
  /** Number of external dependencies touched */
  dependencyChanges: number;
}

/**
 * Information about a potential reviewer
 */
export interface ReviewerInfo {
  /** Username/email */
  id: string;
  /** Display name */
  name?: string;
  /** Number of lines this person authored in changed files */
  linesAuthored: number;
  /** Percentage of changed files they've touched */
  filesFamiliarityPercent: number;
  /** Recent review load (reviews in last 7 days) */
  recentReviewCount: number;
  /** Average review turnaround time in hours */
  avgTurnaroundHours: number;
  /** Areas of expertise based on commit history */
  expertise: string[];
  /** Overall score (higher = better match) */
  score: number;
}

/**
 * Review time estimate result
 */
export interface ReviewTimeEstimate {
  /** Estimated minutes to review */
  estimatedMinutes: number;
  /** Confidence level (0-100) */
  confidence: number;
  /** Human-readable estimate */
  displayTime: string;
  /** Breakdown by factor */
  breakdown: {
    baseTime: number;
    complexityMultiplier: number;
    sizeMultiplier: number;
    criticalPathMultiplier: number;
  };
  /** Complexity assessment */
  complexity: ComplexityLevel;
  /** Suggested PR title prefix */
  titlePrefix: string;
  /** Warnings about the PR */
  warnings: string[];
  /** Suggestions for the author */
  suggestions: string[];
}

/**
 * Suggested reviewers result
 */
export interface ReviewerSuggestion {
  /** Ranked list of suggested reviewers */
  reviewers: ReviewerInfo[];
  /** Minimum reviewers recommended */
  minReviewers: number;
  /** Reasoning for suggestions */
  reasoning: string[];
}

/**
 * Configuration for review estimation
 */
export interface ReviewEstimatorConfig {
  /** Base minutes per 100 lines of code */
  baseMinutesPer100Lines: number;
  /** Multiplier for high complexity code */
  complexityMultipliers: {
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
  };
  /** Patterns for critical paths */
  criticalPathPatterns: string[];
  /** Maximum reasonable review time (minutes) */
  maxReviewMinutes: number;
  /** Weight factors for reviewer scoring */
  reviewerWeights: {
    familiarity: number;
    availability: number;
    expertise: number;
    recentActivity: number;
  };
}

export const DEFAULT_ESTIMATOR_CONFIG: ReviewEstimatorConfig = {
  baseMinutesPer100Lines: 15,
  complexityMultipliers: {
    low: 0.8,
    medium: 1.0,
    high: 1.5,
    veryHigh: 2.0
  },
  criticalPathPatterns: [
    '**/auth/**',
    '**/payment/**',
    '**/security/**',
    '**/crypto/**',
    '**/*password*',
    '**/*secret*',
    '**/*token*'
  ],
  maxReviewMinutes: 120,
  reviewerWeights: {
    familiarity: 0.4,
    availability: 0.25,
    expertise: 0.25,
    recentActivity: 0.1
  }
};

/**
 * Historical data for calibration
 */
export interface ReviewHistoryEntry {
  /** PR identifier */
  prId: string;
  /** Estimated time */
  estimatedMinutes: number;
  /** Actual review time */
  actualMinutes: number;
  /** Factors at time of estimation */
  factors: ReviewFactors;
  /** Reviewer who completed the review */
  reviewer: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Calibration data for improving estimates
 */
export interface EstimatorCalibration {
  /** Total reviews tracked */
  totalReviews: number;
  /** Average error percentage */
  avgErrorPercent: number;
  /** Adjustment factor based on history */
  adjustmentFactor: number;
  /** Last calibration date */
  lastCalibrated: Date;
}
