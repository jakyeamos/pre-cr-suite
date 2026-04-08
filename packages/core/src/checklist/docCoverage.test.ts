/**
 * Documentation Coverage Analyzer Tests
 */

import { describe, it, expect } from 'vitest';
import { parseExports, analyzeDocCoverage, checkDocHealth, SourceFile } from './docCoverage';

describe('Documentation Coverage Analyzer', () => {
  describe('parseExports', () => {
    it('parses exported functions', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
export function add(a: number, b: number): number {
  return a + b;
}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(1);
      expect(exports[0].name).toBe('add');
      expect(exports[0].kind).toBe('function');
      expect(exports[0].hasDoc).toBe(false);
    });
    
    it('parses exported async functions', () => {
      const file: SourceFile = {
        path: 'src/api.ts',
        content: `
export async function fetchUser(id: string) {
  return await db.users.find(id);
}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(1);
      expect(exports[0].name).toBe('fetchUser');
      expect(exports[0].kind).toBe('function');
    });
    
    it('parses exported arrow functions', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
export const multiply = (a: number, b: number) => a * b;
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(1);
      expect(exports[0].name).toBe('multiply');
      expect(exports[0].kind).toBe('function');
    });
    
    it('parses exported classes', () => {
      const file: SourceFile = {
        path: 'src/models.ts',
        content: `
export class User {
  constructor(public name: string) {}
}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(1);
      expect(exports[0].name).toBe('User');
      expect(exports[0].kind).toBe('class');
    });
    
    it('parses exported interfaces', () => {
      const file: SourceFile = {
        path: 'src/types.ts',
        content: `
export interface UserData {
  id: string;
  name: string;
}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(1);
      expect(exports[0].name).toBe('UserData');
      expect(exports[0].kind).toBe('interface');
    });
    
    it('parses exported types', () => {
      const file: SourceFile = {
        path: 'src/types.ts',
        content: `
export type UserId = string;
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(1);
      expect(exports[0].name).toBe('UserId');
      expect(exports[0].kind).toBe('type');
    });
    
    it('detects JSDoc documentation', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
/**
 * Adds two numbers together.
 */
export function add(a: number, b: number): number {
  return a + b;
}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports[0].hasDoc).toBe(true);
    });
    
    it('detects single-line JSDoc', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
/** Adds two numbers together. */
export function add(a: number, b: number): number {
  return a + b;
}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports[0].hasDoc).toBe(true);
    });
    
    it('handles multiple exports', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
/** Documented */
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

/** Also documented */
export class Calculator {}
        `.trim()
      };
      
      const exports = parseExports(file);
      
      expect(exports.length).toBe(3);
      expect(exports.filter(e => e.hasDoc).length).toBe(2);
    });
  });
  
  describe('analyzeDocCoverage', () => {
    it('calculates coverage percentage', () => {
      const files: SourceFile[] = [{
        path: 'src/utils.ts',
        content: `
/** Documented */
export function add() {}

export function subtract() {}
        `.trim()
      }];
      
      const result = analyzeDocCoverage(files);
      
      expect(result.totalExports).toBe(2);
      expect(result.documentedExports).toBe(1);
      expect(result.coveragePercent).toBe(50);
    });
    
    it('identifies undocumented exports', () => {
      const files: SourceFile[] = [{
        path: 'src/utils.ts',
        content: `
export function add() {}
export function subtract() {}
        `.trim()
      }];
      
      const result = analyzeDocCoverage(files);
      
      expect(result.undocumented.length).toBe(2);
      expect(result.undocumented[0].name).toBe('add');
      expect(result.undocumented[1].name).toBe('subtract');
    });
    
    it('identifies new undocumented exports', () => {
      const files: SourceFile[] = [{
        path: 'src/utils.ts',
        content: `
export function add() {}
export function multiply() {}
        `.trim(),
        isNew: true
      }];
      
      const result = analyzeDocCoverage(files);
      
      expect(result.newUndocumented.length).toBe(2);
      expect(result.newUndocumented[0].isNew).toBe(true);
    });
    
    it('respects config for which exports to check', () => {
      const files: SourceFile[] = [{
        path: 'src/types.ts',
        content: `
export type UserId = string;
export interface User {}
        `.trim()
      }];
      
      // Default: types not required
      const result1 = analyzeDocCoverage(files);
      expect(result1.totalExports).toBe(1); // Only interface
      
      // With types required
      const result2 = analyzeDocCoverage(files, undefined, { 
        requireExportedTypes: true,
        requireExportedFunctions: true,
        requireExportedClasses: true,
        requireExportedInterfaces: true,
        minCoverage: 80
      });
      expect(result2.totalExports).toBe(2); // Both
    });
    
    it('returns 100% for files with no exports', () => {
      const files: SourceFile[] = [{
        path: 'src/internal.ts',
        content: `
function privateFunction() {}
const privateVar = 1;
        `.trim()
      }];
      
      const result = analyzeDocCoverage(files);
      
      expect(result.coveragePercent).toBe(100);
    });
  });
  
  describe('checkDocHealth', () => {
    it('detects documented params not in signature', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
/**
 * @param a First number
 * @param b Second number
 * @param c Third number - but this doesn't exist!
 */
export function add(a: number, b: number): number {
  return a + b;
}
        `.trim()
      };
      
      const issues = checkDocHealth(file);
      
      expect(issues.some(i => i.type === 'stale' && i.message.includes('c'))).toBe(true);
    });
    
    it('detects params without documentation', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
/**
 * Adds numbers
 * @param a First number
 */
export function add(a: number, b: number): number {
  return a + b;
}
        `.trim()
      };
      
      const issues = checkDocHealth(file);
      
      expect(issues.some(i => i.type === 'missing-param' && i.message.includes('b'))).toBe(true);
    });
  });
});
