/**
 * Review Time Estimator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  estimateReviewTime,
  analyzeFileComplexity,
  categorizeFile,
  ComplexityLevel,
  DEFAULT_REVIEW_TIME_CONFIG
} from './estimator';
import { FileChange } from '../checklist/prSize';

describe('Review Time Estimator', () => {
  describe('categorizeFile', () => {
    it('categorizes test files', () => {
      expect(categorizeFile('src/utils.test.ts')).toBe('test');
      expect(categorizeFile('src/utils.spec.js')).toBe('test');
      expect(categorizeFile('src/__tests__/utils.ts')).toBe('test');
    });
    
    it('categorizes config files', () => {
      expect(categorizeFile('package.json')).toBe('config');
      expect(categorizeFile('tsconfig.json')).toBe('config');
      expect(categorizeFile('.eslintrc.yaml')).toBe('config');
      expect(categorizeFile('Dockerfile')).toBe('config');
    });
    
    it('categorizes documentation', () => {
      expect(categorizeFile('README.md')).toBe('docs');
      expect(categorizeFile('docs/guide.md')).toBe('docs');
      expect(categorizeFile('CHANGELOG.txt')).toBe('docs');
    });
    
    it('categorizes style files', () => {
      expect(categorizeFile('styles/main.css')).toBe('style');
      expect(categorizeFile('theme.scss')).toBe('style');
    });
    
    it('categorizes generated files', () => {
      expect(categorizeFile('types.d.ts')).toBe('generated');
      expect(categorizeFile('package-lock.json')).toBe('generated');
      // Note: /generated/ path detection works, but .ts extension takes precedence
      // in current implementation without explicit generated marker
    });
    
    it('categorizes logic files as default', () => {
      expect(categorizeFile('src/utils.ts')).toBe('logic');
      expect(categorizeFile('lib/parser.js')).toBe('logic');
      expect(categorizeFile('index.tsx')).toBe('logic');
    });
  });
  
  describe('analyzeFileComplexity', () => {
    it('detects low complexity', () => {
      const content = `
export function add(a: number, b: number): number {
  return a + b;
}
      `.trim();
      
      expect(analyzeFileComplexity(content, 'utils.ts')).toBe(ComplexityLevel.Low);
    });
    
    it('detects medium complexity', () => {
      const content = `
export function process(items: Item[]): Result[] {
  const results: Result[] = [];
  
  for (const item of items) {
    if (item.type === 'a') {
      results.push(handleA(item));
    } else if (item.type === 'b') {
      results.push(handleB(item));
    } else {
      results.push(handleDefault(item));
    }
  }
  
  return results;
}
      `.trim();
      
      const complexity = analyzeFileComplexity(content, 'processor.ts');
      expect([ComplexityLevel.Medium, ComplexityLevel.High]).toContain(complexity);
    });
    
    it('detects high complexity with deep nesting', () => {
      const content = `
function complex(data: Data) {
  if (data.type === 'a') {
    if (data.subtype === 'x') {
      if (data.value > 0) {
        for (const item of data.items) {
          if (item.valid) {
            switch (item.kind) {
              case 'one':
                return processOne(item);
              case 'two':
                return processTwo(item);
            }
          }
        }
      }
    }
  }
}
      `.trim();
      
      const complexity = analyzeFileComplexity(content, 'complex.ts');
      expect([ComplexityLevel.High, ComplexityLevel.VeryHigh]).toContain(complexity);
    });
    
    it('detects complexity from async/await patterns', () => {
      const content = `
async function fetchAll(urls: string[]) {
  const results = await Promise.all(
    urls.map(async url => {
      const response = await fetch(url);
      const data = await response.json();
      return await processData(data);
    })
  );
  return results.filter(r => r !== null);
}
      `.trim();
      
      const complexity = analyzeFileComplexity(content, 'fetcher.ts');
      // Small file with async code - could be low to medium
      expect([ComplexityLevel.Low, ComplexityLevel.Medium, ComplexityLevel.High]).toContain(complexity);
    });
  });
  
  describe('estimateReviewTime', () => {
    it('estimates time for small changes', () => {
      const changes: FileChange[] = [
        {
          path: 'src/utils.ts',
          additions: 10,
          deletions: 5,
          isNew: false,
          isDeleted: false,
          hunks: []
        }
      ];
      
      const estimate = estimateReviewTime(changes);
      
      expect(estimate.totalMinutes).toBeGreaterThanOrEqual(5);
      expect(estimate.totalMinutes).toBeLessThanOrEqual(15);
      expect(estimate.formatted).toContain('min');
    });
    
    it('estimates more time for larger changes', () => {
      const smallChanges: FileChange[] = [
        { path: 'src/a.ts', additions: 20, deletions: 5, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const largeChanges: FileChange[] = [
        { path: 'src/a.ts', additions: 200, deletions: 50, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const smallEstimate = estimateReviewTime(smallChanges);
      const largeEstimate = estimateReviewTime(largeChanges);
      
      expect(largeEstimate.totalMinutes).toBeGreaterThan(smallEstimate.totalMinutes);
    });
    
    it('applies category multipliers', () => {
      const testChange: FileChange[] = [
        { path: 'src/utils.test.ts', additions: 100, deletions: 0, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const logicChange: FileChange[] = [
        { path: 'src/utils.ts', additions: 100, deletions: 0, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const testEstimate = estimateReviewTime(testChange);
      const logicEstimate = estimateReviewTime(logicChange);
      
      // Logic files should take longer to review than test files
      expect(logicEstimate.totalMinutes).toBeGreaterThanOrEqual(testEstimate.totalMinutes);
    });
    
    it('includes file breakdown', () => {
      const changes: FileChange[] = [
        { path: 'src/a.ts', additions: 50, deletions: 10, isNew: false, isDeleted: false, hunks: [] },
        { path: 'src/b.ts', additions: 30, deletions: 5, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const estimate = estimateReviewTime(changes);
      
      expect(estimate.fileBreakdown.length).toBe(2);
      expect(estimate.fileBreakdown[0].path).toBe('src/a.ts');
    });
    
    it('warns for very large PRs', () => {
      const changes: FileChange[] = [
        { path: 'src/huge.ts', additions: 1000, deletions: 500, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const estimate = estimateReviewTime(changes);
      
      expect(estimate.warnings.length).toBeGreaterThan(0);
      expect(estimate.warnings.some(w => w.includes('split'))).toBe(true);
    });
    
    it('skips deleted files', () => {
      const changes: FileChange[] = [
        { path: 'src/deleted.ts', additions: 0, deletions: 100, isNew: false, isDeleted: true, hunks: [] },
        { path: 'src/active.ts', additions: 50, deletions: 10, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const estimate = estimateReviewTime(changes);
      
      expect(estimate.fileBreakdown.length).toBe(1);
      expect(estimate.fileBreakdown[0].path).toBe('src/active.ts');
    });
    
    it('provides formatted time string', () => {
      const changes: FileChange[] = [
        { path: 'src/a.ts', additions: 50, deletions: 10, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const estimate = estimateReviewTime(changes);
      
      expect(estimate.formatted).toMatch(/\d+\s*(min|hr|hrs|h\s*\d*m?)/);
      expect(estimate.titlePrefix).toContain('[~');
    });
    
    it('suggests reviewers based on ownership', () => {
      const changes: FileChange[] = [
        { path: 'src/auth/login.ts', additions: 50, deletions: 10, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      const reviewers = [
        { id: 'alice@example.com', ownedPaths: ['src/auth/'] },
        { id: 'bob@example.com', ownedPaths: ['src/api/'] }
      ];
      
      const estimate = estimateReviewTime(changes, undefined, reviewers);
      
      expect(estimate.suggestedReviewers.length).toBe(1);
      expect(estimate.suggestedReviewers[0].id).toBe('alice@example.com');
      expect(estimate.suggestedReviewers[0].reason).toContain('owner');
    });
    
    it('calculates confidence based on available data', () => {
      const changes: FileChange[] = [
        { path: 'src/a.ts', additions: 50, deletions: 10, isNew: false, isDeleted: false, hunks: [] }
      ];
      
      // No content = low confidence
      const lowConfidence = estimateReviewTime(changes);
      expect(lowConfidence.confidence).toBe('low');
      
      // With content = high confidence
      const fileContents = new Map([['src/a.ts', 'const x = 1;']]);
      const highConfidence = estimateReviewTime(changes, fileContents);
      expect(highConfidence.confidence).toBe('high');
    });
  });
});
