import * as fs from 'fs';
import * as path from 'path';

import type {
  LoadedPreCrProjectConfig,
  PreCrCoverageAdapterConfig,
  PreCrProjectConfig,
  PreCrSurfaceConfig
} from '../protocol';

const DEFAULT_COVERAGE_PATHS = [
  'coverage/lcov.info',
  'coverage/coverage-final.json',
  '.nyc_output/coverage.json'
];

export const DEFAULT_PRE_CR_CONFIG: PreCrProjectConfig = {
  version: 1,
  coveragePaths: DEFAULT_COVERAGE_PATHS,
  coverageFormat: 'auto',
  coverageAdapters: [],
  surfaces: {
    covered: [],
    ignored: [],
    unsupported: []
  },
  threshold: 80,
  excludePatterns: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/node_modules/**',
    '**/*.d.ts'
  ],
  checks: {
    coverage: true,
    security: false,
    checklist: false
  }
};

interface RawProjectConfig {
  version?: number;
  testCommand?: string;
  coveragePaths?: unknown;
  coveragePath?: unknown;
  coverageFormat?: unknown;
  coverageAdapters?: unknown;
  surfaces?: unknown;
  threshold?: unknown;
  excludePatterns?: unknown;
  checks?: unknown;
}

export function loadProjectConfig(workspaceRoot: string): LoadedPreCrProjectConfig {
  const configPath = path.join(workspaceRoot, '.pre-cr.json');

  if (!fs.existsSync(configPath)) {
    return {
      config: DEFAULT_PRE_CR_CONFIG,
      path: null,
      isLegacyConfig: false,
      warnings: []
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as RawProjectConfig;
    const warnings: string[] = [];
    const legacyCoveragePath =
      typeof raw.coveragePath === 'string' && raw.coveragePath.trim().length > 0
        ? raw.coveragePath.trim()
        : null;
    const coveragePaths = Array.isArray(raw.coveragePaths)
      ? raw.coveragePaths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    if (legacyCoveragePath && coveragePaths.length === 0) {
      warnings.push('Using legacy "coveragePath"; prefer "coveragePaths".');
    }

    const checks =
      typeof raw.checks === 'object' && raw.checks !== null
        ? raw.checks as Partial<PreCrProjectConfig['checks']>
        : {};

    const config: PreCrProjectConfig = {
      version: 1,
      testCommand: typeof raw.testCommand === 'string' && raw.testCommand.trim().length > 0
        ? raw.testCommand.trim()
        : undefined,
      coveragePaths: dedupeStrings(
        coveragePaths.length > 0
          ? coveragePaths
          : legacyCoveragePath
            ? [legacyCoveragePath]
            : DEFAULT_PRE_CR_CONFIG.coveragePaths
      ),
      coverageFormat:
        raw.coverageFormat === 'lcov' || raw.coverageFormat === 'istanbul' || raw.coverageFormat === 'auto'
          ? raw.coverageFormat
          : DEFAULT_PRE_CR_CONFIG.coverageFormat,
      coverageAdapters: parseCoverageAdapters(raw.coverageAdapters),
      surfaces: parseSurfaces(raw.surfaces),
      threshold:
        typeof raw.threshold === 'number' && Number.isFinite(raw.threshold)
          ? Math.max(0, Math.min(100, raw.threshold))
          : DEFAULT_PRE_CR_CONFIG.threshold,
      excludePatterns: Array.isArray(raw.excludePatterns)
        ? dedupeStrings(raw.excludePatterns.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))
        : DEFAULT_PRE_CR_CONFIG.excludePatterns,
      checks: {
        coverage: typeof checks.coverage === 'boolean' ? checks.coverage : DEFAULT_PRE_CR_CONFIG.checks.coverage,
        security: typeof checks.security === 'boolean' ? checks.security : DEFAULT_PRE_CR_CONFIG.checks.security,
        checklist: typeof checks.checklist === 'boolean' ? checks.checklist : DEFAULT_PRE_CR_CONFIG.checks.checklist
      }
    };

    return {
      config,
      path: configPath,
      isLegacyConfig: legacyCoveragePath !== null,
      warnings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: DEFAULT_PRE_CR_CONFIG,
      path: configPath,
      isLegacyConfig: false,
      warnings: [`Failed to parse .pre-cr.json: ${message}`]
    };
  }
}

export function resolveProjectPath(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig,
  relativePath: string
): string {
  const baseDirectory = loadedConfig.path ? path.dirname(loadedConfig.path) : workspaceRoot;
  return path.resolve(baseDirectory, relativePath);
}

export function inferCoverageFormat(filePath: string): Exclude<PreCrProjectConfig['coverageFormat'], 'auto'> {
  return filePath.endsWith('.json') ? 'istanbul' : 'lcov';
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function parseCoverageAdapters(value: unknown): PreCrCoverageAdapterConfig[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PRE_CR_CONFIG.coverageAdapters;
  }

  const adapters: PreCrCoverageAdapterConfig[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const command = typeof candidate.command === 'string' ? candidate.command.trim() : '';
    const coveragePath = typeof candidate.coveragePath === 'string' ? candidate.coveragePath.trim() : '';
    const coverageFormat = candidate.coverageFormat;

    if (
      name.length === 0 ||
      command.length === 0 ||
      coveragePath.length === 0 ||
      (coverageFormat !== 'lcov' && coverageFormat !== 'istanbul')
    ) {
      continue;
    }

    adapters.push({
      name,
      command,
      coveragePath,
      coverageFormat
    });
  }

  return adapters;
}

function parseSurfaces(value: unknown): PreCrSurfaceConfig {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_PRE_CR_CONFIG.surfaces;
  }

  const raw = value as Record<string, unknown>;
  return {
    covered: parseStringList(raw.covered),
    ignored: parseStringList(raw.ignored),
    unsupported: parseStringList(raw.unsupported)
  };
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0));
}
