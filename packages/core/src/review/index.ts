/**
 * Review Module
 * 
 * Tools for optimizing the code review process:
 * - Review time estimation
 * - Flaky test detection
 * - Reviewer suggestions
 */

// Legacy types (for backward compatibility)
export {
  ComplexityLevel as LegacyComplexityLevel,
  DEFAULT_ESTIMATOR_CONFIG
} from './types';
export type {
  ReviewFactors,
  ReviewerSuggestion,
  ReviewEstimatorConfig,
  ReviewHistoryEntry,
  EstimatorCalibration
} from './types';

// Review Time Estimator
export {
  estimateReviewTime,
  analyzeFileComplexity,
  categorizeFile,
  calculateEstimateAccuracy,
  ComplexityLevel,
  DEFAULT_REVIEW_TIME_CONFIG
} from './estimator';
export type {
  ChangeCategory,
  FileMetrics,
  ReviewerInfo,
  SuggestedReviewer,
  ReviewTimeConfig,
  ReviewTimeEstimate,
  ReviewTimeTracking
} from './estimator';

// Flaky Test Detective
export {
  FlakyTestDetective,
  parseJestResults,
  parseVitestResults,
  DEFAULT_FLAKY_CONFIG
} from './flakyDetective';
export type {
  TestRunResult,
  TestHistory,
  RootCauseHint,
  RootCauseType,
  FlakyTestConfig,
  FlakyTestReport
} from './flakyDetective';
