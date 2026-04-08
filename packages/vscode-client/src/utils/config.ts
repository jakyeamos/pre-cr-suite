/**
 * Configuration Utilities
 * 
 * Type-safe configuration access with validation and defaults
 */

import * as vscode from 'vscode';

/**
 * Configuration schema with defaults and validation
 */
interface ConfigEntry {
  type: 'boolean' | 'string' | 'number' | 'array';
  default: unknown;
  min?: number;
  max?: number;
  enum?: readonly string[];
}

const CONFIG_SCHEMA: Record<string, ConfigEntry> = {
  // Coverage settings
  'coverage.autoLoad': { type: 'boolean', default: true },
  'coverage.searchPaths': { 
    type: 'array', 
    default: ['coverage/lcov.info', 'coverage/coverage-final.json'] 
  },
  'coverage.decorations.covered': { type: 'string', default: 'rgba(0, 255, 0, 0.1)' },
  'coverage.decorations.uncovered': { type: 'string', default: 'rgba(255, 0, 0, 0.1)' },
  'coverage.decorations.partial': { type: 'string', default: 'rgba(255, 255, 0, 0.1)' },
  'coverage.threshold': { type: 'number', default: 80, min: 0, max: 100 },

  // Security settings
  'security.excludePatterns': { type: 'array', default: [] },
  'security.severity.high': { type: 'boolean', default: true },
  'security.severity.medium': { type: 'boolean', default: true },
  'security.severity.low': { type: 'boolean', default: false },
  'security.scanOnSave': { type: 'boolean', default: false },

  // Checklist settings
  'checklist.autoRun': { type: 'boolean', default: false },
  'checklist.maxPrSize': { type: 'number', default: 500, min: 50, max: 5000 },
  'checklist.maxFileSize': { type: 'number', default: 500, min: 50, max: 2000 },

  // Documentation settings
  'docs.style': { 
    type: 'string', 
    default: 'jsdoc', 
    enum: ['jsdoc', 'tsdoc', 'google', 'numpy'] 
  },
  'docs.includeExamples': { type: 'boolean', default: true },
  'docs.filter.skipTrivialGettersSetters': { type: 'boolean', default: true },
  'docs.filter.skipSimpleFunctions': { type: 'boolean', default: false },
  'docs.filter.complexityThreshold': { type: 'number', default: 3, min: 1, max: 20 },

  // Flaky test settings
  'flakyTests.enabled': { type: 'boolean', default: true },
  'flakyTests.threshold': { type: 'number', default: 0.8, min: 0.5, max: 1.0 },
  'flakyTests.minRuns': { type: 'number', default: 3, min: 2, max: 100 },

  // Context settings
  'context.autoCaptureOnBranchSwitch': { type: 'boolean', default: true },
  'context.autoRestoreOnBranchReturn': { type: 'boolean', default: true },

  // Debug settings
  'debug.captureConsole': { type: 'boolean', default: true },
  'debug.maxBreakpointHits': { type: 'number', default: 100, min: 10, max: 1000 },

  // Notification settings
  'notifications.autoDismiss': { type: 'boolean', default: true },
  'notifications.successTimeout': { type: 'number', default: 3000, min: 1000, max: 10000 },
  'notifications.infoTimeout': { type: 'number', default: 5000, min: 1000, max: 15000 },
  'notifications.warningTimeout': { type: 'number', default: 8000, min: 2000, max: 20000 },
  'notifications.errorTimeout': { type: 'number', default: 10000, min: 3000, max: 30000 },
};

/**
 * Get a validated configuration value
 */
export function getConfig<T = unknown>(key: string): T {
  const schema = CONFIG_SCHEMA[key];
  if (!schema) {
    throw new Error(`Unknown config key: ${key}`);
  }
  
  const config = vscode.workspace.getConfiguration('preCr');
  let value = config.get(key, schema.default);

  // Type validation and clamping for numbers
  if (schema.type === 'number' && typeof value === 'number') {
    let numValue = value;
    if (schema.min !== undefined && numValue < schema.min) {
      numValue = schema.min;
    }
    if (schema.max !== undefined && numValue > schema.max) {
      numValue = schema.max;
    }
    return numValue as T;
  }

  // Enum validation
  if (schema.enum && typeof value === 'string' && !schema.enum.includes(value)) {
    return schema.default as T;
  }

  return value as T;
}

/**
 * Get multiple configuration values at once
 */
export function getConfigs(keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = getConfig(key);
  }
  return result;
}

/**
 * Get all configuration for a section
 */
export function getSectionConfig(section: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Get all keys for this section
  for (const key of Object.keys(CONFIG_SCHEMA)) {
    if (key.startsWith(`${section}.`)) {
      const subKey = key.substring(section.length + 1);
      result[subKey] = getConfig(key);
    }
  }

  return result;
}

/**
 * Watch for configuration changes
 */
export function onConfigChange(
  callback: (key: string) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('preCr')) {
      // Find which specific key changed
      for (const key of Object.keys(CONFIG_SCHEMA)) {
        if (e.affectsConfiguration(`preCr.${key}`)) {
          callback(key);
        }
      }
    }
  });
}

/**
 * Get the full configuration object for LSP
 */
export function getFullConfig(): Record<string, unknown> {
  return {
    coverage: getSectionConfig('coverage'),
    security: getSectionConfig('security'),
    checklist: getSectionConfig('checklist'),
    docs: getSectionConfig('docs'),
    flakyTests: getSectionConfig('flakyTests'),
    context: getSectionConfig('context'),
    debug: getSectionConfig('debug'),
    notifications: getSectionConfig('notifications'),
  };
}

/**
 * Get all known config keys
 */
export function getConfigKeys(): string[] {
  return Object.keys(CONFIG_SCHEMA);
}
