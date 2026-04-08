import * as fs from 'fs';

import { parseIstanbulFile } from '../parsers/istanbul';
import { parseLcovFile } from '../parsers/lcov';
import type {
  LoadedPreCrProjectConfig,
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
  for (const relativePath of loadedConfig.config.coveragePaths) {
    const absolutePath = resolveProjectPath(workspaceRoot, loadedConfig, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const format = loadedConfig.config.coverageFormat === 'auto'
      ? inferCoverageFormat(absolutePath)
      : loadedConfig.config.coverageFormat;
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

  if (!testRunResult.success || !testRunResult.coveragePath) {
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

  const coverageFormat = loadedConfig.config.coverageFormat === 'auto'
    ? inferCoverageFormat(testRunResult.coveragePath)
    : loadedConfig.config.coverageFormat;
  const parseResult = coverageFormat === 'istanbul'
    ? parseIstanbulFile(testRunResult.coveragePath, workspaceRoot)
    : parseLcovFile(testRunResult.coveragePath, workspaceRoot);

  if (!parseResult.success || !parseResult.data) {
    return {
      result: null,
      error: parseResult.errors.map((entry) => entry.message).join(', ')
    };
  }

  const coverageCheck = checkChangesCoverage(changedFiles, parseResult.data, {
    threshold: loadedConfig.config.threshold,
    excludePatterns: loadedConfig.config.excludePatterns
  });

  const result: PreCrCheckResult = {
    health: await getProjectHealth(workspaceRoot, parseResult.data),
    changedFiles,
    testRun: execution,
    coverageCheck,
    coveragePath: testRunResult.coveragePath
  };

  return { result };
}
