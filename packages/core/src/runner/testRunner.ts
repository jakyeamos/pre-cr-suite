/**
 * Test Runner Module
 * 
 * Automatically detects test frameworks, runs tests with coverage,
 * and returns parsed coverage data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { loadProjectConfig, inferCoverageFormat } from '../beta/config';
import { parseCommandString } from '../beta/command';

export interface TestFramework {
  name: string;
  command: string;
  args: string[];
  coverageOutputPath: string;
  coverageFormat: 'lcov' | 'istanbul';
}

export interface TestExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  coveragePath: string | null;
  duration: number;
  error?: string;
}

export interface FrameworkDetectionResult {
  framework: TestFramework | null;
  detected: string | null;
  configFile: string | null;
  error?: string;
}

/**
 * Known test framework configurations
 */
const FRAMEWORKS: Record<string, Omit<TestFramework, 'name'>> = {
  // JavaScript/TypeScript
  jest: {
    command: 'npx',
    args: ['jest', '--coverage', '--collectCoverageFrom=src/**/*.{js,jsx,ts,tsx}', '--coverageReporters=lcov', '--coverageReporters=text'],
    coverageOutputPath: 'coverage/lcov.info',
    coverageFormat: 'lcov'
  },
  vitest: {
    command: 'npx',
    args: ['vitest', 'run', '--coverage', '--coverage.all', '--coverage.include=src/**/*.{js,jsx,ts,tsx}', '--coverage.include=packages/**/src/**/*.{js,jsx,ts,tsx}', '--coverage.reporter=lcov', '--coverage.reporter=text'],
    coverageOutputPath: 'coverage/lcov.info',
    coverageFormat: 'lcov'
  },
  mocha: {
    command: 'npx',
    args: ['nyc', '--all', '--include=src/**/*.js', '--reporter=lcov', '--reporter=text', 'mocha'],
    coverageOutputPath: 'coverage/lcov.info',
    coverageFormat: 'lcov'
  },
  // Python
  pytest: {
    command: 'pytest',
    args: ['--cov=.', '--cov-report=lcov', '--cov-report=term'],
    coverageOutputPath: 'coverage.lcov',
    coverageFormat: 'lcov'
  },
  // Go
  go: {
    command: 'go',
    args: ['test', '-coverprofile=coverage.out', '-covermode=atomic', './...'],
    coverageOutputPath: 'coverage.out',
    coverageFormat: 'lcov' // We'll convert go format
  },
  // Rust
  cargo: {
    command: 'cargo',
    args: ['tarpaulin', '--out', 'Lcov'],
    coverageOutputPath: 'lcov.info',
    coverageFormat: 'lcov'
  }
};

/**
 * Detect the test framework used in a project
 */
export async function detectTestFramework(workspaceRoot: string): Promise<FrameworkDetectionResult> {
  // Check package.json for JS/TS projects
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Check for test frameworks in order of preference
      if (allDeps['vitest']) {
        return {
          framework: { name: 'vitest', ...FRAMEWORKS.vitest },
          detected: 'vitest',
          configFile: packageJsonPath
        };
      }
      if (allDeps['jest']) {
        return {
          framework: { name: 'jest', ...FRAMEWORKS.jest },
          detected: 'jest',
          configFile: packageJsonPath
        };
      }
      if (allDeps['mocha']) {
        return {
          framework: { name: 'mocha', ...FRAMEWORKS.mocha },
          detected: 'mocha',
          configFile: packageJsonPath
        };
      }

      // Check scripts for test command hints
      const testScript = packageJson.scripts?.test || '';
      if (testScript.includes('vitest')) {
        return {
          framework: { name: 'vitest', ...FRAMEWORKS.vitest },
          detected: 'vitest (from scripts)',
          configFile: packageJsonPath
        };
      }
      if (testScript.includes('jest')) {
        return {
          framework: { name: 'jest', ...FRAMEWORKS.jest },
          detected: 'jest (from scripts)',
          configFile: packageJsonPath
        };
      }
      if (testScript.includes('mocha')) {
        return {
          framework: { name: 'mocha', ...FRAMEWORKS.mocha },
          detected: 'mocha (from scripts)',
          configFile: packageJsonPath
        };
      }
    } catch (e) {
      // Continue checking other config files
    }
  }

  // Check for Python projects
  const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
  const setupPyPath = path.join(workspaceRoot, 'setup.py');
  const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
  
  if (fs.existsSync(pyprojectPath) || fs.existsSync(setupPyPath) || fs.existsSync(requirementsPath)) {
    // Check if pytest is available
    const configFile = fs.existsSync(pyprojectPath) ? pyprojectPath : 
                       fs.existsSync(setupPyPath) ? setupPyPath : requirementsPath;
    return {
      framework: { name: 'pytest', ...FRAMEWORKS.pytest },
      detected: 'pytest',
      configFile
    };
  }

  // Check for Go projects
  const goModPath = path.join(workspaceRoot, 'go.mod');
  if (fs.existsSync(goModPath)) {
    return {
      framework: { name: 'go', ...FRAMEWORKS.go },
      detected: 'go test',
      configFile: goModPath
    };
  }

  // Check for Rust projects
  const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    return {
      framework: { name: 'cargo', ...FRAMEWORKS.cargo },
      detected: 'cargo tarpaulin',
      configFile: cargoPath
    };
  }

  return {
    framework: null,
    detected: null,
    configFile: null,
    error: 'No supported test framework detected'
  };
}

/**
 * Run tests with coverage
 */
export async function runTestsWithCoverage(
  workspaceRoot: string,
  framework: TestFramework,
  options?: {
    timeout?: number;
    testFilePattern?: string;
    onOutput?: (data: string, isError: boolean) => void;
  }
): Promise<TestExecutionResult> {
  const startTime = Date.now();
  const timeout = options?.timeout ?? 300000; // 5 min default

  return new Promise((resolve) => {
    const args = [...framework.args];
    
    // Add test file pattern if specified
    if (options?.testFilePattern) {
      if (framework.name === 'jest' || framework.name === 'vitest') {
        args.push(options.testFilePattern);
      }
    }

    const proc = spawn(framework.command, args, {
      cwd: workspaceRoot,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      options?.onOutput?.(text, false);
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      options?.onOutput?.(text, true);
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        coveragePath: null,
        duration: Date.now() - startTime,
        error: `Test run timed out after ${timeout / 1000}s`
      });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const exitCode = code ?? 0;
      
      // Check if coverage file was generated
      const coveragePath = path.join(workspaceRoot, framework.coverageOutputPath);
      const coverageExists = fs.existsSync(coveragePath);

      resolve({
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        coveragePath: coverageExists ? coveragePath : null,
        duration
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        coveragePath: null,
        duration: Date.now() - startTime,
        error: `Failed to start test process: ${err.message}`
      });
    });
  });
}

/**
 * Get custom test command from configuration or environment
 */
export function getCustomTestCommand(workspaceRoot: string): TestFramework | null {
  const loadedConfig = loadProjectConfig(workspaceRoot);
  const commandLine = loadedConfig.config.testCommand;
  if (!commandLine) {
    return null;
  }

  const parsed = parseCommandString(commandLine);
  if (!parsed) {
    return null;
  }

  const firstCoveragePath = loadedConfig.config.coveragePaths[0] ?? 'coverage/lcov.info';
  const coverageFormat = loadedConfig.config.coverageFormat === 'auto'
    ? inferCoverageFormat(firstCoveragePath)
    : loadedConfig.config.coverageFormat;

  return {
    name: 'custom',
    command: parsed.command,
    args: parsed.args,
    coverageOutputPath: firstCoveragePath,
    coverageFormat
  };
}

/**
 * Convert Go coverage format to lcov
 */
export function convertGoCoverageToLcov(goCoveragePath: string): string {
  const content = fs.readFileSync(goCoveragePath, 'utf-8');
  const lines = content.split('\n');
  
  let lcov = '';
  let currentFile = '';
  
  for (const line of lines) {
    if (line.startsWith('mode:')) continue;
    if (!line.trim()) continue;
    
    // Format: file:startLine.startCol,endLine.endCol statements count
    const match = line.match(/^(.+):(\d+)\.\d+,(\d+)\.\d+\s+(\d+)\s+(\d+)$/);
    if (match) {
      const [, file, startLine, endLine, , count] = match;
      
      if (file !== currentFile) {
        if (currentFile) {
          lcov += 'end_of_record\n';
        }
        currentFile = file;
        lcov += `SF:${file}\n`;
      }
      
      // Add line data for each line in range
      const start = parseInt(startLine, 10);
      const end = parseInt(endLine, 10);
      const hits = parseInt(count, 10);
      
      for (let i = start; i <= end; i++) {
        lcov += `DA:${i},${hits}\n`;
      }
    }
  }
  
  if (currentFile) {
    lcov += 'end_of_record\n';
  }
  
  return lcov;
}
