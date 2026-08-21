import { resolveWorkspacePath } from '@pre-cr/core';

export type ReadableWorkspacePath =
  | { valid: true; path: string }
  | { valid: false; error: string };

/** Resolve an LSP-provided read path without allowing workspace escape. */
export function resolveReadableWorkspacePath(
  workspaceRoot: string,
  requestedPath: unknown
): ReadableWorkspacePath {
  if (typeof requestedPath !== 'string') {
    return { valid: false, error: 'Rejected workspace path: path must be a string' };
  }

  const result = resolveWorkspacePath(workspaceRoot, requestedPath, {
    access: 'read',
    allowMissing: true
  });
  if (!result.valid) {
    return { valid: false, error: `Rejected workspace path: ${result.error}` };
  }

  return { valid: true, path: result.realPath ?? result.resolvedPath };
}
