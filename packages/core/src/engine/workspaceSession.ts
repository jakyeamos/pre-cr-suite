import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import type {
  PreCrCheckResult,
  ProjectHealth
} from '../protocol';
import type { WorkspaceCoverage } from '../types';

export type WorkspaceSessionReadiness = 'ready' | 'warning' | 'blocked' | 'setup-needed';

export interface WorkspaceSession {
  readonly key: string;
  readonly workspaceRoot: string;
  trustedExecution: boolean;
  coverage: WorkspaceCoverage | null;
  coveragePath: string | null;
  health: ProjectHealth | null;
  lastResult: PreCrCheckResult | null;
  readiness: WorkspaceSessionReadiness;
}

export interface WorkspaceSessionUpdate {
  trustedExecution?: boolean;
  coverage?: WorkspaceCoverage | null;
  coveragePath?: string | null;
  health?: ProjectHealth | null;
  lastResult?: PreCrCheckResult | null;
  readiness?: WorkspaceSessionReadiness;
}

/**
 * Return a stable, canonical identity for a workspace path or file URI.
 * Missing roots are resolved lexically so initialization can still report a
 * useful setup-needed state before the folder exists on disk.
 */
export function canonicalWorkspaceRoot(input: string): string {
  const filePath = input.startsWith('file:') ? fileURLToPath(input) : input;
  const resolvedPath = path.resolve(filePath);

  try {
    return fs.realpathSync(resolvedPath);
  } catch {
    let existingPath = resolvedPath;
    while (!fs.existsSync(existingPath)) {
      const parentPath = path.dirname(existingPath);
      if (parentPath === existingPath) {
        return resolvedPath;
      }
      existingPath = parentPath;
    }

    const canonicalExistingPath = fs.realpathSync(existingPath);
    return path.normalize(path.join(
      canonicalExistingPath,
      path.relative(existingPath, resolvedPath)
    ));
  }
}

export function canonicalWorkspaceUri(input: string): string {
  return pathToFileURL(canonicalWorkspaceRoot(input)).toString();
}

export class WorkspaceSessionManager {
  private readonly sessions = new Map<string, WorkspaceSession>();

  getOrCreate(workspaceRoot: string, trustedExecution?: boolean): WorkspaceSession {
    const canonicalRoot = canonicalWorkspaceRoot(workspaceRoot);
    const existing = this.sessions.get(canonicalRoot);
    if (existing) {
      if (trustedExecution !== undefined) {
        existing.trustedExecution = trustedExecution;
      }
      return existing;
    }

    const session: WorkspaceSession = {
      key: canonicalRoot,
      workspaceRoot: canonicalRoot,
      trustedExecution: trustedExecution ?? false,
      coverage: null,
      coveragePath: null,
      health: null,
      lastResult: null,
      readiness: 'setup-needed'
    };
    this.sessions.set(canonicalRoot, session);
    return session;
  }

  get(workspaceRoot: string): WorkspaceSession | null {
    return this.sessions.get(canonicalWorkspaceRoot(workspaceRoot)) ?? null;
  }

  /** Resolve the most-specific session containing a filesystem path. */
  getForPath(filePath: string): WorkspaceSession | null {
    const canonicalPath = canonicalWorkspaceRoot(filePath);
    let match: WorkspaceSession | null = null;
    for (const session of this.sessions.values()) {
      const relativePath = path.relative(session.workspaceRoot, canonicalPath);
      const contained = relativePath === '' || (
        relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath)
      );
      if (contained && (!match || session.workspaceRoot.length > match.workspaceRoot.length)) {
        match = session;
      }
    }
    return match;
  }

  getForUri(uri: string): WorkspaceSession | null {
    if (!uri.startsWith('file:')) {
      return null;
    }
    try {
      return this.getForPath(fileURLToPath(uri));
    } catch {
      return null;
    }
  }

  update(workspaceRoot: string, update: WorkspaceSessionUpdate): WorkspaceSession {
    const session = this.getOrCreate(workspaceRoot);
    Object.assign(session, update);
    return session;
  }

  delete(workspaceRoot: string): boolean {
    return this.sessions.delete(canonicalWorkspaceRoot(workspaceRoot));
  }

  values(): WorkspaceSession[] {
    return [...this.sessions.values()];
  }

  clear(): void {
    this.sessions.clear();
  }
}
