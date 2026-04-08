/**
 * Validation utilities for coverage file processing
 * 
 * Security considerations:
 * - Path traversal attacks
 * - Symlink attacks
 * - Large file DoS
 * - Malformed input handling
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from './logger';

/**
 * Validation limits
 */
export const LIMITS = {
  /** Maximum file size in bytes (10MB) */
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  /** File size warning threshold (5MB) */
  MAX_FILE_SIZE_WARN_BYTES: 5 * 1024 * 1024,
  /** Maximum line count to process */
  MAX_LINE_COUNT: 500_000,
  /** Maximum path length */
  MAX_PATH_LENGTH: 4096
} as const;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
  fileSize?: number;
}

/**
 * Validate a coverage file before parsing
 */
export function validateCoverageFile(
  filePath: string,
  workspaceRoot: string
): ValidationResult {
  const logger = getLogger();

  // Check path length
  if (filePath.length > LIMITS.MAX_PATH_LENGTH) {
    logger.warn('Path too long', { pathLength: filePath.length });
    return {
      valid: false,
      error: `File path exceeds maximum length of ${LIMITS.MAX_PATH_LENGTH} characters`
    };
  }

  // Normalize and resolve path
  const normalizedPath = path.normalize(filePath);
  const resolvedPath = path.resolve(workspaceRoot, normalizedPath);

  // Check for path traversal
  if (!resolvedPath.startsWith(workspaceRoot)) {
    logger.warn('Path traversal attempt detected', { 
      requested: filePath, 
      resolved: resolvedPath,
      workspace: workspaceRoot 
    });
    return {
      valid: false,
      error: 'Coverage file path is outside workspace directory'
    };
  }

  // Check file exists
  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      error: `Coverage file not found: ${resolvedPath}`
    };
  }

  // Get file stats
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(resolvedPath);
  } catch (err) {
    logger.error('Failed to stat file', err, { path: resolvedPath });
    return {
      valid: false,
      error: `Cannot read file: ${String(err)}`
    };
  }

  // Check it's a file, not directory
  if (stats.isDirectory()) {
    return {
      valid: false,
      error: 'Path is a directory, not a file'
    };
  }

  // If symlink, verify target is within workspace
  if (stats.isSymbolicLink()) {
    try {
      const realPath = fs.realpathSync(resolvedPath);
      if (!realPath.startsWith(workspaceRoot)) {
        logger.warn('Symlink points outside workspace', { 
          symlink: resolvedPath, 
          target: realPath 
        });
        return {
          valid: false,
          error: 'Symbolic link points outside workspace directory'
        };
      }
    } catch (err) {
      return {
        valid: false,
        error: `Cannot resolve symbolic link: ${String(err)}`
      };
    }
  }

  // Check file size
  const fileSize = stats.size;
  if (fileSize > LIMITS.MAX_FILE_SIZE_BYTES) {
    logger.warn('File too large', { 
      path: resolvedPath, 
      size: fileSize, 
      limit: LIMITS.MAX_FILE_SIZE_BYTES 
    });
    return {
      valid: false,
      error: `Coverage file is too large (${formatBytes(fileSize)}). Maximum size is ${formatBytes(LIMITS.MAX_FILE_SIZE_BYTES)}`
    };
  }

  // Warn for large files
  if (fileSize > LIMITS.MAX_FILE_SIZE_WARN_BYTES) {
    logger.info('Large coverage file', { path: resolvedPath, size: fileSize });
    return {
      valid: true,
      warning: `Coverage file is large (${formatBytes(fileSize)}). Parsing may take a moment.`,
      fileSize
    };
  }

  return { valid: true, fileSize };
}

/**
 * Validate a source file path from coverage data
 */
export function validateSourcePath(
  sourcePath: string,
  workspaceRoot: string
): { valid: boolean; resolvedPath?: string; error?: string } {
  // Normalize the path
  const normalized = path.normalize(sourcePath);
  
  // Resolve relative paths
  const resolved = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(workspaceRoot, normalized);

  // Check for null bytes
  if (sourcePath.includes('\0') || resolved.includes('\0')) {
    return {
      valid: false,
      error: 'Path contains null bytes'
    };
  }

  return { valid: true, resolvedPath: resolved };
}

/**
 * Sanitize a string for safe display
 */
export function sanitizeForDisplay(input: string): string {
  // Remove control characters except newlines and tabs
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Format bytes for human-readable display
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
