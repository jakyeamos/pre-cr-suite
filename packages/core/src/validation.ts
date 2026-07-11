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

export type WorkspacePathAccess = 'read' | 'write';

export interface ResolveWorkspacePathOptions {
  /**
   * A read target must exist unless allowMissing is explicitly enabled. Write
   * targets validate their nearest existing parent instead.
   */
  access?: WorkspacePathAccess;
  allowMissing?: boolean;
  /** Coverage reporters may provide absolute paths; still require containment. */
  allowAbsolute?: boolean;
}

export type WorkspacePathErrorCode =
  | 'path-too-long'
  | 'nul-byte'
  | 'absolute-path'
  | 'workspace-unavailable'
  | 'outside-workspace'
  | 'not-found'
  | 'not-directory'
  | 'unresolvable-path';

export interface WorkspacePathSuccess {
  valid: true;
  workspaceRoot: string;
  /** Absolute lexical path beneath workspaceRoot. */
  resolvedPath: string;
  /** Canonical target path when the target already exists. */
  realPath?: string;
  /** Canonical nearest existing parent when a target may be created. */
  realParentPath?: string;
}

export interface WorkspacePathFailure {
  valid: false;
  code: WorkspacePathErrorCode;
  error: string;
  /** Present when lexical resolution succeeded before validation failed. */
  resolvedPath?: string;
}

export type WorkspacePathResult = WorkspacePathSuccess | WorkspacePathFailure;

/**
 * Resolve an untrusted path only when it remains inside a real workspace root.
 *
 * Existing targets are resolved through realpath so symlink escapes are rejected.
 * Missing write targets validate the nearest existing parent for the same reason.
 */
export function resolveWorkspacePath(
  workspaceRoot: string,
  requestedPath: string,
  options: ResolveWorkspacePathOptions = {}
): WorkspacePathResult {
  const access = options.access ?? 'read';
  const allowMissing = options.allowMissing ?? access === 'write';

  if (requestedPath.length > LIMITS.MAX_PATH_LENGTH) {
    return {
      valid: false,
      code: 'path-too-long',
      error: `Path exceeds maximum length of ${LIMITS.MAX_PATH_LENGTH} characters`
    };
  }

  if (requestedPath.includes('\0')) {
    return {
      valid: false,
      code: 'nul-byte',
      error: 'Path contains null bytes'
    };
  }

  const requestedPathIsAbsolute = path.isAbsolute(requestedPath) || path.win32.isAbsolute(requestedPath);
  if (requestedPathIsAbsolute && options.allowAbsolute !== true) {
    return {
      valid: false,
      code: 'absolute-path',
      error: 'Absolute paths are not allowed'
    };
  }

  let realWorkspaceRoot: string;
  try {
    realWorkspaceRoot = fs.realpathSync(workspaceRoot);
  } catch (error) {
    return {
      valid: false,
      code: 'workspace-unavailable',
      error: `Cannot resolve workspace root: ${String(error)}`
    };
  }

  const lexicalWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedPath = requestedPathIsAbsolute
    ? path.resolve(requestedPath)
    : path.resolve(lexicalWorkspaceRoot, requestedPath);
  if (!isContainedPath(lexicalWorkspaceRoot, resolvedPath)) {
    return {
      valid: false,
      code: 'outside-workspace',
      error: 'Path is outside workspace directory',
      resolvedPath
    };
  }

  const targetState = getPathState(resolvedPath);
  if (targetState.error) {
    return {
      valid: false,
      code: 'unresolvable-path',
      error: `Cannot inspect path: ${String(targetState.error)}`,
      resolvedPath
    };
  }

  if (targetState.exists) {
    let realPath: string;
    try {
      realPath = fs.realpathSync(resolvedPath);
    } catch (error) {
      return {
        valid: false,
        code: 'unresolvable-path',
        error: `Cannot resolve path: ${String(error)}`,
        resolvedPath
      };
    }

    if (!isContainedPath(realWorkspaceRoot, realPath)) {
      return {
        valid: false,
        code: 'outside-workspace',
        error: 'Path resolves outside workspace directory',
        resolvedPath
      };
    }

    return {
      valid: true,
      workspaceRoot: realWorkspaceRoot,
      resolvedPath,
      realPath
    };
  }

  if (!allowMissing) {
    return {
      valid: false,
      code: 'not-found',
      error: 'Path does not exist',
      resolvedPath
    };
  }

  const parentResult = resolveExistingParent(path.dirname(resolvedPath));
  if (!parentResult.valid) {
    return {
      valid: false,
      code: parentResult.code,
      error: parentResult.error,
      resolvedPath
    };
  }

  if (!isContainedPath(realWorkspaceRoot, parentResult.realPath)) {
    return {
      valid: false,
      code: 'outside-workspace',
      error: 'Path parent resolves outside workspace directory',
      resolvedPath
    };
  }

  return {
    valid: true,
    workspaceRoot: realWorkspaceRoot,
    resolvedPath,
    realParentPath: parentResult.realPath
  };
}

function getPathState(filePath: string): { exists: boolean; error?: unknown } {
  try {
    fs.lstatSync(filePath);
    return { exists: true };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { exists: false };
    }

    return { exists: false, error };
  }
}

function resolveExistingParent(startPath: string):
  | { valid: true; realPath: string }
  | { valid: false; code: WorkspacePathErrorCode; error: string } {
  let currentPath = startPath;
  let hasParentToInspect = true;

  while (hasParentToInspect) {
    const state = getPathState(currentPath);
    if (state.error) {
      return {
        valid: false,
        code: 'unresolvable-path',
        error: `Cannot inspect path parent: ${String(state.error)}`
      };
    }

    if (state.exists) {
      try {
        const realPath = fs.realpathSync(currentPath);
        if (!fs.statSync(realPath).isDirectory()) {
          return {
            valid: false,
            code: 'not-directory',
            error: 'Path parent is not a directory'
          };
        }

        return { valid: true, realPath };
      } catch (error) {
        return {
          valid: false,
          code: 'unresolvable-path',
          error: `Cannot resolve path parent: ${String(error)}`
        };
      }
    }

    const nextPath = path.dirname(currentPath);
    if (nextPath === currentPath) {
      hasParentToInspect = false;
      continue;
    }

    currentPath = nextPath;
  }

  return {
    valid: false,
    code: 'not-found',
    error: 'No existing parent directory found for path'
  };
}

function isContainedPath(workspaceRoot: string, targetPath: string): boolean {
  const relativePath = path.relative(workspaceRoot, targetPath);
  return relativePath === '' || (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
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

  const pathResult = resolveWorkspacePath(workspaceRoot, filePath);
  if (!pathResult.valid) {
    logger.warn('Invalid coverage file path', {
      requested: filePath,
      error: pathResult.error,
      workspace: workspaceRoot
    });
    return {
      valid: false,
      error: pathResult.code === 'not-found'
        ? `Coverage file not found: ${pathResult.resolvedPath ?? filePath}`
        : pathResult.error
    };
  }

  const resolvedPath = pathResult.resolvedPath;

  // Get file stats
  let stats: fs.Stats;
  try {
    stats = fs.statSync(pathResult.realPath ?? resolvedPath);
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
  const pathResult = resolveWorkspacePath(workspaceRoot, sourcePath, {
    access: 'read',
    allowMissing: true
  });
  if (!pathResult.valid) {
    return {
      valid: false,
      error: pathResult.error
    };
  }

  return { valid: true, resolvedPath: pathResult.resolvedPath };
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
