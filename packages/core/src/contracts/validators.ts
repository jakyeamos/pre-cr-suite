import type {
  GetCoverageDecorationsParams,
  GetCoverageParams,
  RunPreCrCheckParams,
  WorkspaceRequestParams
} from '../protocol';
import type { ReadinessScope } from './readiness';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEmptyRequestParams(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

function isReadinessScope(value: unknown): value is ReadinessScope {
  return value === 'staged' || value === 'worktree';
}

export function isWorkspaceRequestParams(value: unknown): value is WorkspaceRequestParams {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'workspaceUri')) {
    return false;
  }

  return value.workspaceUri === undefined || (
    typeof value.workspaceUri === 'string' && value.workspaceUri.length > 0
  );
}

export function isRunPreCrCheckParams(value: unknown): value is RunPreCrCheckParams {
  if (!isRecord(value) || !isWorkspaceRequestParams({ workspaceUri: value.workspaceUri })) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'workspaceUri' && key !== 'scope')) {
    return false;
  }

  return value.scope === undefined || isReadinessScope(value.scope);
}

export function isGetCoverageParams(value: unknown): value is GetCoverageParams {
  return isRecord(value) && typeof value.uri === 'string' && value.uri.length > 0;
}

export function isGetCoverageDecorationsParams(value: unknown): value is GetCoverageDecorationsParams {
  if (!isRecord(value) || !isRecord(value.textDocument)) {
    return false;
  }

  return typeof value.textDocument.uri === 'string' && value.textDocument.uri.length > 0;
}

export function assertRequestParams<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
  method: string
): T {
  if (!guard(value)) {
    throw new Error(`Invalid parameters for ${method}`);
  }

  return value;
}
