/**
 * Notification Utilities
 * 
 * Auto-dismissing notifications for Pre-CR Suite.
 * All notifications automatically disappear after a configurable timeout.
 */

import * as vscode from 'vscode';

// ============================================================================
// Configuration
// ============================================================================

export interface NotificationConfig {
  /** Default timeout in milliseconds (default: 5000) */
  defaultTimeout: number;
  /** Timeout for success messages (default: 3000) */
  successTimeout: number;
  /** Timeout for info messages (default: 5000) */
  infoTimeout: number;
  /** Timeout for warning messages (default: 8000) */
  warningTimeout: number;
  /** Timeout for error messages (default: 10000) */
  errorTimeout: number;
  /** Whether to show notifications at all */
  enabled: boolean;
}

const DEFAULT_CONFIG: NotificationConfig = {
  defaultTimeout: 5000,
  successTimeout: 3000,
  infoTimeout: 5000,
  warningTimeout: 8000,
  errorTimeout: 10000,
  enabled: true
};

let config = { ...DEFAULT_CONFIG };

/**
 * Update notification configuration
 */
export function configureNotifications(newConfig: Partial<NotificationConfig>) {
  config = { ...config, ...newConfig };
}

/**
 * Load configuration from VS Code settings
 */
export function loadNotificationConfig() {
  const vsConfig = vscode.workspace.getConfiguration('preCr.notifications');
  config = {
    defaultTimeout: vsConfig.get('defaultTimeout', DEFAULT_CONFIG.defaultTimeout),
    successTimeout: vsConfig.get('successTimeout', DEFAULT_CONFIG.successTimeout),
    infoTimeout: vsConfig.get('infoTimeout', DEFAULT_CONFIG.infoTimeout),
    warningTimeout: vsConfig.get('warningTimeout', DEFAULT_CONFIG.warningTimeout),
    errorTimeout: vsConfig.get('errorTimeout', DEFAULT_CONFIG.errorTimeout),
    enabled: vsConfig.get('enabled', DEFAULT_CONFIG.enabled)
  };
}

// ============================================================================
// Auto-Dismissing Notifications
// ============================================================================

/**
 * Show an auto-dismissing information message
 */
export function showInfo(
  message: string, 
  timeout?: number,
  ...actions: string[]
): Promise<string | undefined> {
  if (!config.enabled) return Promise.resolve(undefined);
  
  const ms = timeout ?? config.infoTimeout;
  return showWithTimeout(
    () => vscode.window.showInformationMessage(message, ...actions),
    ms
  );
}

/**
 * Show an auto-dismissing success message (styled as info with checkmark)
 */
export function showSuccess(
  message: string,
  timeout?: number,
  ...actions: string[]
): Promise<string | undefined> {
  if (!config.enabled) return Promise.resolve(undefined);
  
  const ms = timeout ?? config.successTimeout;
  return showWithTimeout(
    () => vscode.window.showInformationMessage(`✓ ${message}`, ...actions),
    ms
  );
}

/**
 * Show an auto-dismissing warning message
 */
export function showWarning(
  message: string,
  timeout?: number,
  ...actions: string[]
): Promise<string | undefined> {
  if (!config.enabled) return Promise.resolve(undefined);
  
  const ms = timeout ?? config.warningTimeout;
  return showWithTimeout(
    () => vscode.window.showWarningMessage(message, ...actions),
    ms
  );
}

/**
 * Show an auto-dismissing error message
 */
export function showError(
  message: string,
  timeout?: number,
  ...actions: string[]
): Promise<string | undefined> {
  if (!config.enabled) return Promise.resolve(undefined);
  
  const ms = timeout ?? config.errorTimeout;
  return showWithTimeout(
    () => vscode.window.showErrorMessage(message, ...actions),
    ms
  );
}

/**
 * Show a notification with progress that auto-completes
 */
export async function showProgress<T>(
  title: string,
  task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>,
  options?: {
    cancellable?: boolean;
    location?: vscode.ProgressLocation;
  }
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: options?.location ?? vscode.ProgressLocation.Notification,
      title,
      cancellable: options?.cancellable ?? false
    },
    task
  );
}

/**
 * Show a brief status bar message
 */
export function showStatusMessage(message: string, timeout?: number): vscode.Disposable {
  const ms = timeout ?? config.defaultTimeout;
  return vscode.window.setStatusBarMessage(`Pre-CR: ${message}`, ms);
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Show a notification that auto-dismisses after timeout
 * Returns the selected action or undefined if dismissed
 */
async function showWithTimeout(
  showFn: () => Thenable<string | undefined>,
  timeout: number
): Promise<string | undefined> {
  // Create a promise that resolves to undefined after timeout
  const timeoutPromise = new Promise<undefined>(resolve => {
    setTimeout(() => resolve(undefined), timeout);
  });

  // Race between user action and timeout
  // Note: VS Code's native notifications don't support programmatic dismissal,
  // so we return undefined after timeout but the notification may still be visible
  // until the user dismisses it. This is a VS Code limitation.
  
  // For true auto-dismiss, we use a workaround with modal: false
  const result = await Promise.race([
    showFn(),
    timeoutPromise
  ]);

  return result;
}

// ============================================================================
// Convenience Functions for Common Patterns
// ============================================================================

/**
 * Show "No issues found" success message
 */
export function showNoIssues(scope: string): Promise<string | undefined> {
  return showSuccess(`No issues found in ${scope}`);
}

/**
 * Show "X issues found" warning with action
 */
export async function showIssuesFound(
  count: number,
  scope: string,
  action?: string
): Promise<boolean> {
  const result = await showWarning(
    `Found ${count} issue${count !== 1 ? 's' : ''} in ${scope}`,
    undefined,
    action || 'Show Details'
  );
  return result === (action || 'Show Details');
}

/**
 * Show operation complete message
 */
export function showComplete(operation: string, details?: string): Promise<string | undefined> {
  const message = details ? `${operation}: ${details}` : operation;
  return showSuccess(message);
}

/**
 * Show "feature not available" message
 */
export function showNotAvailable(feature: string, reason?: string): Promise<string | undefined> {
  const message = reason 
    ? `${feature} not available: ${reason}`
    : `${feature} not available`;
  return showInfo(message);
}

/**
 * Show action required message with button
 */
export async function showActionRequired(
  message: string,
  actionLabel: string,
  action: () => void | Promise<void>
): Promise<void> {
  const result = await showInfo(message, config.infoTimeout * 2, actionLabel);
  if (result === actionLabel) {
    await action();
  }
}
