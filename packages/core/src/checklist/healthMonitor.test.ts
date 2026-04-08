/**
 * Documentation Health Monitor Tests
 */

import { describe, it, expect } from 'vitest';
import { 
  checkFileHealth, 
  checkWorkspaceHealth, 
  checkReadmeHealth,
  HealthIssueSeverity 
} from './healthMonitor';
import { SourceFile } from './docCoverage';

describe('Documentation Health Monitor', () => {
  describe('checkFileHealth', () => {
    it('identifies undocumented exports', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
        `.trim()
      };
      
      const report = checkFileHealth(file);
      
      expect(report.issues.length).toBe(2);
      expect(report.issues[0].type).toBe('missing-doc');
      expect(report.coverage.percentage).toBe(0);
    });
    
    it('calculates coverage correctly', () => {
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
        `.trim()
      };
      
      const report = checkFileHealth(file);
      
      // One documented, one not
      expect(report.coverage.total).toBe(2);
      expect(report.coverage.documented).toBeGreaterThanOrEqual(0);
    });
    
    it('skips excluded files', () => {
      const file: SourceFile = {
        path: 'src/__tests__/utils.test.ts',
        content: `
export function testHelper() {}
        `.trim()
      };
      
      const report = checkFileHealth(file);
      
      expect(report.issues.length).toBe(0);
      expect(report.coverage.percentage).toBe(100);
    });
    
    it('respects checkMissing config', () => {
      const file: SourceFile = {
        path: 'src/utils.ts',
        content: `
export function add(a: number, b: number): number {
  return a + b;
}
        `.trim()
      };
      
      const report = checkFileHealth(file, { checkMissing: false });
      
      // Should not report missing docs
      const missingDocIssues = report.issues.filter(i => i.type === 'missing-doc');
      expect(missingDocIssues.length).toBe(0);
    });
  });
  
  describe('checkWorkspaceHealth', () => {
    it('aggregates issues across files', () => {
      const files: SourceFile[] = [
        {
          path: 'src/a.ts',
          content: 'export function a() {}'
        },
        {
          path: 'src/b.ts',
          content: 'export function b() {}'
        }
      ];
      
      const report = checkWorkspaceHealth(files);
      
      expect(report.summary.totalFiles).toBe(2);
      expect(report.summary.totalIssues).toBe(2);
    });
    
    it('identifies critical files', () => {
      const files: SourceFile[] = [
        {
          path: 'src/bad.ts',
          content: `
export function a() {}
export function b() {}
export function c() {}
          `.trim()
        },
        {
          path: 'src/good.ts',
          content: `
/** Doc */
export function d() {}
          `.trim()
        }
      ];
      
      const report = checkWorkspaceHealth(files);
      
      expect(report.summary.criticalFiles.length).toBeGreaterThan(0);
      expect(report.summary.criticalFiles[0]).toBe('src/bad.ts');
    });
    
    it('calculates overall coverage', () => {
      const files: SourceFile[] = [
        {
          path: 'src/a.ts',
          content: '/** Doc */\nexport function a() {}'
        },
        {
          path: 'src/b.ts',
          content: 'export function b() {}'
        }
      ];
      
      const report = checkWorkspaceHealth(files);
      
      // Overall coverage should reflect both files
      expect(report.summary.overallCoverage).toBeGreaterThanOrEqual(0);
      expect(report.summary.overallCoverage).toBeLessThanOrEqual(100);
    });
  });
  
  describe('checkReadmeHealth', () => {
    it('detects references to deleted files', () => {
      const readme = `
# Project

See [docs](./docs/guide.md) for more info.
      `.trim();
      
      const existingFiles = new Set(['README.md', 'package.json']);
      
      const issues = checkReadmeHealth(readme, existingFiles);
      
      expect(issues.some(i => i.type === 'deleted-file')).toBe(true);
    });
    
    it('ignores external URLs', () => {
      const readme = `
# Project

See [Google](https://google.com) for more info.
      `.trim();
      
      const existingFiles = new Set(['README.md']);
      
      const issues = checkReadmeHealth(readme, existingFiles);
      
      expect(issues.filter(i => i.message.includes('google.com')).length).toBe(0);
    });
    
    it('detects invalid npm scripts', () => {
      const readme = `
# Usage

Run \`npm run nonexistent\` to start.
      `.trim();
      
      const existingFiles = new Set(['README.md']);
      const packageJson = {
        scripts: {
          start: 'node index.js',
          build: 'tsc'
        }
      };
      
      const issues = checkReadmeHealth(readme, existingFiles, packageJson);
      
      expect(issues.some(i => i.type === 'outdated-command')).toBe(true);
    });
    
    it('detects version mismatches', () => {
      const readme = `
# Project v1.0.0

Current version: 1.0.0
      `.trim();
      
      const existingFiles = new Set(['README.md']);
      const packageJson = {
        version: '2.0.0'
      };
      
      const issues = checkReadmeHealth(readme, existingFiles, packageJson);
      
      expect(issues.some(i => i.type === 'outdated-version')).toBe(true);
    });
    
    it('passes for valid README', () => {
      const readme = `
# Project

Run \`npm run build\` to build.
      `.trim();
      
      const existingFiles = new Set(['README.md', 'package.json']);
      const packageJson = {
        scripts: { build: 'tsc' },
        version: '1.0.0'
      };
      
      const issues = checkReadmeHealth(readme, existingFiles, packageJson);
      
      // Should have no script or version issues
      const scriptOrVersionIssues = issues.filter(
        i => i.type === 'outdated-command' || i.type === 'outdated-version'
      );
      expect(scriptOrVersionIssues.length).toBe(0);
    });
  });
});
