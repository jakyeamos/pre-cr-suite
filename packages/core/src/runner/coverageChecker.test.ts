/**
 * Coverage Checker Tests
 */

import { describe, it, expect } from 'vitest';
import { 
  checkChangesCoverage, 
  formatUnsupportedSurfaceSetupGuidance,
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

    it('fails all-unsupported change sets even when no coverable lines are present', () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'python/app.py',
          additions: [1],
          modifications: [],
          isNew: false
        }
      ];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage(), {
        surfaces: {
          covered: ['src/**'],
          ignored: [],
          unsupported: ['python/**']
        }
      });

      expect(result.passed).toBe(false);
      expect(result.coveragePercent).toBe(100);
      expect(result.summary.totalChangedLines).toBe(0);
      expect(result.surfaceSummary).toEqual({
        coveredFiles: 0,
        ignoredFiles: 0,
        unsupportedFiles: 1
      });
      expect(result.unsupportedFiles).toEqual(['python/app.py']);
      expect(result.fileBreakdown).toEqual([]);
    });

    it('fails mixed-surface change sets when covered files meet threshold but unsupported files are present', () => {
      const changedFiles: ChangedFile[] = [
        {
          path: 'src/utils.ts',
          additions: [1],
          modifications: [],
          isNew: false
        },
        {
          path: 'docs/readme.md',
          additions: [1],
          modifications: [],
          isNew: false
        },
        {
          path: 'python/app.py',
          additions: [1],
          modifications: [],
          isNew: false
        }
      ];

      const result = checkChangesCoverage(changedFiles, createSampleCoverage(), {
        surfaces: {
          covered: ['src/**'],
          ignored: ['docs/**'],
          unsupported: ['python/**']
        }
      });

      expect(result.passed).toBe(false);
      expect(result.coveragePercent).toBe(100);
      expect(result.summary.totalChangedLines).toBe(1);
      expect(result.surfaceSummary).toEqual({
        coveredFiles: 1,
        ignoredFiles: 1,
        unsupportedFiles: 1
      });
      expect(result.unsupportedFiles).toEqual(['python/app.py']);
      expect(result.fileBreakdown.map((entry) => entry.file)).toEqual(['src/utils.ts']);
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
        surfaceSummary: {
          coveredFiles: 0,
          ignoredFiles: 0,
          unsupportedFiles: 0
        },
        unsupportedFiles: [],
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
        surfaceSummary: {
          coveredFiles: 0,
          ignoredFiles: 0,
          unsupportedFiles: 0
        },
        unsupportedFiles: [],
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

    it('should format unsupported files as a failing reason', () => {
      const result: CoverageCheckResult = {
        passed: false,
        coveragePercent: 100,
        threshold: 80,
        summary: {
          totalChangedLines: 0,
          coveredLines: 0,
          uncoveredLines: 0,
          skippedLines: 0
        },
        surfaceSummary: {
          coveredFiles: 0,
          ignoredFiles: 0,
          unsupportedFiles: 1
        },
        unsupportedFiles: ['python/app.py'],
        uncoveredDetails: [],
        fileBreakdown: []
      };

      const report = formatCoverageReport(result);

      expect(report).toContain('❌ FAILED');
      expect(report).toContain('Unsupported surface files: 1');
      expect(report).toContain('python/app.py');
    });
  });

  describe('formatUnsupportedSurfaceSetupGuidance', () => {
    it('returns no guidance when there are no unsupported files', () => {
      expect(formatUnsupportedSurfaceSetupGuidance({ unsupportedFiles: [] })).toEqual([]);
    });

    it('returns the shared Fix Setup guidance for unsupported files', () => {
      expect(formatUnsupportedSurfaceSetupGuidance({
        unsupportedFiles: ['python/app.py']
      })).toEqual([
        'Fix Setup: Unsupported files are outside the current coverage surface.',
        '  Add a coverage adapter for these paths or reclassify them in .pre-cr.json under surfaces.covered, surfaces.ignored, or surfaces.unsupported.'
      ]);
    });
  });

  describe('getShortSummary', () => {
    it('should return passing summary', () => {
      const result: CoverageCheckResult = {
        passed: true,
        coveragePercent: 85,
        threshold: 80,
        summary: { totalChangedLines: 10, coveredLines: 8, uncoveredLines: 2, skippedLines: 0 },
        surfaceSummary: { coveredFiles: 0, ignoredFiles: 0, unsupportedFiles: 0 },
        unsupportedFiles: [],
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
        surfaceSummary: { coveredFiles: 0, ignoredFiles: 0, unsupportedFiles: 0 },
        unsupportedFiles: [],
        uncoveredDetails: [],
        fileBreakdown: []
      };

      expect(getShortSummary(result)).toBe('❌ Coverage: 65% (need 80%)');
    });

    it('should return unsupported summary before threshold wording', () => {
      const result: CoverageCheckResult = {
        passed: false,
        coveragePercent: 100,
        threshold: 80,
        summary: { totalChangedLines: 0, coveredLines: 0, uncoveredLines: 0, skippedLines: 0 },
        surfaceSummary: { coveredFiles: 0, ignoredFiles: 0, unsupportedFiles: 1 },
        unsupportedFiles: ['python/app.py'],
        uncoveredDetails: [],
        fileBreakdown: []
      };

      expect(getShortSummary(result)).toBe('❌ Unsupported surface files: 1');
    });
  });
});
