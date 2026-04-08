/**
 * LSP Request Utilities
 * 
 * Type-safe request wrappers with standardized error handling
 */

import { LanguageClient } from 'vscode-languageclient/node';
import type { PreCrBetaMethod, PreCrBetaMethodMap } from '@pre-cr/core';
import * as notify from './notifications';

/**
 * Result type for LSP requests
 */
export type Result<T, E = string> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * LSP request methods used by Pre-CR
 */
export type ExperimentalPreCrMethod =
  // Coverage
  | '$/preCr/loadCoverage'
  // Security
  | '$/preCr/securityScan'
  | '$/preCr/quickSecurityScan'
  // Documentation
  | '$/preCr/generateDocs'
  | '$/preCr/generateDocAtCursor'
  | '$/preCr/checkDocHealth'
  // Checklist
  | '$/preCr/runChecklist'
  // Review
  | '$/preCr/estimateReviewTime'
  | '$/preCr/getFlakyTests'
  // Context
  | '$/preCr/captureContext'
  | '$/preCr/restoreContext'
  | '$/preCr/getContextSummary'
  // Debug
  | '$/preCr/initDebugManager'
  | '$/preCr/startDebugSession'
  | '$/preCr/endDebugSession'
  | '$/preCr/recordDebugStep'
  | '$/preCr/recordException'
  | '$/preCr/analyzeDebugSession'
  | '$/preCr/listDebugSessions';

export type PreCrMethod = PreCrBetaMethod | ExperimentalPreCrMethod;

/**
 * Send an LSP request with standardized error handling
 */
export async function sendRequest<T>(
  client: LanguageClient,
  method: PreCrMethod,
  params: unknown
): Promise<Result<T>> {
  try {
    const response = await client.sendRequest(method, params);
    const result = response as { error?: string } & T;

    if (result.error) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function sendBetaRequest<K extends PreCrBetaMethod>(
  client: LanguageClient,
  method: K,
  params: PreCrBetaMethodMap[K]['params']
): Promise<Result<PreCrBetaMethodMap[K]['result']>> {
  try {
    const response = await client.sendRequest(method, params);
    const result = response as { error?: string } & PreCrBetaMethodMap[K]['result'];

    if (result.error) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      data: result
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function sendBetaRequestWithNotify<K extends PreCrBetaMethod>(
  client: LanguageClient,
  method: K,
  params: PreCrBetaMethodMap[K]['params'],
  errorPrefix?: string
): Promise<PreCrBetaMethodMap[K]['result'] | null> {
  const result = await sendBetaRequest(client, method, params);

  if (!result.success) {
    const prefix = errorPrefix ?? method.split('/').pop() ?? 'Request';
    notify.showError(`${prefix} failed: ${result.error}`);
    return null;
  }

  return result.data;
}

/**
 * Send request and show error notification on failure
 */
export async function sendRequestWithNotify<T>(
  client: LanguageClient,
  method: PreCrMethod,
  params: unknown,
  errorPrefix?: string
): Promise<T | null> {
  const result = await sendRequest<T>(client, method, params);

  if (!result.success) {
    const prefix = errorPrefix ?? method.split('/').pop() ?? 'Request';
    notify.showError(`${prefix} failed: ${result.error}`);
    return null;
  }

  return result.data;
}

/**
 * Send request with progress indicator
 */
export async function sendRequestWithProgress<T>(
  client: LanguageClient,
  method: PreCrMethod,
  params: unknown,
  progressTitle: string
): Promise<Result<T>> {
  return notify.showProgress(progressTitle, async () => {
    return sendRequest<T>(client, method, params);
  });
}

/**
 * Check if client is ready
 */
export function isClientReady(client: LanguageClient | undefined): client is LanguageClient {
  return client !== undefined && client.isRunning();
}

/**
 * Ensure client is ready, show error if not
 */
export function ensureClientReady(client: LanguageClient | undefined): client is LanguageClient {
  if (!isClientReady(client)) {
    notify.showError('Pre-CR server not running. Try reloading the window.');
    return false;
  }
  return true;
}
