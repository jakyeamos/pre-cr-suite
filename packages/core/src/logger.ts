/**
 * Simple logger interface for core package
 * 
 * This can be implemented by any logging system (console, VS Code output channel,
 * LSP connection, etc.)
 */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
}

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  constructor(private prefix: string = 'PreCR') {}

  debug(message: string, data?: Record<string, unknown>): void {
    console.debug(`[${this.prefix}] ${message}`, data ?? '');
  }

  info(message: string, data?: Record<string, unknown>): void {
    console.info(`[${this.prefix}] ${message}`, data ?? '');
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(`[${this.prefix}] ${message}`, data ?? '');
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    console.error(`[${this.prefix}] ${message}`, error ?? '', data ?? '');
  }
}

/**
 * No-op logger (for when logging is disabled)
 */
export class NullLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Default logger instance (can be replaced)
 */
let defaultLogger: Logger = new ConsoleLogger();

/**
 * Get the default logger
 */
export function getLogger(): Logger {
  return defaultLogger;
}

/**
 * Set the default logger
 */
export function setLogger(logger: Logger): void {
  defaultLogger = logger;
}
