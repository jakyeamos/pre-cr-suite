import * as fs from 'fs';

import { parseIstanbulFile } from '../parsers/istanbul';
import { parseLcovFile } from '../parsers/lcov';
import type {
  LoadedPreCrProjectConfig,
  PreCrCoverageAdapterConfig,
  PreCrCheckExecution,
  PreCrCheckResult,
  PreCrQualityAdapterConfig,
  PreCrQualityAdapterResult,
  ProjectHealth,
  ProjectHealthIssue,
  RunPreCrCheckResult
} from '../protocol';
import type { WorkspaceCoverage } from '../types';
import { checkChangesCoverage } from '../runner/coverageChecker';
import { resolveWorkspacePath, validateCoverageFile } from '../validation';
import {
  detectTestFramework,
  getCustomTestCommand,
  runTestsWithCoverage,
  type FrameworkDetectionResult,
  type TestFramework
} from '../runner/testRunner';
import { runProcess } from '../runner/processRunner';
import { collectGitChangedFiles, isGitRepository } from './git';
import { inferCoverageFormat, loadProjectConfig } from './config';
import { parseCommandString, resolveWorkspaceCommand } from './command';

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
    const pathResult = resolveWorkspacePath(workspaceRoot, source.relativePath, {
      access: 'read',
      allowMissing: true,
      allowAbsolute: true
    });
    if (!pathResult.valid) {
      return {
        coverage: null,
        coveragePath: null,
        error: `Invalid configured coverage path "${source.relativePath}": ${pathResult.error}`
      };
    }

    const absolutePath = pathResult.resolvedPath;
    if (!pathResult.realPath) {
      continue;
    }

    const validation = validateCoverageFile(source.relativePath, workspaceRoot);
    if (!validation.valid) {
      return {
        coverage: null,
        coveragePath: absolutePath,
        error: validation.error
      };
    }

    const parsePath = pathResult.realPath;

    const format = source.format === 'auto'
      ? inferCoverageFormat(parsePath)
      : source.format;
    const result = format === 'istanbul'
      ? parseIstanbulFile(parsePath, workspaceRoot)
      : parseLcovFile(parsePath, workspaceRoot);

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

interface QualityAdapterRunContext {
  workspaceRoot: string;
  changedFiles: string[];
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

function getInvalidConfiguredPath(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig
): string | null {
  const configuredPaths = [
    ...loadedConfig.config.coveragePaths,
    ...loadedConfig.config.coverageAdapters.map((adapter) => adapter.coveragePath)
  ];

  for (const configuredPath of configuredPaths) {
    const result = resolveWorkspacePath(workspaceRoot, configuredPath, {
      access: 'write',
      allowAbsolute: true
    });
    if (!result.valid) {
      return `Invalid configured coverage path "${configuredPath}": ${result.error}`;
    }
  }

  return null;
}

async function runQualityAdapters(
  workspaceRoot: string,
  adapters: PreCrQualityAdapterConfig[],
  changedFiles: string[]
): Promise<PreCrQualityAdapterResult[]> {
  const results: PreCrQualityAdapterResult[] = [];
  for (const adapter of adapters) {
    results.push(await runQualityAdapter(adapter, { workspaceRoot, changedFiles }));
  }
  return results;
}

async function runQualityAdapter(
  adapter: PreCrQualityAdapterConfig,
  context: QualityAdapterRunContext
): Promise<PreCrQualityAdapterResult> {
  const commandLine = adapter.command.replace(/\{changedFiles\}/g, context.changedFiles.join(','));
  const parsedTemplate = parseCommandString(adapter.command);
  if (!parsedTemplate) {
    return {
      name: adapter.name,
      command: adapter.command,
      required: adapter.required,
      success: false,
      skipped: false,
      exitCode: null,
      duration: 0,
      stdout: '',
      stderr: '',
      error: `Invalid quality adapter command for "${adapter.name}".`
    };
  }

  const changedFilesArg = context.changedFiles.join(',');
  const parsed = {
    command: parsedTemplate.command.replace(/\{changedFiles\}/g, changedFilesArg),
    args: parsedTemplate.args.map((arg) => arg.replace(/\{changedFiles\}/g, changedFilesArg))
  };
  const resolved = resolveWorkspaceCommand(context.workspaceRoot, parsed);
  const result = await runProcess({
    command: resolved.command,
    args: resolved.args,
    cwd: context.workspaceRoot,
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  const skipped = !adapter.required && result.exitCode === null;

  return {
    name: adapter.name,
    command: commandLine,
    required: adapter.required,
    success: result.success || skipped,
    skipped,
    exitCode: result.exitCode,
    duration: result.durationMs,
    stdout: formatProcessOutput(result.stdout),
    stderr: formatProcessOutput(result.stderr),
    error: result.success || skipped
      ? undefined
      : `Quality adapter "${adapter.name}" failed: ${result.error ?? 'unknown error'}`
  };
}

async function runCoverageAdapter(
  workspaceRoot: string,
  loadedConfig: LoadedPreCrProjectConfig,
  adapter: PreCrCoverageAdapterConfig
): Promise<CoverageAdapterResult> {
  const outputPath = resolveWorkspacePath(workspaceRoot, adapter.coveragePath, {
    access: 'write',
    allowAbsolute: true
  });
  if (!outputPath.valid) {
    return {
      success: false,
      coveragePath: null,
      coverageFormat: null,
      stdout: '',
      stderr: '',
      error: `Invalid coverage output path for "${adapter.name}": ${outputPath.error}`
    };
  }

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

  const resolved = resolveWorkspaceCommand(workspaceRoot, parsed);
  const result = await runProcess({
    command: resolved.command,
    args: resolved.args,
    cwd: workspaceRoot,
    env: { ...process.env, FORCE_COLOR: '0' }
  });
  const producedCoverage = resolveWorkspacePath(workspaceRoot, adapter.coveragePath, {
    access: 'read',
    allowAbsolute: true
  });
  const coveragePath = producedCoverage.valid ? producedCoverage.resolvedPath : null;
  const coverageExists = coveragePath !== null && fs.existsSync(coveragePath);

  return {
    success: result.success && coverageExists,
    coveragePath: result.success && coverageExists ? coveragePath : null,
    coverageFormat: adapter.coverageFormat,
    stdout: formatProcessOutput(result.stdout),
    stderr: formatProcessOutput(result.stderr),
    error: result.success
      ? coverageExists
        ? undefined
        : `Coverage adapter "${adapter.name}" produced an invalid coverage path: ${producedCoverage.valid ? 'not found' : producedCoverage.error}`
      : `Coverage adapter "${adapter.name}" failed: ${result.error ?? 'unknown error'}`
  };
}

function formatProcessOutput(output: { text: string; truncated: boolean; omittedBytes: number }): string {
  return output.truncated
    ? `${output.text}\n[Pre-CR truncated ${output.omittedBytes} bytes of command output.]\n`
    : output.text;
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
  const invalidConfigPath = getInvalidConfiguredPath(workspaceRoot, loadedConfig);

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

  if (invalidConfigPath) {
    issues.push({
      code: 'invalid-config',
      severity: 'error',
      message: invalidConfigPath,
      hint: 'Coverage paths must be workspace-relative and cannot resolve through an external symlink.'
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

export interface RunWorkspacePreCrCheckOptions {
  changeScope?: 'worktree' | 'staged';
  allowConfigExecution?: boolean;
}

export async function runWorkspacePreCrCheck(
  workspaceRoot: string,
  options: RunWorkspacePreCrCheckOptions = {}
): Promise<RunPreCrCheckResult> {
  const loadedConfig = loadProjectConfig(workspaceRoot);
  const healthBeforeRun = await getProjectHealth(workspaceRoot);

  if (options.allowConfigExecution !== true) {
    return {
      result: {
        health: {
          ...healthBeforeRun,
          issues: [
            ...healthBeforeRun.issues,
            {
              code: 'untrusted-workspace',
              severity: 'error',
              message: 'Pre-CR will not execute repository-configured commands in an untrusted workspace.',
              hint: 'Trust this workspace before running Pre-CR Check.'
            }
          ],
          ready: false
        },
        changedFiles: [],
        testRun: null,
        coverageCheck: null,
        qualityAdapters: [],
        qualityAdaptersPassed: true,
        coveragePath: null
      }
    };
  }

  const invalidConfigPath = getInvalidConfiguredPath(workspaceRoot, loadedConfig);
  if (invalidConfigPath) {
    return {
      result: {
        health: {
          ...healthBeforeRun,
          ready: false
        },
        changedFiles: [],
        testRun: null,
        coverageCheck: null,
        qualityAdapters: [],
        qualityAdaptersPassed: true,
        coveragePath: null
      }
    };
  }

  const framework = await resolveFramework(workspaceRoot, loadedConfig);

  if (!framework.framework) {
    return {
      result: {
        health: healthBeforeRun,
        changedFiles: [],
        testRun: null,
        coverageCheck: null,
        qualityAdapters: [],
        qualityAdaptersPassed: true,
        coveragePath: null
      }
    };
  }

  let changedFiles;
  try {
    changedFiles = await collectGitChangedFiles(workspaceRoot, {
      scope: options.changeScope ?? 'worktree'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: null,
      error: `Unable to collect changed files: ${message}`
    };
  }
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
        qualityAdapters: [],
        qualityAdaptersPassed: true,
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
        qualityAdapters: [],
        qualityAdaptersPassed: true,
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
        qualityAdapters: [],
        qualityAdaptersPassed: true,
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
    surfaces: loadedConfig.config.surfaces,
    workspaceRoot
  });
  const qualityAdapters = await runQualityAdapters(
    workspaceRoot,
    loadedConfig.config.qualityAdapters,
    changedFiles.map((file) => file.path)
  );
  const qualityAdaptersPassed = qualityAdapters.every((adapter) => adapter.success);

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
    qualityAdapters,
    qualityAdaptersPassed,
    coveragePath
  };

  return { result };
}
