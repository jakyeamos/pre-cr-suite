/**
 * Flaky Test Detective
 * 
 * Identifies and tracks flaky tests:
 * - Tracks pass/fail history across runs
 * - Calculates flakiness scores
 * - Identifies root cause patterns
 * - Optional quarantine mode
 */

import { getLogger } from '../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a single test run
 */
export interface TestRunResult {
  /** Test identifier (file:testName) */
  testId: string;
  /** Test file path */
  file: string;
  /** Test name/description */
  name: string;
  /** Whether it passed */
  passed: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Stack trace if failed */
  stack?: string;
  /** Timestamp of run */
  timestamp: Date;
  /** CI run ID if applicable */
  runId?: string;
}

/**
 * Aggregated test history
 */
export interface TestHistory {
  testId: string;
  file: string;
  name: string;
  /** Total runs tracked */
  totalRuns: number;
  /** Number of passes */
  passes: number;
  /** Number of failures */
  failures: number;
  /** Flakiness score (0-1, higher = more flaky) */
  flakinessScore: number;
  /** Is this test considered flaky? */
  isFlaky: boolean;
  /** Average duration in ms */
  averageDuration: number;
  /** Duration variance (high variance can indicate flakiness) */
  durationVariance: number;
  /** Recent results (most recent first) */
  recentResults: Array<{ passed: boolean; timestamp: Date; duration: number }>;
  /** Detected root cause patterns */
  rootCauseHints: RootCauseHint[];
  /** First seen */
  firstSeen: Date;
  /** Last seen */
  lastSeen: Date;
}

/**
 * Possible root cause for flakiness
 */
export interface RootCauseHint {
  type: RootCauseType;
  confidence: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

/**
 * Types of root causes
 */
export type RootCauseType =
  | 'timing'           // Race conditions, timeouts
  | 'shared-state'     // Tests affecting each other
  | 'network'          // External service dependencies
  | 'random'           // Non-deterministic behavior
  | 'resource'         // Resource exhaustion
  | 'environment'      // Environment-specific issues
  | 'order-dependent'  // Test order matters
  | 'time-sensitive'   // Date/time dependent
  | 'unknown';

/**
 * Configuration for flaky test detection
 */
export interface FlakyTestConfig {
  /** Minimum runs before calculating flakiness */
  minRuns: number;
  /** Failure rate threshold to be considered flaky (0-1) */
  flakinessThreshold: number;
  /** Days of history to consider */
  historyDays: number;
  /** Enable quarantine mode */
  quarantineEnabled: boolean;
  /** Auto-skip quarantined tests */
  autoSkipQuarantined: boolean;
  /** Duration variance threshold for timing issues */
  durationVarianceThreshold: number;
}

export const DEFAULT_FLAKY_CONFIG: FlakyTestConfig = {
  minRuns: 5,
  flakinessThreshold: 0.1, // 10% failure rate
  historyDays: 30,
  quarantineEnabled: false,
  autoSkipQuarantined: false,
  durationVarianceThreshold: 0.5 // 50% variance
};

/**
 * Flaky test report for a test suite
 */
export interface FlakyTestReport {
  /** Timestamp of report */
  timestamp: Date;
  /** Total tests tracked */
  totalTests: number;
  /** Number of flaky tests */
  flakyCount: number;
  /** Flaky test percentage */
  flakyPercentage: number;
  /** Tests by flakiness (most flaky first) */
  flakyTests: TestHistory[];
  /** Tests in quarantine */
  quarantinedTests: string[];
  /** Root cause breakdown */
  rootCauseBreakdown: Record<RootCauseType, number>;
  /** Overall suite health score (0-100) */
  healthScore: number;
  /** Recommendations */
  recommendations: string[];
}

// ============================================================================
// Flaky Test Detection
// ============================================================================

/**
 * In-memory test history store
 */
export class FlakyTestDetective {
  private history: Map<string, TestHistory> = new Map();
  private config: FlakyTestConfig;
  private quarantined: Set<string> = new Set();
  
  constructor(config: Partial<FlakyTestConfig> = {}) {
    this.config = { ...DEFAULT_FLAKY_CONFIG, ...config };
  }
  
  /**
   * Record a test result
   */
  recordResult(result: TestRunResult): void {
    const logger = getLogger();
    
    let testHistory = this.history.get(result.testId);
    
    if (!testHistory) {
      testHistory = {
        testId: result.testId,
        file: result.file,
        name: result.name,
        totalRuns: 0,
        passes: 0,
        failures: 0,
        flakinessScore: 0,
        isFlaky: false,
        averageDuration: 0,
        durationVariance: 0,
        recentResults: [],
        rootCauseHints: [],
        firstSeen: result.timestamp,
        lastSeen: result.timestamp
      };
      this.history.set(result.testId, testHistory);
    }
    
    // Update stats
    testHistory.totalRuns++;
    if (result.passed) {
      testHistory.passes++;
    } else {
      testHistory.failures++;
    }
    testHistory.lastSeen = result.timestamp;
    
    // Add to recent results (keep last 20)
    testHistory.recentResults.unshift({
      passed: result.passed,
      timestamp: result.timestamp,
      duration: result.duration
    });
    if (testHistory.recentResults.length > 20) {
      testHistory.recentResults.pop();
    }
    
    // Update duration stats
    this.updateDurationStats(testHistory, result.duration);
    
    // Calculate flakiness
    this.calculateFlakiness(testHistory);
    
    // Detect root causes
    if (testHistory.isFlaky) {
      this.detectRootCauses(testHistory, result);
    }
    
    logger.debug('Recorded test result', {
      testId: result.testId,
      passed: result.passed,
      flakinessScore: testHistory.flakinessScore
    });
  }
  
  /**
   * Record multiple results at once
   */
  recordResults(results: TestRunResult[]): void {
    for (const result of results) {
      this.recordResult(result);
    }
  }
  
  /**
   * Get history for a specific test
   */
  getTestHistory(testId: string): TestHistory | undefined {
    return this.history.get(testId);
  }
  
  /**
   * Get all flaky tests
   */
  getFlakyTests(): TestHistory[] {
    return Array.from(this.history.values())
      .filter(h => h.isFlaky)
      .sort((a, b) => b.flakinessScore - a.flakinessScore);
  }
  
  /**
   * Check if a test is quarantined
   */
  isQuarantined(testId: string): boolean {
    return this.quarantined.has(testId);
  }
  
  /**
   * Quarantine a test
   */
  quarantine(testId: string): void {
    if (this.config.quarantineEnabled) {
      this.quarantined.add(testId);
    }
  }
  
  /**
   * Remove test from quarantine
   */
  unquarantine(testId: string): void {
    this.quarantined.delete(testId);
  }
  
  /**
   * Get tests that should be skipped (if auto-skip enabled)
   */
  getTestsToSkip(): string[] {
    if (!this.config.autoSkipQuarantined) {
      return [];
    }
    return Array.from(this.quarantined);
  }
  
  /**
   * Generate a flaky test report
   */
  generateReport(): FlakyTestReport {
    const logger = getLogger();
    
    const allTests = Array.from(this.history.values());
    const flakyTests = this.getFlakyTests();
    
    // Root cause breakdown
    const rootCauseBreakdown: Record<RootCauseType, number> = {
      timing: 0,
      'shared-state': 0,
      network: 0,
      random: 0,
      resource: 0,
      environment: 0,
      'order-dependent': 0,
      'time-sensitive': 0,
      unknown: 0
    };
    
    for (const test of flakyTests) {
      for (const hint of test.rootCauseHints) {
        rootCauseBreakdown[hint.type]++;
      }
      if (test.rootCauseHints.length === 0) {
        rootCauseBreakdown.unknown++;
      }
    }
    
    // Calculate health score
    const flakyPercentage = allTests.length > 0 
      ? (flakyTests.length / allTests.length) * 100 
      : 0;
    
    // Health score: 100 - (flaky% * 2), minimum 0
    const healthScore = Math.max(0, Math.round(100 - flakyPercentage * 2));
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(flakyTests, rootCauseBreakdown);
    
    logger.info('Generated flaky test report', {
      totalTests: allTests.length,
      flakyCount: flakyTests.length,
      healthScore
    });
    
    return {
      timestamp: new Date(),
      totalTests: allTests.length,
      flakyCount: flakyTests.length,
      flakyPercentage: Math.round(flakyPercentage * 10) / 10,
      flakyTests,
      quarantinedTests: Array.from(this.quarantined),
      rootCauseBreakdown,
      healthScore,
      recommendations
    };
  }
  
  /**
   * Import history from JSON
   */
  importHistory(data: TestHistory[]): void {
    for (const item of data) {
      this.history.set(item.testId, {
        ...item,
        firstSeen: new Date(item.firstSeen),
        lastSeen: new Date(item.lastSeen),
        recentResults: item.recentResults.map(r => ({
          ...r,
          timestamp: new Date(r.timestamp)
        }))
      });
    }
  }
  
  /**
   * Export history to JSON
   */
  exportHistory(): TestHistory[] {
    return Array.from(this.history.values());
  }
  
  /**
   * Clear old history
   */
  pruneHistory(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.historyDays);
    
    let pruned = 0;
    for (const [testId, history] of this.history) {
      if (history.lastSeen < cutoff) {
        this.history.delete(testId);
        pruned++;
      }
    }
    
    return pruned;
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private updateDurationStats(history: TestHistory, newDuration: number): void {
    const runs = history.totalRuns;
    
    // Update average
    const oldAverage = history.averageDuration;
    history.averageDuration = oldAverage + (newDuration - oldAverage) / runs;
    
    // Update variance using Welford's algorithm
    if (runs > 1) {
      const diff = newDuration - oldAverage;
      const diff2 = newDuration - history.averageDuration;
      const oldVariance = history.durationVariance * (runs - 2);
      history.durationVariance = (oldVariance + diff * diff2) / (runs - 1);
    }
  }
  
  private calculateFlakiness(history: TestHistory): void {
    // Need minimum runs to calculate
    if (history.totalRuns < this.config.minRuns) {
      history.flakinessScore = 0;
      history.isFlaky = false;
      return;
    }
    
    // Simple failure rate
    const failureRate = history.failures / history.totalRuns;
    
    // A test is flaky if it sometimes passes and sometimes fails
    // Pure failures or pure passes are not flaky
    const hasBothOutcomes = history.passes > 0 && history.failures > 0;
    
    if (!hasBothOutcomes) {
      history.flakinessScore = 0;
      history.isFlaky = false;
      return;
    }
    
    // Flakiness score: how unpredictable is it?
    // Maximum flakiness at 50% failure rate
    history.flakinessScore = 1 - Math.abs(0.5 - failureRate) * 2;
    
    // Check recent results for patterns
    const recentFailures = history.recentResults
      .slice(0, 10)
      .filter(r => !r.passed).length;
    const recentRate = recentFailures / Math.min(10, history.recentResults.length);
    
    // Weight recent results more heavily
    history.flakinessScore = (history.flakinessScore + recentRate) / 2;
    
    // Is it flaky?
    history.isFlaky = failureRate >= this.config.flakinessThreshold &&
                      failureRate <= (1 - this.config.flakinessThreshold);
  }
  
  private detectRootCauses(history: TestHistory, result: TestRunResult): void {
    const hints: RootCauseHint[] = [];
    
    // High duration variance suggests timing issues
    const avgDuration = history.averageDuration;
    const variance = history.durationVariance;
    const coefficientOfVariation = Math.sqrt(variance) / avgDuration;
    
    if (coefficientOfVariation > this.config.durationVarianceThreshold) {
      hints.push({
        type: 'timing',
        confidence: coefficientOfVariation > 1 ? 'high' : 'medium',
        description: 'High duration variance suggests timing-related issues',
        suggestion: 'Check for race conditions, increase timeouts, or use explicit waits'
      });
    }
    
    // Check error messages for patterns
    if (result.error) {
      const errorLower = result.error.toLowerCase();
      
      if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
        hints.push({
          type: 'timing',
          confidence: 'high',
          description: 'Test timed out',
          suggestion: 'Increase timeout or investigate slow operations'
        });
      }
      
      if (errorLower.includes('econnrefused') || 
          errorLower.includes('network') ||
          errorLower.includes('fetch')) {
        hints.push({
          type: 'network',
          confidence: 'high',
          description: 'Network-related failure',
          suggestion: 'Mock external services or ensure they are available'
        });
      }
      
      if (errorLower.includes('enoent') || 
          errorLower.includes('not found') ||
          errorLower.includes('undefined')) {
        hints.push({
          type: 'shared-state',
          confidence: 'medium',
          description: 'Resource not found - possible shared state issue',
          suggestion: 'Ensure proper test isolation and setup'
        });
      }
      
      if (errorLower.includes('date') || 
          errorLower.includes('time') ||
          errorLower.includes('timestamp')) {
        hints.push({
          type: 'time-sensitive',
          confidence: 'medium',
          description: 'Time-related assertion failure',
          suggestion: 'Mock Date/time or use relative comparisons'
        });
      }
      
      if (errorLower.includes('random') || 
          errorLower.includes('uuid') ||
          errorLower.includes('math.random')) {
        hints.push({
          type: 'random',
          confidence: 'medium',
          description: 'Non-deterministic behavior detected',
          suggestion: 'Seed random number generators or mock random values'
        });
      }
    }
    
    // Check for order-dependent patterns
    const recentPattern = history.recentResults.slice(0, 10).map(r => r.passed);
    const alternating = recentPattern.every((v, i, arr) => 
      i === 0 || v !== arr[i - 1]
    );
    if (alternating && history.recentResults.length >= 6) {
      hints.push({
        type: 'order-dependent',
        confidence: 'medium',
        description: 'Alternating pass/fail pattern suggests order dependency',
        suggestion: 'Run tests in isolation or fix shared state cleanup'
      });
    }
    
    // Default hint if nothing detected
    if (hints.length === 0 && history.isFlaky) {
      hints.push({
        type: 'unknown',
        confidence: 'low',
        description: 'Flaky behavior detected but cause unclear',
        suggestion: 'Add logging to identify failure patterns'
      });
    }
    
    history.rootCauseHints = hints;
  }
  
  private generateRecommendations(
    flakyTests: TestHistory[],
    rootCauses: Record<RootCauseType, number>
  ): string[] {
    const recommendations: string[] = [];
    
    if (flakyTests.length === 0) {
      recommendations.push('No flaky tests detected - great job!');
      return recommendations;
    }
    
    // General recommendations based on count
    if (flakyTests.length > 10) {
      recommendations.push('High number of flaky tests - consider a dedicated cleanup sprint');
    }
    
    // Root cause specific recommendations
    if (rootCauses.timing > 3) {
      recommendations.push('Multiple timing issues - review async handling and timeouts');
    }
    
    if (rootCauses.network > 2) {
      recommendations.push('Network dependencies causing issues - implement better mocking');
    }
    
    if (rootCauses['shared-state'] > 2) {
      recommendations.push('Shared state issues detected - improve test isolation');
    }
    
    if (rootCauses['order-dependent'] > 1) {
      recommendations.push('Order-dependent tests found - ensure proper cleanup between tests');
    }
    
    // Top offenders
    const topFlaky = flakyTests.slice(0, 3);
    if (topFlaky.length > 0) {
      recommendations.push(
        `Prioritize fixing: ${topFlaky.map(t => t.name).join(', ')}`
      );
    }
    
    return recommendations;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse test results from common formats
 */
export function parseJestResults(jestOutput: {
  testResults: Array<{
    testFilePath: string;
    testResults: Array<{
      title: string;
      status: 'passed' | 'failed' | 'pending';
      duration: number;
      failureMessages: string[];
    }>;
  }>;
  startTime: number;
}): TestRunResult[] {
  const results: TestRunResult[] = [];
  const timestamp = new Date(jestOutput.startTime);
  
  for (const fileResult of jestOutput.testResults) {
    for (const testResult of fileResult.testResults) {
      if (testResult.status === 'pending') continue;
      
      results.push({
        testId: `${fileResult.testFilePath}:${testResult.title}`,
        file: fileResult.testFilePath,
        name: testResult.title,
        passed: testResult.status === 'passed',
        duration: testResult.duration || 0,
        error: testResult.failureMessages.join('\n') || undefined,
        timestamp
      });
    }
  }
  
  return results;
}

/**
 * Parse test results from Vitest JSON output
 */
export function parseVitestResults(vitestOutput: {
  testResults: Array<{
    name: string;
    assertionResults: Array<{
      fullName: string;
      status: 'passed' | 'failed';
      duration: number;
      failureMessages?: string[];
    }>;
  }>;
  startTime: number;
}): TestRunResult[] {
  const results: TestRunResult[] = [];
  const timestamp = new Date(vitestOutput.startTime);
  
  for (const fileResult of vitestOutput.testResults) {
    for (const testResult of fileResult.assertionResults) {
      results.push({
        testId: `${fileResult.name}:${testResult.fullName}`,
        file: fileResult.name,
        name: testResult.fullName,
        passed: testResult.status === 'passed',
        duration: testResult.duration || 0,
        error: testResult.failureMessages?.join('\n'),
        timestamp
      });
    }
  }
  
  return results;
}
