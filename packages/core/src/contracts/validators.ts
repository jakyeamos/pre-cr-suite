import type {
  GetCoverageDecorationsParams,
  GetCoverageParams
} from '../protocol';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEmptyRequestParams(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
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
