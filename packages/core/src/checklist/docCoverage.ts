/**
 * Documentation Coverage Analyzer
 * 
 * Analyzes code for documentation coverage:
 * - Finds exported symbols (functions, classes, interfaces, types)
 * - Checks if they have documentation
 * - Reports coverage percentage
 * - Identifies newly added undocumented exports
 */

import { getLogger } from '../logger';
import {
  DocCoverageConfig,
  DocCoverageResult,
  UndocumentedExport,
  DEFAULT_DOC_COVERAGE_CONFIG
} from './types';

/**
 * Represents a parsed export from source code
 */
export interface ParsedExport {
  name: string;
  kind: UndocumentedExport['kind'];
  file: string;
  line: number;
  hasDoc: boolean;
  docContent?: string;
}

/**
 * File content with metadata
 */
export interface SourceFile {
  path: string;
  content: string;
  isNew?: boolean;
}

// ============================================================================
// TypeScript/JavaScript Export Parsing
// ============================================================================

/**
 * Patterns for detecting exports in TypeScript/JavaScript
 */
const EXPORT_PATTERNS = {
  // export function name() {}
  exportFunction: /^export\s+(?:async\s+)?function\s+(\w+)/gm,
  
  // export const name = () => {}
  exportConstArrow: /^export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
  
  // export const name = function() {}
  exportConstFunction: /^export\s+const\s+(\w+)\s*=\s*(?:async\s+)?function/gm,
  
  // export class Name {}
  exportClass: /^export\s+class\s+(\w+)/gm,
  
  // export interface Name {}
  exportInterface: /^export\s+interface\s+(\w+)/gm,
  
  // export type Name = 
  exportType: /^export\s+type\s+(\w+)\s*=/gm,
  
  // export enum Name {}
  exportEnum: /^export\s+enum\s+(\w+)/gm,
  
  // export const/let/var name = (non-function)
  exportVariable: /^export\s+(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=/gm,
  
  // export default function name() {}
  exportDefaultFunction: /^export\s+default\s+(?:async\s+)?function\s+(\w+)/gm,
  
  // export default class Name {}
  exportDefaultClass: /^export\s+default\s+class\s+(\w+)/gm,
  
  // export { name } from './module'
  reExport: /^export\s+\{\s*([^}]+)\s*\}\s+from/gm,
  
  // export * from './module'
  reExportAll: /^export\s+\*\s+from/gm
};

/**
 * Patterns for detecting documentation comments
 * Reserved for future use with more sophisticated parsing
 */
const _DOC_PATTERNS = {
  // JSDoc style: /** ... */
  jsdoc: /\/\*\*[\s\S]*?\*\//g,
  
  // Single line: /** ... */
  jsdocSingle: /\/\*\*[^*].*\*\//g,
  
  // TSDoc is same as JSDoc
  tsdoc: /\/\*\*[\s\S]*?\*\//g
};

/**
 * Parse exports from TypeScript/JavaScript source
 */
export function parseExports(file: SourceFile): ParsedExport[] {
  const exports: ParsedExport[] = [];
  const lines = file.content.split('\n');
  
  // Build a map of line numbers to their content
  const lineMap = new Map<number, string>();
  lines.forEach((line, i) => lineMap.set(i, line));
  
  // Find all doc comments and their end lines
  const docComments = findDocComments(file.content);
  
  // Parse each type of export
  parsePattern(file, EXPORT_PATTERNS.exportFunction, 'function', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportConstArrow, 'function', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportConstFunction, 'function', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportClass, 'class', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportInterface, 'interface', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportType, 'type', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportEnum, 'const', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportDefaultFunction, 'function', exports, docComments);
  parsePattern(file, EXPORT_PATTERNS.exportDefaultClass, 'class', exports, docComments);
  
  // Parse variable exports (but filter out arrow functions we already caught)
  const varExports: ParsedExport[] = [];
  parsePattern(file, EXPORT_PATTERNS.exportVariable, 'variable', varExports, docComments);
  
  // Only add variable exports that aren't already captured as functions
  for (const varExport of varExports) {
    const isDuplicate = exports.some(e => 
      e.name === varExport.name && 
      e.file === varExport.file && 
      Math.abs(e.line - varExport.line) < 3
    );
    if (!isDuplicate) {
      exports.push(varExport);
    }
  }
  
  return exports;
}

/**
 * Find all documentation comments in source
 */
function findDocComments(content: string): Map<number, string> {
  const docs = new Map<number, string>();
  const lines = content.split('\n');
  
  let inDoc = false;
  let _docStart = -1;
  let docContent = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Single-line JSDoc
    if (line.startsWith('/**') && line.endsWith('*/')) {
      docs.set(i + 1, line); // Doc ends on this line, export on next
      continue;
    }
    
    // Start of multi-line doc
    if (line.startsWith('/**')) {
      inDoc = true;
      _docStart = i;
      docContent = line;
      continue;
    }
    
    // Inside doc
    if (inDoc) {
      docContent += '\n' + line;
      
      // End of doc
      if (line.endsWith('*/')) {
        inDoc = false;
        docs.set(i + 1, docContent); // Doc ends on this line
        docContent = '';
      }
    }
  }
  
  return docs;
}

/**
 * Parse exports matching a pattern
 */
function parsePattern(
  file: SourceFile,
  pattern: RegExp,
  kind: ParsedExport['kind'],
  exports: ParsedExport[],
  docComments: Map<number, string>
): void {
  // Reset regex
  pattern.lastIndex = 0;
  
  const lines = file.content.split('\n');
  let match;
  
  // We need to track line numbers, so process line by line
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    pattern.lastIndex = 0;
    
    match = pattern.exec(line);
    if (match) {
      const name = match[1];
      
      // Check if there's a doc comment immediately before
      const hasDoc = hasDocumentation(lineNum, docComments);
      const docContent = docComments.get(lineNum);
      
      exports.push({
        name,
        kind,
        file: file.path,
        line: lineNum + 1,
        hasDoc,
        docContent
      });
    }
  }
}

/**
 * Check if a line has documentation immediately before it
 */
function hasDocumentation(lineNum: number, docComments: Map<number, string>): boolean {
  // Check the line immediately before
  // Doc comment end line -> export line mapping
  return docComments.has(lineNum);
}

// ============================================================================
// Coverage Analysis
// ============================================================================

/**
 * Analyze documentation coverage for a set of files
 */
export function analyzeDocCoverage(
  files: SourceFile[],
  baseExports?: ParsedExport[],
  config: Partial<DocCoverageConfig> = {}
): DocCoverageResult {
  const logger = getLogger();
  const fullConfig: DocCoverageConfig = {
    ...DEFAULT_DOC_COVERAGE_CONFIG,
    ...config
  };
  
  // Parse all exports from current files
  const allExports: ParsedExport[] = [];
  
  for (const file of files) {
    // Skip non-TypeScript/JavaScript files
    if (!isSourceFile(file.path)) {
      continue;
    }
    
    const exports = parseExports(file);
    allExports.push(...exports);
  }
  
  // Filter exports based on config
  const relevantExports = allExports.filter(exp => {
    switch (exp.kind) {
      case 'function':
        return fullConfig.requireExportedFunctions;
      case 'class':
        return fullConfig.requireExportedClasses;
      case 'interface':
        return fullConfig.requireExportedInterfaces;
      case 'type':
        return fullConfig.requireExportedTypes;
      default:
        return false;
    }
  });
  
  const totalExports = relevantExports.length;
  const documentedExports = relevantExports.filter(e => e.hasDoc).length;
  const coveragePercent = totalExports > 0 
    ? Math.round((documentedExports / totalExports) * 100) 
    : 100;
  
  // Find undocumented exports
  const undocumented: UndocumentedExport[] = relevantExports
    .filter(e => !e.hasDoc)
    .map(e => ({
      name: e.name,
      kind: e.kind,
      file: e.file,
      line: e.line,
      isNew: false
    }));
  
  // Find NEW undocumented exports (not in base)
  let newUndocumented: UndocumentedExport[] = [];
  
  if (baseExports) {
    const baseNames = new Set(baseExports.map(e => `${e.file}:${e.name}`));
    
    newUndocumented = undocumented
      .filter(e => !baseNames.has(`${e.file}:${e.name}`))
      .map(e => ({ ...e, isNew: true }));
  } else {
    // If no base, check if file is new
    const newFiles = new Set(files.filter(f => f.isNew).map(f => f.path));
    newUndocumented = undocumented
      .filter(e => newFiles.has(e.file))
      .map(e => ({ ...e, isNew: true }));
  }
  
  logger.info('Documentation coverage analysis complete', {
    totalExports,
    documentedExports,
    coveragePercent,
    undocumentedCount: undocumented.length,
    newUndocumentedCount: newUndocumented.length
  });
  
  return {
    totalExports,
    documentedExports,
    coveragePercent,
    undocumented,
    newUndocumented
  };
}

/**
 * Check if file is a source file we should analyze
 */
function isSourceFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext || '');
}

// ============================================================================
// Documentation Health (Drift Detection)
// ============================================================================

export interface DocHealthIssue {
  type: 'stale' | 'missing-param' | 'wrong-return' | 'outdated-example';
  file: string;
  line: number;
  name: string;
  message: string;
  suggestion?: string;
}

/**
 * Basic doc health check - detects obvious issues
 * Full implementation would use TypeScript compiler API
 */
export function checkDocHealth(file: SourceFile): DocHealthIssue[] {
  const issues: DocHealthIssue[] = [];
  const exports = parseExports(file);
  
  for (const exp of exports) {
    if (exp.hasDoc && exp.docContent && exp.kind === 'function') {
      // Check for @param tags that might be outdated
      const paramTags = exp.docContent.match(/@param\s+\{?[^}]*\}?\s*(\w+)/g) || [];
      const docParamNames = paramTags.map(t => {
        const match = t.match(/@param\s+\{?[^}]*\}?\s*(\w+)/);
        return match ? match[1] : '';
      });
      
      // Try to find the function signature
      const lines = file.content.split('\n');
      const funcLine = lines[exp.line - 1] || '';
      const signatureMatch = funcLine.match(/\(([^)]*)\)/);
      
      if (signatureMatch) {
        const params = signatureMatch[1]
          .split(',')
          .map(p => p.trim().split(/[:\s=]/)[0].trim())
          .filter(p => p && p !== '');
        
        // Check for documented params that don't exist
        for (const docParam of docParamNames) {
          if (!params.includes(docParam)) {
            issues.push({
              type: 'stale',
              file: exp.file,
              line: exp.line,
              name: exp.name,
              message: `@param ${docParam} documented but not in function signature`,
              suggestion: `Remove or update @param ${docParam}`
            });
          }
        }
        
        // Check for params without documentation
        for (const param of params) {
          if (param && !docParamNames.includes(param)) {
            issues.push({
              type: 'missing-param',
              file: exp.file,
              line: exp.line,
              name: exp.name,
              message: `Parameter '${param}' is not documented`,
              suggestion: `Add @param ${param} to documentation`
            });
          }
        }
      }
    }
  }
  
  return issues;
}
