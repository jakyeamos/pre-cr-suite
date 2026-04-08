/**
 * Streaming LCOV Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseLcovContentStreaming } from './lcovStreaming';

describe('Streaming LCOV Parser', () => {
  describe('parseLcovContentStreaming', () => {
    it('should parse simple LCOV content', () => {
      const content = `
SF:src/index.ts
DA:1,5
DA:2,0
DA:3,10
LF:3
LH:2
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      
      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(1);
      expect(result.stats.filesFound).toBe(1);
      expect(result.stats.linesProcessed).toBeGreaterThan(0);
    });

    it('should parse multiple files', () => {
      const content = `
SF:src/a.ts
DA:1,1
end_of_record
SF:src/b.ts
DA:1,0
end_of_record
SF:src/c.ts
DA:1,5
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      
      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(3);
      expect(result.stats.filesFound).toBe(3);
    });

    it('should calculate line coverage correctly', () => {
      const content = `
SF:src/index.ts
DA:1,5
DA:2,0
DA:3,10
DA:4,0
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      const file = result.data?.files.get('src/index.ts');
      
      expect(file?.summary.totalLines).toBe(4);
      expect(file?.summary.coveredLines).toBe(2);
      expect(file?.summary.linePercentage).toBe(50);
    });

    it('should call onFile callback for each file', () => {
      const content = `
SF:src/a.ts
DA:1,1
end_of_record
SF:src/b.ts
DA:1,1
end_of_record
      `;
      
      const files: string[] = [];
      parseLcovContentStreaming(content, {
        onFile: (file) => files.push(file.filePath)
      });
      
      expect(files).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('should call onProgress callback', () => {
      const content = Array(100).fill('SF:test.ts\nDA:1,1\nend_of_record').join('\n');
      
      let progressCalls = 0;
      parseLcovContentStreaming(content, {
        progressInterval: 50,
        onProgress: () => progressCalls++
      });
      
      expect(progressCalls).toBeGreaterThan(0);
    });

    it('should parse function coverage', () => {
      const content = `
SF:src/index.ts
FN:1,myFunction
FN:10,anotherFunction
FNDA:5,myFunction
FNDA:0,anotherFunction
DA:1,5
DA:10,0
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      const file = result.data?.files.get('src/index.ts');
      
      expect(file?.functions.length).toBe(2);
      expect(file?.functions[0].name).toBe('myFunction');
      expect(file?.functions[0].executionCount).toBe(5);
      expect(file?.functions[1].name).toBe('anotherFunction');
      expect(file?.functions[1].executionCount).toBe(0);
    });

    it('should handle branch coverage', () => {
      const content = `
SF:src/index.ts
DA:1,5
BRDA:1,0,0,5
BRDA:1,0,1,0
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      const file = result.data?.files.get('src/index.ts');
      const line = file?.lines.get(1);
      
      // Line should be marked as partial since not all branches taken
      expect(line?.status).toBe('partial');
    });

    it('should calculate workspace summary', () => {
      const content = `
SF:src/a.ts
DA:1,1
DA:2,1
end_of_record
SF:src/b.ts
DA:1,0
DA:2,0
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      
      expect(result.data?.summary.totalLines).toBe(4);
      expect(result.data?.summary.coveredLines).toBe(2);
      expect(result.data?.summary.linePercentage).toBe(50);
    });

    it('should handle empty content', () => {
      const result = parseLcovContentStreaming('');
      
      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(0);
    });

    it('should handle malformed lines gracefully', () => {
      const content = `
SF:src/index.ts
DA:invalid
DA:1,5
malformed line
end_of_record
      `;
      
      const result = parseLcovContentStreaming(content);
      
      expect(result.success).toBe(true);
      expect(result.data?.files.size).toBe(1);
    });

    it('should track parse time', () => {
      const content = `SF:test.ts\nDA:1,1\nend_of_record`;
      
      const result = parseLcovContentStreaming(content);
      
      expect(result.stats.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
