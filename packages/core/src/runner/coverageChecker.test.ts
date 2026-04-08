/**
 * Coverage Checker Tests
 */

import { describe, it, expect } from 'vitest';
import { 
  checkChangesCoverage, 
  formatCoverageReport, 
  getShortSummary,
  ChangedFile,
  CoverageCheckResult
} from './coverageChecker';
import { WorkspaceCoverage, LineCoverageStatus, createEmptySummary } from '../types';

// Helper to create line coverage
function createLineCoverage(lineNum: number, count: number) {
  return {
    lineNumber: lineNum,
    status: count > 0 ? LineCoverageStatus.Covered : LineCoverageStatus.Uncovered,
    executionCount: count
  };
}

// Helper to create file coverage
function createFileCoverage(path: string, lines: [number, number][]) {
  const lineMap = new Map<number, any>();
  for (const [lineNum, count] of lines) {
    lineMap.set(lineNum, createLineCoverage(lineNum, count));
  }
  return {
    filePath: path,
    lines: lineMap,
    functions: [],
    summary: createEmptySummary()
  };
}

describe('Coverage Checker', () => {
  // Sample coverage data
  const createSampleCoverage = (): WorkspaceCoverage => {
    const files = new Map();
    files.set('src/utils.ts', createFileCoverage('src/utils.ts', [
      [1, 1],   // covered
      [2, 1],   // covered
      [3, 0],   // not covered
      [4, 1],   // covered
      [5, 0],   // not covered
      [10, 1],  // covered
      [11, 1],  // covered
      [12, 1],  // covered
    ]));
    files.set('src/api.ts', createFileCoverage('src/api.ts', [
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 0],
      [5, 0],
    ]));
    
    return {
      files,
      summary: createEmptySummary(),
      loadedAt: new Date(),
      format: 'lcov'
    };
  };

  describe('checkChangesCoverage', () => {
    it('should pass when all changed lines are covered', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.ts',
        additions: [1, 2],
        modifications: [4],
        isNew: false
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage(), { threshold: 80 });
      
      expect(result.passed).toBe(true);
      expect(result.coveragePercent).toBe(100);
      expect(result.summary.coveredLines).toBe(3);
      expect(result.summary.uncoveredLines).toBe(0);
    });

    it('should fail when coverage is below threshold', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.ts',
        additions: [1, 2, 3, 4, 5], // lines 3 and 5 are uncovered
        modifications: [],
        isNew: false
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage(), { threshold: 80 });
      
      expect(result.passed).toBe(false);
      expect(result.coveragePercent).toBe(60); // 3/5 = 60%
      expect(result.summary.uncoveredLines).toBe(2);
    });

    it('should report uncovered line details', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.ts',
        additions: [3, 5],
        modifications: [],
        isNew: false
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage());
      
      expect(result.uncoveredDetails).toHaveLength(2);
      expect(result.uncoveredDetails[0]).toEqual({
        file: 'src/utils.ts',
        line: 3,
        reason: 'not-covered'
      });
    });

    it('should handle multiple files', () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'src/utils.ts',
          additions: [1, 2],
          modifications: [],
          isNew: false
        },
        {
          path: 'src/api.ts',
          additions: [1, 2, 3],
          modifications: [],
          isNew: false
        }
      ];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage());
      
      expect(result.fileBreakdown).toHaveLength(2);
      expect(result.summary.totalChangedLines).toBe(5);
      expect(result.summary.coveredLines).toBe(5);
    });

    it('should handle files with no coverage data', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/newfile.ts',
        additions: [1, 2, 3],
        modifications: [],
        isNew: true
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage(), { 
        includeNewFiles: true 
      });
      
      expect(result.passed).toBe(false);
      expect(result.summary.uncoveredLines).toBe(3);
      expect(result.uncoveredDetails[0].reason).toBe('no-coverage-data');
    });

    it('should skip test files by default', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.test.ts',
        additions: [1, 2, 3],
        modifications: [],
        isNew: false
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage());
      
      expect(result.summary.totalChangedLines).toBe(0);
      expect(result.passed).toBe(true);
    });

    it('should handle custom threshold', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.ts',
        additions: [1, 2, 3], // 2/3 = 66.7% covered
        modifications: [],
        isNew: false
      }];

      // Should fail with 80% threshold
      const result80 = checkChangesCoverage(changedFiles, createSampleCoverage(), { threshold: 80 });
      expect(result80.passed).toBe(false);

      // Should pass with 60% threshold
      const result60 = checkChangesCoverage(changedFiles, createSampleCoverage(), { threshold: 60 });
      expect(result60.passed).toBe(true);
    });

    it('should skip lines not in coverage data (non-executable)', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.ts',
        additions: [1, 2, 6, 7, 8], // lines 6-8 not in coverage data
        modifications: [],
        isNew: false
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage());
      
      // Only lines 1, 2 should be counted
      expect(result.summary.totalChangedLines).toBe(2);
      expect(result.summary.skippedLines).toBe(3);
    });

    it('should handle empty changed files', () => {
      const result = checkChangesCoverage([], createSampleCoverage());
      
      expect(result.passed).toBe(true);
      expect(result.coveragePercent).toBe(100);
    });

    it('should handle files with only modifications', () => {
      const changedFiles: ChangedFile[] = [{
        path: 'src/utils.ts',
        additions: [],
        modifications: [10, 11, 12],
        isNew: false
      }];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage());
      
      expect(result.summary.totalChangedLines).toBe(3);
      expect(result.summary.coveredLines).toBe(3);
      expect(result.passed).toBe(true);
    });
  });

  describe('formatCoverageReport', () => {
    it('should format passing result', () => {
      const result: CoverageCheckResult = {
        passed: true,
        coveragePercent: 95,
        threshold: 80,
        summary: {
          totalChangedLines: 20,
          coveredLines: 19,
          uncoveredLines: 1,
          skippedLines: 5
        },
        uncoveredDetails: [],
        fileBreakdown: []
      };

      const report = formatCoverageReport(result);
      
      expect(report).toContain('✅ PASSED');
      expect(report).toContain('95%');
      expect(report).toContain('threshold: 80%');
    });

    it('should format failing result', () => {
      const result: CoverageCheckResult = {
        passed: false,
        coveragePercent: 50,
        threshold: 80,
        summary: {
          totalChangedLines: 10,
          coveredLines: 5,
          uncoveredLines: 5,
          skippedLines: 0
        },
        uncoveredDetails: [
          { file: 'src/test.ts', line: 5, reason: 'not-covered' }
        ],
        fileBreakdown: []
      };

      const report = formatCoverageReport(result);
      
      expect(report).toContain('❌ FAILED');
      expect(report).toContain('50%');
      expect(report).toContain('src/test.ts:5');
    });
  });

  describe('getShortSummary', () => {
    it('should return passing summary', () => {
      const result: CoverageCheckResult = {
        passed: true,
        coveragePercent: 85,
        threshold: 80,
        summary: { totalChangedLines: 10, coveredLines: 8, uncoveredLines: 2, skippedLines: 0 },
        uncoveredDetails: [],
        fileBreakdown: []
      };

      expect(getShortSummary(result)).toBe('✅ Coverage: 85%');
    });

    it('should return failing summary', () => {
      const result: CoverageCheckResult = {
        passed: false,
        coveragePercent: 65,
        threshold: 80,
        summary: { totalChangedLines: 10, coveredLines: 6, uncoveredLines: 4, skippedLines: 0 },
        uncoveredDetails: [],
        fileBreakdown: []
      };

      expect(getShortSummary(result)).toBe('❌ Coverage: 65% (need 80%)');
    });
  });
});
