/**
 * PR Size Analyzer Tests
 */

import { describe, it, expect } from 'vitest';
import { analyzePRSize, calculateFileComplexity, FileChange } from './prSize';

describe('PR Size Analyzer', () => {
  describe('analyzePRSize', () => {
    it('returns good for small PRs', () => {
      const changes: FileChange[] = [
        { path: 'src/index.ts', additions: 50, deletions: 10, isNew: false, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes);
      
      expect(result.recommendation).toBe('good');
      expect(result.linesChanged).toBe(60);
      expect(result.filesChanged).toBe(1);
    });
    
    it('returns consider-splitting for medium PRs', () => {
      const changes: FileChange[] = [
        { path: 'src/a.ts', additions: 150, deletions: 100, isNew: false, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes);
      
      expect(result.recommendation).toBe('consider-splitting');
      expect(result.suggestedSplitPoints).toBeDefined();
    });
    
    it('returns too-large for large PRs', () => {
      const changes: FileChange[] = [
        { path: 'src/a.ts', additions: 300, deletions: 250, isNew: false, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes);
      
      expect(result.recommendation).toBe('too-large');
    });
    
    it('respects custom thresholds', () => {
      const changes: FileChange[] = [
        { path: 'src/index.ts', additions: 100, deletions: 0, isNew: false, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes, { warnThreshold: 50 });
      
      expect(result.recommendation).toBe('consider-splitting');
    });
    
    it('considers file count', () => {
      const changes: FileChange[] = Array.from({ length: 15 }, (_, i) => ({
        path: `src/file${i}.ts`,
        additions: 10,
        deletions: 0,
        isNew: false,
        isDeleted: false,
        isRenamed: false
      }));
      
      const result = analyzePRSize(changes);
      
      // 150 lines is under 200, but 15 files is over 10
      expect(result.recommendation).toBe('consider-splitting');
    });
  });
  
  describe('Split Suggestions', () => {
    it('suggests splitting tests from logic', () => {
      const changes: FileChange[] = [
        { path: 'src/auth.ts', additions: 100, deletions: 20, isNew: false, isDeleted: false, isRenamed: false },
        { path: 'src/auth.test.ts', additions: 80, deletions: 10, isNew: false, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes);
      
      expect(result.suggestedSplitPoints?.some(s => s.includes('test'))).toBe(true);
    });
    
    it('suggests splitting config changes', () => {
      const changes: FileChange[] = [
        { path: 'src/index.ts', additions: 150, deletions: 50, isNew: false, isDeleted: false, isRenamed: false },
        { path: 'package.json', additions: 20, deletions: 5, isNew: false, isDeleted: false, isRenamed: false },
        { path: 'tsconfig.json', additions: 15, deletions: 0, isNew: false, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes);
      
      expect(result.suggestedSplitPoints?.some(s => s.includes('config'))).toBe(true);
    });
    
    it('suggests splitting new files', () => {
      const changes: FileChange[] = [
        { path: 'src/existing.ts', additions: 100, deletions: 50, isNew: false, isDeleted: false, isRenamed: false },
        { path: 'src/new1.ts', additions: 50, deletions: 0, isNew: true, isDeleted: false, isRenamed: false },
        { path: 'src/new2.ts', additions: 40, deletions: 0, isNew: true, isDeleted: false, isRenamed: false },
        { path: 'src/new3.ts', additions: 30, deletions: 0, isNew: true, isDeleted: false, isRenamed: false }
      ];
      
      const result = analyzePRSize(changes);
      
      expect(result.suggestedSplitPoints?.some(s => s.includes('new files'))).toBe(true);
    });
  });
  
  describe('calculateFileComplexity', () => {
    it('scores additions higher than deletions', () => {
      const addOnly: FileChange = { 
        path: 'a.ts', 
        additions: 100, 
        deletions: 0, 
        isNew: false, 
        isDeleted: false, 
        isRenamed: false 
      };
      const deleteOnly: FileChange = { 
        path: 'b.ts', 
        additions: 0, 
        deletions: 100, 
        isNew: false, 
        isDeleted: false, 
        isRenamed: false 
      };
      
      expect(calculateFileComplexity(addOnly)).toBeGreaterThan(calculateFileComplexity(deleteOnly));
    });
    
    it('scores new files higher', () => {
      const existing: FileChange = { 
        path: 'a.ts', 
        additions: 100, 
        deletions: 0, 
        isNew: false, 
        isDeleted: false, 
        isRenamed: false 
      };
      const newFile: FileChange = { 
        path: 'b.ts', 
        additions: 100, 
        deletions: 0, 
        isNew: true, 
        isDeleted: false, 
        isRenamed: false 
      };
      
      expect(calculateFileComplexity(newFile)).toBeGreaterThan(calculateFileComplexity(existing));
    });
  });
});
