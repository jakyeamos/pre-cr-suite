/**
 * Pre-CR Suite Utilities
 * 
 * Re-exports all utility modules for convenient imports
 */

// Notification utilities
export * as notify from './notifications';

// Status bar management
export * as statusBar from './statusBar';

// Error messages
export * as errors from './errors';

// Git operations (includes security utilities)
export * as git from './git';

// Workspace operations
export * as workspace from './workspace';

// Configuration with validation
export * as config from './config';

// LSP request helpers
export * as lsp from './lsp';

// Webview helpers with security
export * as webview from './webview';

// Structured logging
export * from './logger';

// Centralized state management
export * from './state';
