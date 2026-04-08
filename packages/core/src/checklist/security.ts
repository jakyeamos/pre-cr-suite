/**
 * Security Scanner
 * 
 * Detects potential security issues in code:
 * - Hardcoded secrets (API keys, passwords, tokens)
 * - SQL injection vulnerabilities
 * - XSS risks
 * - Path traversal risks
 */

import { getLogger } from '../logger';
import {
  SecurityConfig,
  SecurityFinding,
  SecurityResult,
  SecurityPattern,
  CheckSeverity
} from './types';

// ============================================================================
// Default Patterns
// ============================================================================

/**
 * Patterns for detecting hardcoded secrets
 */
const SECRET_PATTERNS: SecurityPattern[] = [
  {
    id: 'aws-access-key',
    name: 'AWS Access Key',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    severity: CheckSeverity.Error,
    message: 'AWS Access Key ID detected'
  },
  {
    id: 'aws-secret-key',
    name: 'AWS Secret Key',
    pattern: /(?:aws)?_?(?:secret)?_?(?:access)?_?key['"]?\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}/gi,
    severity: CheckSeverity.Error,
    message: 'AWS Secret Access Key detected'
  },
  {
    id: 'github-token',
    name: 'GitHub Token',
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g,
    severity: CheckSeverity.Error,
    message: 'GitHub personal access token detected'
  },
  {
    id: 'generic-api-key',
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey)['"]?\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi,
    severity: CheckSeverity.Warning,
    message: 'Potential API key detected'
  },
  {
    id: 'generic-secret',
    name: 'Generic Secret',
    pattern: /(?:secret|password|passwd|pwd|token)['"]?\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi,
    severity: CheckSeverity.Warning,
    message: 'Potential hardcoded secret detected'
  },
  {
    id: 'private-key',
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: CheckSeverity.Error,
    message: 'Private key detected'
  },
  {
    id: 'jwt-token',
    name: 'JWT Token',
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    severity: CheckSeverity.Warning,
    message: 'JWT token detected'
  },
  {
    id: 'slack-webhook',
    name: 'Slack Webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    severity: CheckSeverity.Error,
    message: 'Slack webhook URL detected'
  },
  {
    id: 'stripe-key',
    name: 'Stripe API Key',
    pattern: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}/g,
    severity: CheckSeverity.Error,
    message: 'Stripe API key detected'
  },
  {
    id: 'database-url',
    name: 'Database Connection String',
    pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: CheckSeverity.Error,
    message: 'Database connection string with credentials detected'
  }
];

/**
 * Patterns for SQL injection vulnerabilities
 */
const SQL_INJECTION_PATTERNS: SecurityPattern[] = [
  {
    id: 'sql-string-concat',
    name: 'SQL String Concatenation',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|AND|OR)\s+.*?\+\s*(?:req\.|request\.|params\.|query\.|body\.)/gi,
    severity: CheckSeverity.Error,
    message: 'Potential SQL injection via string concatenation'
  },
  {
    id: 'sql-template-literal',
    name: 'SQL Template Literal',
    pattern: /(?:query|execute|exec)\s*\(\s*`[^`]*\$\{(?:req\.|request\.|params\.|query\.|body\.)[^}]+\}/gi,
    severity: CheckSeverity.Error,
    message: 'Potential SQL injection via template literal'
  },
  {
    id: 'raw-query',
    name: 'Raw SQL Query',
    pattern: /\.(?:raw|query|execute)\s*\(\s*['"`].*(?:\+|,\s*\[)/gi,
    severity: CheckSeverity.Warning,
    message: 'Raw SQL query - ensure proper parameterization'
  }
];

/**
 * Patterns for XSS vulnerabilities
 */
const XSS_PATTERNS: SecurityPattern[] = [
  {
    id: 'dangerous-innerhtml',
    name: 'Dangerous innerHTML',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*(?!DOMPurify|sanitize)/gi,
    severity: CheckSeverity.Warning,
    message: 'dangerouslySetInnerHTML without sanitization'
  },
  {
    id: 'innerhtml-assignment',
    name: 'innerHTML Assignment',
    pattern: /\.innerHTML\s*=\s*(?!['"`]<)/g,
    severity: CheckSeverity.Warning,
    message: 'Direct innerHTML assignment - ensure content is sanitized'
  },
  {
    id: 'document-write',
    name: 'document.write',
    pattern: /document\.write\s*\(/g,
    severity: CheckSeverity.Warning,
    message: 'document.write usage - potential XSS risk'
  },
  {
    id: 'eval-usage',
    name: 'eval() Usage',
    pattern: /\beval\s*\(/g,
    severity: CheckSeverity.Error,
    message: 'eval() usage - high security risk'
  }
];

/**
 * Patterns for path traversal vulnerabilities
 */
const PATH_TRAVERSAL_PATTERNS: SecurityPattern[] = [
  {
    id: 'path-join-user-input',
    name: 'Path Join with User Input',
    pattern: /path\.(?:join|resolve)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi,
    severity: CheckSeverity.Warning,
    message: 'Path manipulation with user input - validate for traversal'
  },
  {
    id: 'fs-user-input',
    name: 'File System with User Input',
    pattern: /fs\.(?:readFile|writeFile|readdir|unlink|rmdir)\s*\([^)]*(?:req\.|request\.|params\.|query\.|body\.)/gi,
    severity: CheckSeverity.Error,
    message: 'File system operation with user input - high risk'
  }
];

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  secretPatterns: SECRET_PATTERNS.map(p => p.pattern),
  sqlInjectionPatterns: SQL_INJECTION_PATTERNS.map(p => p.pattern),
  additionalPatterns: [
    ...SECRET_PATTERNS,
    ...SQL_INJECTION_PATTERNS,
    ...XSS_PATTERNS,
    ...PATH_TRAVERSAL_PATTERNS
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/test/**',
    '**/tests/**',
    '**/*.md',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml'
  ]
};

// ============================================================================
// Ignore Comment Support
// ============================================================================

/**
 * Patterns for ignore comments
 * Supports:
 * - // preCr-ignore-next-line
 * - // preCr-ignore
 * - block comment: preCr-ignore
 * - // preCr-ignore:pattern-id (specific pattern)
 * - // preCr-ignore-next-line:pattern-id
 */
const IGNORE_PATTERNS = {
  nextLine: /\/\/\s*preCr-ignore-next-line(?::([a-z-]+))?\s*$/i,
  inline: /\/\/\s*preCr-ignore(?::([a-z-]+))?\s*$/i,
  inlineBlock: /\/\*\s*preCr-ignore(?::([a-z-]+))?\s*\*\//i,
};

/**
 * Check if a line should be ignored based on ignore comments
 * @param lines All lines in the file
 * @param lineIndex Current line index (0-based)
 * @param patternId The pattern ID being checked
 * @returns true if the finding should be ignored
 */
function shouldIgnoreLine(lines: string[], lineIndex: number, patternId: string): boolean {
  const currentLine = lines[lineIndex];
  
  // Check for inline ignore comment on current line
  const inlineMatch = currentLine.match(IGNORE_PATTERNS.inline) || 
                      currentLine.match(IGNORE_PATTERNS.inlineBlock);
  if (inlineMatch) {
    const specifiedPattern = inlineMatch[1];
    // If no specific pattern specified, ignore all; otherwise check match
    if (!specifiedPattern || specifiedPattern === patternId) {
      return true;
    }
  }
  
  // Check for ignore-next-line on previous line
  if (lineIndex > 0) {
    const prevLine = lines[lineIndex - 1];
    const nextLineMatch = prevLine.match(IGNORE_PATTERNS.nextLine);
    if (nextLineMatch) {
      const specifiedPattern = nextLineMatch[1];
      if (!specifiedPattern || specifiedPattern === patternId) {
        return true;
      }
    }
  }
  
  return false;
}

// ============================================================================
// File Exclusion Helpers
// ============================================================================

/**
 * Check if a file should be excluded from scanning
 */
function shouldExcludeFile(filePath: string, excludePatterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Quick checks for common exclusions
  if (normalizedPath.includes('node_modules/')) return true;
  if (normalizedPath.includes('__tests__/')) return true;
  if (normalizedPath.includes('__mocks__/')) return true;
  
  for (const pattern of excludePatterns) {
    // Simple glob matching
    const regexPattern = pattern
      .replace(/\./g, '\\.')  // Escape dots first
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`);
    if (regex.test(normalizedPath)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a line is likely a false positive
 */
function isFalsePositive(line: string, patternId: string): boolean {
  const trimmed = line.trim();
  
  // Skip comments
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return true;
  }
  
  // Skip example/placeholder values
  const placeholders = [
    'your-api-key',
    'your_api_key',
    'xxx',
    'example',
    'placeholder',
    'changeme',
    'TODO',
    'FIXME',
    '<your-',
    'process.env.',
    'import.meta.env.',
    'env.',
    'config.',
    'process.env['
  ];
  
  const lowerLine = line.toLowerCase();
  for (const placeholder of placeholders) {
    if (lowerLine.includes(placeholder.toLowerCase())) {
      return true;
    }
  }
  
  // Skip test files patterns
  if (patternId.startsWith('sql-') || patternId.startsWith('xss-')) {
    // These are less likely to be false positives
    return false;
  }
  
  // Skip if it's reading from environment
  if (/process\.env\.[A-Z_]+/.test(line)) {
    return true;
  }
  
  return false;
}

// ============================================================================
// Scanner
// ============================================================================

export interface FileContent {
  path: string;
  content: string;
}

/**
 * Scan files for security issues
 */
export function scanSecurity(
  files: FileContent[],
  config: Partial<SecurityConfig> = {}
): SecurityResult {
  const logger = getLogger();
  const fullConfig: SecurityConfig = {
    ...DEFAULT_SECURITY_CONFIG,
    ...config
  };
  
  const findings: SecurityFinding[] = [];
  let scannedFiles = 0;
  let skippedFiles = 0;
  
  for (const file of files) {
    // Check exclusions
    if (shouldExcludeFile(file.path, fullConfig.excludePatterns)) {
      skippedFiles++;
      continue;
    }
    
    scannedFiles++;
    const lines = file.content.split('\n');
    
    // Check each pattern
    for (const pattern of fullConfig.additionalPatterns) {
      // Reset regex state
      pattern.pattern.lastIndex = 0;
      
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        pattern.pattern.lastIndex = 0;
        
        let match;
        while ((match = pattern.pattern.exec(line)) !== null) {
          // Skip if ignored via comment
          if (shouldIgnoreLine(lines, lineNum, pattern.id)) {
            continue;
          }
          
          // Skip false positives
          if (isFalsePositive(line, pattern.id)) {
            continue;
          }
          
          const finding: SecurityFinding = {
            type: categorizePattern(pattern.id),
            pattern: pattern.id,
            severity: pattern.severity,
            file: file.path,
            line: lineNum + 1,
            snippet: truncateSnippet(line, match.index, match[0].length),
            message: pattern.message
          };
          
          // Avoid duplicate findings on same line for same pattern
          const isDuplicate = findings.some(
            f => f.file === finding.file && 
                 f.line === finding.line && 
                 f.pattern === finding.pattern
          );
          
          if (!isDuplicate) {
            findings.push(finding);
          }
        }
      }
    }
  }
  
  logger.info('Security scan complete', {
    scannedFiles,
    skippedFiles,
    findingsCount: findings.length
  });
  
  return {
    findings,
    scannedFiles,
    skippedFiles
  };
}

/**
 * Categorize pattern ID into finding type
 */
function categorizePattern(patternId: string): SecurityFinding['type'] {
  if (patternId.startsWith('sql-')) return 'sql-injection';
  if (patternId.includes('xss') || patternId.includes('innerhtml') || patternId.includes('eval')) return 'xss';
  if (patternId.includes('path')) return 'path-traversal';
  if (SECRET_PATTERNS.some(p => p.id === patternId)) return 'secret';
  return 'other';
}

/**
 * Truncate snippet around match for display
 */
function truncateSnippet(line: string, matchIndex: number, matchLength: number): string {
  const maxLength = 100;
  const contextChars = 20;
  
  if (line.length <= maxLength) {
    return line.trim();
  }
  
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(line.length, matchIndex + matchLength + contextChars);
  
  let snippet = line.substring(start, end).trim();
  
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < line.length) {
    snippet = snippet + '...';
  }
  
  return snippet;
}

/**
 * Quick check if content might contain secrets (for performance)
 */
export function mightContainSecrets(content: string): boolean {
  const quickPatterns = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /-----BEGIN/,
    /ghp_/,
    /sk_live/,
    /sk_test/,
    /AKIA/
  ];
  
  return quickPatterns.some(p => p.test(content));
}
