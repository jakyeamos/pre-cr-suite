import * as fs from 'fs';
import { spawn } from 'child_process';

import { parseIstanbulFile } from '../parsers/istanbul';
import { parseLcovFile } from '../parsers/lcov';
import type {
  LoadedPreCrProjectConfig,
  PreCrCoverageAdapterConfig,
  PreCrCheckExecution,
  PreCrCheckResult,
  ProjectHealth,
  ProjectHealthIssue,
  RunPreCrCheckResult
} from '../protocol';
import type { WorkspaceCoverage } from '../types';
import { checkChangesCoverage } from '../runner/coverageChecker';
import {
  detectTestFramework,
  getCustomTestCommand,
  runTestsWithCoverage,
  type FrameworkDetectionResult,
  type TestFramework
} from '../runner/testRunner';
import { collectGitChangedFiles, isGitRepository } from './git';
import { inferCoverageFormat, loadProjectConfig, resolveProjectPath } from './config';
import { parseCommandString } from './command';

interface LoadedCoverage {
  coverage: WorkspaceCoverage | null;
  coveragePath: string | null;
  error?: string;
}

async function resolveFramework(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig
): Promise<{
  framework: TestFramework | null;
  source: 'config' | 'auto' | 'none';
  detection: FrameworkDetectionResult | null;
}> {
  const custom = getCustomTestCommand(workspaceRoot);
  if (custom) {
    return {
      framework: custom,
      source: 'config',
      detection: {
        framework: custom,
        detected: 'custom',
        configFile: loadedConfig.path
      }
    };
  }

  const detection = await detectTestFramework(workspaceRoot);
  if (!detection.framework) {
    return {
      framework: null,
      source: 'none',
      detection
    };
  }

  return {
    framework: detection.framework,
    source: 'auto',
    detection
  };
}

export function loadWorkspaceCoverage(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig
): LoadedCoverage {
  const coverageSources = [
    ...loadedConfig.config.coveragePaths.map((relativePath) => ({
      relativePath,
      format: loadedConfig.config.coverageFormat
    })),
    ...loadedConfig.config.coverageAdapters.map((adapter) => ({
      relativePath: adapter.coveragePath,
      format: adapter.coverageFormat
    }))
  ];

  for (const source of coverageSources) {
    const absolutePath = resolveProjectPath(workspaceRoot, loadedConfig, source.relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const format = source.format === 'auto'
      ? inferCoverageFormat(absolutePath)
      : source.format;
    const result = format === 'istanbul'
      ? parseIstanbulFile(absolutePath, workspaceRoot)
      : parseLcovFile(absolutePath, workspaceRoot);

    if (result.success && result.data) {
      return {
        coverage: result.data,
        coveragePath: absolutePath
      };
    }

    return {
      coverage: null,
      coveragePath: absolutePath,
      error: result.errors.map((entry) => entry.message).join(', ')
    };
  }

  return {
    coverage: null,
    coveragePath: null
  };
}

interface CoverageAdapterResult {
  success: boolean;
  coveragePath: string | null;
  coverageFormat: Exclude<LoadedPreCrProjectConfig['config']['coverageFormat'], 'auto'> | null;
  stdout: string;
  stderr: string;
  error?: string;
}

async function runCoverageAdapters(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig
): Promise<CoverageAdapterResult> {
  for (const adapter of loadedConfig.config.coverageAdapters) {
    const result = await runCoverageAdapter(workspaceRoot, loadedConfig, adapter);
    if (result.success && result.coveragePath) {
      return result;
    }
  }

  return {
    success: false,
    coveragePath: null,
    coverageFormat: null,
    stdout: '',
    stderr: '',
    error: loadedConfig.config.coverageAdapters.length > 0
      ? 'No configured coverage adapter produced a coverage report.'
      : undefined
  };
}

async function runCoverageAdapter(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig,
  adapter: PreCrCoverageAdapterConfig
): Promise<CoverageAdapterResult> {
  const parsed = parseCommandString(adapter.command);
  if (!parsed) {
    return {
      success: false,
      coveragePath: null,
      coverageFormat: null,
      stdout: '',
      stderr: '',
      error: `Invalid coverage adapter command for "${adapter.name}".`
    };
  }

  const startTime = Date.now();
  return new Promise((resolve) => {
    const child = spawn(parsed.command, parsed.args, {
      cwd: workspaceRoot,
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({
        success: false,
        coveragePath: null,
        coverageFormat: null,
        stdout,
        stderr,
        error: `Failed to start coverage adapter "${adapter.name}": ${error.message}`
      });
    });
    child.on('close', (exitCode) => {
      const coveragePath = resolveProjectPath(workspaceRoot, loadedConfig, adapter.coveragePath);
      resolve({
        success: exitCode === 0 && fs.existsSync(coveragePath),
        coveragePath: exitCode === 0 && fs.existsSync(coveragePath) ? coveragePath : null,
        coverageFormat: adapter.coverageFormat,
        stdout,
        stderr,
        error: exitCode === 0
          ? undefined
          : `Coverage adapter "${adapter.name}" exited with code ${exitCode ?? 0} after ${Date.now() - startTime}ms.`
      });
    });
  });
}

export async function getProjectHealth(
  workspaceRoot: string,
  currentCoverage?: WorkspaceCoverage | null
): Promise<ProjectHealth> {
  const loadedConfig = loadProjectConfig(workspaceRoot);
  const framework = await resolveFramework(workspaceRoot, loadedConfig);
  const coverageLoad = currentCoverage
    ? {
        coverage: currentCoverage,
        coveragePath: null,
        error: undefined
      }
    : loadWorkspaceCoverage(workspaceRoot, loadedConfig);
  const issues: ProjectHealthIssue[] = [];
  const warnings = [...loadedConfig.warnings];
  const gitReady = await isGitRepository(workspaceRoot);

  if (!loadedConfig.path) {
    issues.push({
      code: 'missing-config',
      severity: 'warning',
      message: 'No .pre-cr.json found. Defaults will be used until the repo config is added.',
      hint: 'Add a repo-level .pre-cr.json to make VS Code and Neovim behave the same.'
    });
  }

  if (!gitReady) {
    issues.push({
      code: 'missing-git',
      severity: 'error',
      message: 'This workspace is not a git repository.',
      hint: 'Pre-CR checks compare your current changes against git history.'
    });
  }

  if (!framework.framework) {
    issues.push({
      code: 'missing-test-command',
      severity: 'error',
      message: 'No supported test command could be resolved for this workspace.',
      hint: 'Set "testCommand" in .pre-cr.json or add a supported test framework dependency.'
    });
  }

  if (!coverageLoad.coverage) {
    issues.push({
      code: 'missing-coverage',
      severity: 'warning',
      message: 'No coverage report was found at the configured coverage paths.',
      hint: 'Run Pre-CR Check once or update "coveragePaths" in .pre-cr.json.'
    });
  }

  if (coverageLoad.error) {
    warnings.push(`Failed to load coverage: ${coverageLoad.error}`);
  }

  return {
    workspaceRoot,
    configPath: loadedConfig.path,
    isLegacyConfig: loadedConfig.isLegacyConfig,
    config: loadedConfig.config,
    framework: {
      name: framework.framework?.name ?? null,
      command: framework.framework
        ? [framework.framework.command, ...framework.framework.args].join(' ')
        : null,
      source: framework.source,
      configFile: framework.detection?.configFile ?? null
    },
    coverage: {
      loaded: coverageLoad.coverage !== null,
      path: coverageLoad.coveragePath,
      format: coverageLoad.coverage?.format ?? null,
      summary: coverageLoad.coverage?.summary ?? null
    },
    issues,
    warnings,
    ready: issues.every((issue) => issue.severity !== 'error')
  };
}

export async function runWorkspacePreCrCheck(workspaceRoot: string): Promise<RunPreCrCheckResult> {
  const loadedConfig = loadProjectConfig(workspaceRoot);
  const healthBeforeRun = await getProjectHealth(workspaceRoot);
  const framework = await resolveFramework(workspaceRoot, loadedConfig);

  if (!framework.framework) {
    return {
      result: {
        health: healthBeforeRun,
        changedFiles: [],
        testRun: null,
        coverageCheck: null,
        coveragePath: null
      }
    };
  }

  const changedFiles = await collectGitChangedFiles(workspaceRoot);
  if (changedFiles.length === 0) {
    const health: ProjectHealth = {
      ...healthBeforeRun,
      issues: [
        ...healthBeforeRun.issues,
        {
          code: 'no-changes',
          severity: 'warning',
          message: 'No changed files were found for this workspace.',
          hint: 'Edit or stage changes before running the Pre-CR check.'
        }
      ]
    };

    return {
      result: {
        health,
        changedFiles,
        testRun: null,
        coverageCheck: null,
        coveragePath: null
      }
    };
  }

  const testRunResult = await runTestsWithCoverage(workspaceRoot, framework.framework, {
    timeout: 300000
  });

  const execution: PreCrCheckExecution = {
    framework: framework.framework.name,
    command: [framework.framework.command, ...framework.framework.args].join(' '),
    success: testRunResult.success,
    exitCode: testRunResult.exitCode,
    duration: testRunResult.duration,
    coveragePath: testRunResult.coveragePath,
    stdout: testRunResult.stdout,
    stderr: testRunResult.stderr,
    error: testRunResult.error
  };

  if (!testRunResult.success) {
    return {
      result: {
        health: await getProjectHealth(workspaceRoot),
        changedFiles,
        testRun: execution,
        coverageCheck: null,
        coveragePath: testRunResult.coveragePath
      }
    };
  }

  const adapterResult = loadedConfig.config.coverageAdapters.length > 0
    ? await runCoverageAdapters(workspaceRoot, loadedConfig)
    : null;
  const coveragePath = adapterResult?.coveragePath ?? testRunResult.coveragePath ?? null;

  if (!coveragePath) {
    return {
      result: {
        health: await getProjectHealth(workspaceRoot),
        changedFiles,
        testRun: {
          ...execution,
          stdout: `${execution.stdout}${adapterResult?.stdout ?? ''}`,
          stderr: `${execution.stderr}${adapterResult?.stderr ?? ''}`,
          error: adapterResult?.error ?? execution.error,
          coveragePath: null
        },
        coverageCheck: null,
        coveragePath: null
      }
    };
  }

  const coverageFormat = adapterResult?.coverageFormat
    ?? (loadedConfig.config.coverageFormat === 'auto'
      ? inferCoverageFormat(coveragePath)
      : loadedConfig.config.coverageFormat);
  const parseResult = coverageFormat === 'istanbul'
    ? parseIstanbulFile(coveragePath, workspaceRoot)
    : parseLcovFile(coveragePath, workspaceRoot);

  if (!parseResult.success || !parseResult.data) {
    return {
      result: null,
      error: parseResult.errors.map((entry) => entry.message).join(', ')
    };
  }

  const coverageCheck = checkChangesCoverage(changedFiles, parseResult.data, {
    threshold: loadedConfig.config.threshold,
    excludePatterns: loadedConfig.config.excludePatterns,
    surfaces: loadedConfig.config.surfaces
  });

  const result: PreCrCheckResult = {
    health: await getProjectHealth(workspaceRoot, parseResult.data),
    changedFiles,
    testRun: {
      ...execution,
      coveragePath,
      stdout: `${execution.stdout}${adapterResult?.stdout ?? ''}`,
      stderr: `${execution.stderr}${adapterResult?.stderr ?? ''}`
    },
    coverageCheck,
    coveragePath
  };

  return { result };
}
