/**
 * LSP Server Integration Tests
 * 
 * Tests that the core modules can be imported and basic functionality works.
 */

import { describe, it, expect } from 'vitest';
import {
  // Checklist
  scanSecurity,
  analyzePRSize,
  
  // Review
  FlakyTestDetective,
  
  // Context
  ContextManager,
  
  // Debug
  DebugSessionManager,
  
  // Parsers
  parseLcovContent,
  parseIstanbulContent,
} from '@pre-cr/core';

describe('Core Module Integration', () => {
  describe('Security Scanner', () => {
    it('should scan code and return findings structure', () => {
      const result = scanSecurity([{
        path: 'test.js',
        content: `eval(userInput);`
      }]);
      
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('scannedFiles');
      expect(Array.isArray(result.findings)).toBe(true);
    });
  });

  describe('PR Size Analyzer', () => {
    it('should analyze PR size', () => {
      const result = analyzePRSize([
        { path: 'src/a.ts', additions: 100, deletions: 50, isNew: false, isDeleted: false, isRenamed: false },
        { path: 'src/b.ts', additions: 200, deletions: 0, isNew: true, isDeleted: false, isRenamed: false },
      ]);
      
      expect(result.linesChanged).toBe(350);
      expect(result.filesChanged).toBe(2);
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('Flaky Test Detective', () => {
    it('should track test results', () => {
      const detective = new FlakyTestDetective();
      
      detective.recordResult({
        testId: 'test-1',
        name: 'should work',
        file: 'test.spec.ts',
        passed: true,
        duration: 100,
        timestamp: new Date()
      });
      
      const flakyTests = detective.getFlakyTests();
      expect(Array.isArray(flakyTests)).toBe(true);
    });
  });

  describe('Context Manager', () => {
    it('should be instantiable', () => {
      const manager = new ContextManager();
      expect(manager).toBeDefined();
    });
  });

  describe('Debug Session Manager', () => {
    it('should manage debug sessions', () => {
      const manager = new DebugSessionManager();
      
      manager.startSession('Debug Test', 'node');
      
      const activeSession = manager.getActiveSession();
      expect(activeSession).toBeDefined();
      
      manager.endSession();
      
      const sessions = manager.getAllSessions();
      expect(sessions.length).toBe(1);
    });
  });

  describe('LCOV Parser', () => {
    it('should parse LCOV content', () => {
      const lcovContent = `
SF:src/index.ts
DA:1,5
DA:2,0
DA:3,10
LF:3
LH:2
end_of_record
      `;
      
      const result = parseLcovContent(lcovContent);
      
      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(1);
    });
  });

  describe('Istanbul Parser', () => {
    it('should parse Istanbul JSON content', () => {
      const istanbulContent = JSON.stringify({
        'src/index.ts': {
          path: 'src/index.ts',
          statementMap: { '0': { start: { line: 1 }, end: { line: 1 } } },
          s: { '0': 5 },
          fnMap: {},
          f: {},
          branchMap: {},
          b: {}
        }
      });
      
      const result = parseIstanbulContent(istanbulContent);
      
      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(1);
    });
  });
});
