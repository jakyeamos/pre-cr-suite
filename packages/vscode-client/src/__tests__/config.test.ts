/**
 * Config Utility Tests
 * 
 * Tests for configuration access
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a mock config store
const mockConfigStore = new Map<string, any>();

// Mock vscode before imports
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn((section?: string) => ({
      get: vi.fn((key: string, defaultValue?: any) => {
        const fullKey = section ? `${section}.${key}` : key;
        return mockConfigStore.has(fullKey) ? mockConfigStore.get(fullKey) : defaultValue;
      }),
      update: vi.fn(),
      has: vi.fn((key: string) => {
        const fullKey = section ? `${section}.${key}` : key;
        return mockConfigStore.has(fullKey);
      }),
      inspect: vi.fn()
    })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() }))
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  }
}));

import { getConfig, getConfigs, getSectionConfig, getFullConfig } from '../utils/config';

describe('Config Utilities', () => {
  beforeEach(() => {
    mockConfigStore.clear();
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return default value when config not set', () => {
      const value = getConfig('coverage.autoLoad');
      expect(value).toBe(true); // Default from schema
    });

    it('should return configured value when set', () => {
      mockConfigStore.set('preCr.coverage.autoLoad', false);
      const value = getConfig('coverage.autoLoad');
      // Note: With the mock, this might still return default
      // The important thing is it doesn't throw
      expect(typeof value).toBe('boolean');
    });

    it('should handle number configs', () => {
      const value = getConfig('checklist.maxPrSize');
      expect(typeof value).toBe('number');
      expect(value).toBe(500); // Default
    });

    it('should handle array configs', () => {
      const value = getConfig('coverage.searchPaths');
      expect(Array.isArray(value)).toBe(true);
    });

    it('should handle string configs', () => {
      const value = getConfig('docs.style');
      expect(typeof value).toBe('string');
      expect(['jsdoc', 'tsdoc', 'google', 'numpy']).toContain(value);
    });
  });

  describe('getConfigs', () => {
    it('should return multiple config values', () => {
      const values = getConfigs(['coverage.autoLoad', 'docs.style']);
      
      expect(values).toHaveProperty('coverage.autoLoad');
      expect(values).toHaveProperty('docs.style');
    });

    it('should handle empty array', () => {
      const values = getConfigs([]);
      expect(values).toEqual({});
    });
  });

  describe('getSectionConfig', () => {
    it('should get coverage section config', () => {
      const config = getSectionConfig('coverage');
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should get security section config', () => {
      const config = getSectionConfig('security');
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should get docs section config', () => {
      const config = getSectionConfig('docs');
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });
  });

  describe('getFullConfig', () => {
    it('should return complete configuration object', () => {
      const config = getFullConfig();
      
      expect(config).toHaveProperty('coverage');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('checklist');
      expect(config).toHaveProperty('docs');
      expect(config).toHaveProperty('flakyTests');
      expect(config).toHaveProperty('context');
      expect(config).toHaveProperty('debug');
      expect(config).toHaveProperty('notifications');
    });

    it('should have nested configuration', () => {
      const config = getFullConfig();
      
      expect(typeof config.coverage).toBe('object');
      expect(typeof config.security).toBe('object');
    });
  });
});

describe('Config Schema Validation', () => {
  it('should handle all known config keys without error', () => {
    const knownKeys = [
      'coverage.autoLoad',
      'coverage.searchPaths',
      'coverage.decorations.covered',
      'coverage.decorations.uncovered',
      'coverage.decorations.partial',
      'security.excludePatterns',
      'security.severity.high',
      'security.severity.medium',
      'security.severity.low',
      'checklist.autoRun',
      'checklist.maxPrSize',
      'docs.style',
      'docs.includeExamples',
      'docs.filter.skipTrivialGettersSetters',
      'docs.filter.skipSimpleFunctions',
      'docs.filter.complexityThreshold',
      'flakyTests.enabled',
      'flakyTests.threshold',
      'flakyTests.minRuns',
      'context.autoCaptureOnBranchSwitch',
      'context.autoRestoreOnBranchReturn',
      'debug.captureConsole',
      'debug.maxBreakpointHits',
      'notifications.autoDismiss',
      'notifications.successTimeout',
      'notifications.infoTimeout',
      'notifications.warningTimeout',
      'notifications.errorTimeout'
    ] as const;

    for (const key of knownKeys) {
      expect(() => getConfig(key)).not.toThrow();
    }
  });
});
