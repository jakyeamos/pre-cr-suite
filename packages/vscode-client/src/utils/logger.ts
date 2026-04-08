/**
 * Structured Logging Utility
 * 
 * Provides consistent, leveled logging with:
 * - Log levels (debug, info, warn, error)
 * - Structured metadata
 * - Output channel integration
 * - Performance timing
 * - Error tracking hooks
 */

import * as vscode from 'vscode';

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  error?: Error;
}

export interface LoggerOptions {
  context?: string;
  minLevel?: LogLevel;
}

type ErrorHandler = (entry: LogEntry) => void;

// ============================================================================
// Log Level Priorities
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private outputChannel: vscode.OutputChannel | null = null;
  private minLevel: LogLevel = 'info';
  private errorHandlers: ErrorHandler[] = [];
  private defaultContext = 'Pre-CR';

  /**
   * Initialize the logger with VS Code output channel
   */
  init(outputChannel: vscode.OutputChannel, minLevel?: LogLevel): void {
    this.outputChannel = outputChannel;
    if (minLevel) {
      this.minLevel = minLevel;
    }
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Register an error handler (for telemetry, error reporting, etc.)
   */
  onError(handler: ErrorHandler): vscode.Disposable {
    this.errorHandlers.push(handler);
    return {
      dispose: () => {
        const index = this.errorHandlers.indexOf(handler);
        if (index >= 0) {
          this.errorHandlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Create a child logger with a specific context
   */
  child(context: string): ContextLogger {
    return new ContextLogger(this, context);
  }

  /**
   * Start a timer for performance measurement
   */
  time(label: string, context?: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.log('debug', `${label} completed`, context, { duration: `${duration.toFixed(2)}ms` });
    };
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, undefined, metadata);
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, undefined, metadata);
  }

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, undefined, metadata);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log('error', message, undefined, { ...metadata, error: error?.message, stack: error?.stack });
    
    // Notify error handlers
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date(),
      metadata,
      error
    };
    
    for (const handler of this.errorHandlers) {
      try {
        handler(entry);
      } catch (e) {
        console.error('Error in log handler:', e);
      }
    }
  }

  /**
   * Core logging method
   */
  log(
    level: LogLevel, 
    message: string, 
    context?: string, 
    metadata?: Record<string, unknown>
  ): void {
    // Check if we should log this level
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const ctx = context || this.defaultContext;
    const levelStr = level.toUpperCase().padEnd(5);
    
    // Format message
    let formattedMessage = `[${timestamp}] ${levelStr} [${ctx}] ${message}`;
    
    // Add metadata if present
    if (metadata && Object.keys(metadata).length > 0) {
      const metaStr = Object.entries(metadata)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      formattedMessage += ` | ${metaStr}`;
    }

    // Output to channel
    if (this.outputChannel) {
      this.outputChannel.appendLine(formattedMessage);
    }

    // Also log to console for development
    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }
}

// ============================================================================
// Context Logger (child logger with fixed context)
// ============================================================================

class ContextLogger {
  constructor(
    private parent: Logger,
    private context: string
  ) {}

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.parent.log('debug', message, this.context, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.parent.log('info', message, this.context, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.parent.log('warn', message, this.context, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.parent.log('error', message, this.context, { ...metadata, error: error?.message });
  }

  time(label: string): () => void {
    return this.parent.time(label, this.context);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const logger = new Logger();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize the logger (call once during extension activation)
 */
export function initLogger(
  outputChannel: vscode.OutputChannel, 
  minLevel?: LogLevel
): void {
  logger.init(outputChannel, minLevel);
}

/**
 * Create a child logger for a specific module
 */
export function createLogger(context: string): ContextLogger {
  return logger.child(context);
}

/**
 * Wrap an async function with automatic timing
 */
export function withTiming<T>(
  label: string,
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  const end = logger.time(label, context);
  return fn().finally(end);
}

/**
 * Wrap an async function with automatic error logging
 */
export async function withErrorLogging<T>(
  label: string,
  fn: () => Promise<T>,
  context?: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logger.log('error', `${label} failed`, context, { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}
