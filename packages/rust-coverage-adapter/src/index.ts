import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface RustCoverageCliOptions {
  outputPath: string;
  toolchain: string;
  targetDir?: string;
  profileDir?: string;
  objectPaths: string[];
  ignoreFilenameRegex?: string;
  keepProfiles: boolean;
  command: string;
  commandArgs: string[];
}

export interface RustCoverageRunOptions {
  workspaceRoot: string;
  outputPath: string;
  toolchain: string;
  targetDir?: string;
  profileDir?: string;
  objectPaths?: string[];
  ignoreFilenameRegex?: string;
  keepProfiles?: boolean;
  command: string;
  commandArgs: string[];
  environment?: NodeJS.ProcessEnv;
}

export interface RustCoverageRunResult {
  outputPath: string;
  objectPaths: string[];
  rawProfileCount: number;
  profileDirectory: string | null;
}

export interface RustToolchainPaths {
  llvmCov: string;
  llvmProfdata: string;
  host: string;
  sysroot: string;
}

export class RustCoverageError extends Error {
  readonly exitCode: number;
  readonly profileDirectory: string | null;

  constructor(message: string, exitCode = 1, profileDirectory: string | null = null) {
    super(message);
    this.name = 'RustCoverageError';
    this.exitCode = exitCode;
    this.profileDirectory = profileDirectory;
  }
}

const INSTRUMENT_COVERAGE_FLAG = '-Cinstrument-coverage';

export function parseCliArgs(argv: string[]): RustCoverageCliOptions | null {
  const options: Omit<RustCoverageCliOptions, 'command' | 'commandArgs'> = {
    outputPath: 'coverage/lcov.info',
    toolchain: 'stable',
    objectPaths: [],
    keepProfiles: false
  };
  let commandSeparator = -1;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') {
      commandSeparator = index;
      break;
    }

    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      return null;
    }

    if (argument === '--keep-profiles') {
      options.keepProfiles = true;
      continue;
    }

    const [name, inlineValue] = argument.split('=', 2);
    if (
      name !== '--output' &&
      name !== '--toolchain' &&
      name !== '--target-dir' &&
      name !== '--profile-dir' &&
      name !== '--object' &&
      name !== '--ignore-filename-regex'
    ) {
      throw new RustCoverageError(`Unknown option "${argument}". Use --help for usage.`);
    }

    const value = inlineValue ?? argv[++index];
    if (!value || value === '--') {
      throw new RustCoverageError(`Option "${name}" requires a value.`);
    }

    switch (name) {
      case '--output':
        options.outputPath = value;
        break;
      case '--toolchain':
        options.toolchain = value;
        break;
      case '--target-dir':
        options.targetDir = value;
        break;
      case '--profile-dir':
        options.profileDir = value;
        break;
      case '--object':
        options.objectPaths.push(value);
        break;
      case '--ignore-filename-regex':
        options.ignoreFilenameRegex = value;
        break;
      default:
        throw new RustCoverageError(`Unknown option "${name}". Use --help for usage.`);
    }
  }

  if (commandSeparator < 0 || !argv[commandSeparator + 1]) {
    throw new RustCoverageError('A command is required after "--". Use --help for usage.');
  }

  return {
    ...options,
    command: argv[commandSeparator + 1],
    commandArgs: argv.slice(commandSeparator + 2)
  };
}

export function formatHelp(): string {
  return [
    'Usage: pre-cr-rust-coverage [options] -- COMMAND [ARGS...]',
    '',
    'Runs COMMAND with Rust LLVM instrumentation and writes an LCOV report.',
    '',
    'Options:',
    '  --output PATH                 LCOV output path (default: coverage/lcov.info)',
    '  --toolchain NAME              rustup toolchain (default: stable)',
    '  --target-dir PATH             Cargo target directory when it is non-standard',
    '  --profile-dir PATH            Base directory for raw LLVM profiles',
    '  --object PATH                 Instrumented object to pass to llvm-cov (repeatable)',
    '  --ignore-filename-regex REGEX Files to omit from the LCOV report',
    '  --keep-profiles               Preserve raw profiles for diagnosis',
    '  -h, --help                    Show this help'
  ].join('\n');
}

export function appendInstrumentCoverageFlag(existingFlags: string | undefined): string {
  const flags = existingFlags?.trim() ?? '';
  if (/(?:^|\s)-C(?:\s+|=)?instrument-coverage(?:\s|$)/.test(flags)) {
    return flags;
  }
  return `${flags} ${INSTRUMENT_COVERAGE_FLAG}`.trim();
}

export function buildProfilePattern(profileDirectory: string): string {
  return join(profileDirectory, '%p-%m.profraw');
}

export function mergeLcovReports(reports: string[]): string {
  const files = new Map<string, Map<number, number>>();

  for (const report of reports) {
    let sourceFile: string | null = null;
    for (const line of report.split(/\r?\n/)) {
      if (line.startsWith('SF:')) {
        sourceFile = line.slice(3);
        if (!files.has(sourceFile)) {
          files.set(sourceFile, new Map<number, number>());
        }
        continue;
      }

      if (!sourceFile || !line.startsWith('DA:')) {
        continue;
      }

      const [lineNumberText, hitCountText] = line.slice(3).split(',', 3);
      const lineNumber = Number.parseInt(lineNumberText, 10);
      const hitCount = Number.parseInt(hitCountText, 10);
      if (!Number.isInteger(lineNumber) || !Number.isFinite(hitCount)) {
        continue;
      }

      const lineCoverage = files.get(sourceFile);
      const previousHits = lineCoverage?.get(lineNumber) ?? 0;
      lineCoverage?.set(lineNumber, Math.max(previousHits, hitCount));
    }
  }

  const output: string[] = ['TN:'];
  for (const [sourceFile, lineCoverage] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    output.push(`SF:${sourceFile}`);
    const sortedLines = [...lineCoverage.entries()].sort(([left], [right]) => left - right);
    for (const [lineNumber, hitCount] of sortedLines) {
      output.push(`DA:${lineNumber},${hitCount}`);
    }
    output.push(`LF:${sortedLines.length}`);
    output.push(`LH:${sortedLines.filter(([, hitCount]) => hitCount > 0).length}`);
    output.push('end_of_record');
  }

  return `${output.join('\n')}\n`;
}

export function resolveToolchainPaths(toolchain: string): RustToolchainPaths {
  const sysroot = runRustup(toolchain, ['rustc', '--print', 'sysroot']).trim();
  const version = runRustup(toolchain, ['rustc', '-vV']);
  const host = version.match(/^host:\s*(\S+)$/m)?.[1];
  if (!host) {
    throw new RustCoverageError(`Could not determine the host target for rustup toolchain "${toolchain}".`);
  }

  const binDirectory = join(sysroot, 'lib', 'rustlib', host, 'bin');
  const llvmCov = join(binDirectory, executableName('llvm-cov'));
  const llvmProfdata = join(binDirectory, executableName('llvm-profdata'));
  if (!existsSync(llvmCov) || !existsSync(llvmProfdata)) {
    throw new RustCoverageError(
      `Rust LLVM tools are missing for "${toolchain}". Install the matching component with ` +
      `rustup component add llvm-tools-preview --toolchain ${toolchain}.`
    );
  }

  return { llvmCov, llvmProfdata, host, sysroot };
}

export function resolveTargetDirectory(
  workspaceRoot: string,
  toolchain: string,
  explicitTargetDirectory?: string,
  environment: NodeJS.ProcessEnv = process.env
): string {
  if (explicitTargetDirectory) {
    return resolve(workspaceRoot, explicitTargetDirectory);
  }

  if (environment.CARGO_TARGET_DIR) {
    return resolve(workspaceRoot, environment.CARGO_TARGET_DIR);
  }

  const manifestPath = join(workspaceRoot, 'Cargo.toml');
  if (existsSync(manifestPath)) {
    try {
      const metadataOutput = execFileSync(
        'cargo',
        ['metadata', '--no-deps', '--format-version', '1', '--manifest-path', manifestPath],
        {
          cwd: workspaceRoot,
          env: { ...environment, RUSTUP_TOOLCHAIN: toolchain },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        }
      );
      const metadata = JSON.parse(metadataOutput) as { target_directory?: unknown };
      if (typeof metadata.target_directory === 'string' && metadata.target_directory.length > 0) {
        return resolve(metadata.target_directory);
      }
    } catch {
      // Fall back to Cargo's default target directory when metadata is unavailable.
    }
  }

  return resolve(workspaceRoot, 'target');
}

export function discoverCoverageObjects(targetDirectory: string): string[] {
  const objects: string[] = [];
  const visit = (directory: string): void => {
    if (!existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'deps') {
          for (const dependencyEntry of readdirSync(entryPath, { withFileTypes: true })) {
            if (!dependencyEntry.isFile()) {
              continue;
            }
            const dependencyPath = join(entryPath, dependencyEntry.name);
            if (isExecutableFile(dependencyPath)) {
              objects.push(dependencyPath);
            }
          }
        } else if (!['.fingerprint', 'build', 'incremental'].includes(entry.name)) {
          visit(entryPath);
        }
      }
    }
  };

  visit(targetDirectory);
  return objects.sort();
}

export function extractCoverageObjects(commandOutput: string): string[] {
  const objects = new Set<string>();
  const objectPattern = /\(([^()\r\n]*[\\/]debug[\\/]deps[\\/][^()\r\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = objectPattern.exec(commandOutput)) !== null) {
    objects.add(match[1]);
  }
  return [...objects];
}

export async function runRustCoverage(options: RustCoverageRunOptions): Promise<RustCoverageRunResult> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const outputPath = resolve(workspaceRoot, options.outputPath);
  const profileBaseDirectory = resolve(workspaceRoot, options.profileDir ?? '.pre-cr/rust-coverage');
  mkdirSync(profileBaseDirectory, { recursive: true });
  const profileDirectory = mkdtempSync(join(profileBaseDirectory, 'run-'));
  const keepProfiles = options.keepProfiles ?? false;
  let completed = false;

  try {
    const tools = resolveToolchainPaths(options.toolchain);
    const targetDirectory = resolveTargetDirectory(
      workspaceRoot,
      options.toolchain,
      options.targetDir,
      options.environment
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.environment,
      RUSTFLAGS: appendInstrumentCoverageFlag(options.environment?.RUSTFLAGS ?? process.env.RUSTFLAGS),
      LLVM_PROFILE_FILE: buildProfilePattern(profileDirectory),
      CARGO_INCREMENTAL: '0',
      RUSTUP_TOOLCHAIN: options.toolchain
    };
    if (options.targetDir) {
      environment.CARGO_TARGET_DIR = targetDirectory;
    }

    const testResult = await runInherited(options.command, options.commandArgs, workspaceRoot, environment);
    if (testResult.exitCode !== 0) {
      throw new RustCoverageError(`Instrumented Rust command exited with code ${testResult.exitCode}.`, testResult.exitCode, profileDirectory);
    }

    const rawProfiles = findFiles(profileDirectory, '.profraw');
    if (rawProfiles.length === 0) {
      throw new RustCoverageError(
        `No LLVM raw profiles were produced in ${profileDirectory}. Confirm the command runs instrumented Rust binaries.`,
        1,
        profileDirectory
      );
    }

    const profileDataPath = join(profileDirectory, 'merged.profdata');
    const mergeResult = await runCaptured(
      tools.llvmProfdata,
      ['merge', '-sparse', ...rawProfiles, '-o', profileDataPath],
      workspaceRoot,
      environment
    );
    if (mergeResult.exitCode !== 0) {
      throw new RustCoverageError(
        `llvm-profdata merge failed: ${mergeResult.stderr.trim() || mergeResult.stdout.trim()}`,
        mergeResult.exitCode,
        profileDirectory
      );
    }

    const explicitObjects = options.objectPaths?.length
      ? options.objectPaths.map((objectPath) => resolve(workspaceRoot, objectPath))
      : [];
    const outputObjects = extractCoverageObjects(`${testResult.stdout}\n${testResult.stderr}`);
    const objectPaths = explicitObjects.length > 0
      ? explicitObjects
      : [...new Set([
          ...outputObjects,
          ...discoverCoverageObjects(targetDirectory)
        ])].filter((objectPath) => existsSync(objectPath));
    const missingObject = explicitObjects.find((objectPath) => !existsSync(objectPath));
    if (missingObject) {
      throw new RustCoverageError(`Coverage object does not exist: ${missingObject}`, 1, profileDirectory);
    }
    if (objectPaths.length === 0) {
      throw new RustCoverageError(
        `No instrumented Rust objects were found under ${targetDirectory}. Pass one or more --object paths.`,
        1,
        profileDirectory
      );
    }

    const lcov = await exportLcov(
      tools.llvmCov,
      profileDataPath,
      objectPaths,
      workspaceRoot,
      environment,
      options.ignoreFilenameRegex
    );
    if (!lcov.includes('SF:') || !lcov.includes('DA:')) {
      throw new RustCoverageError('llvm-cov produced no source line coverage records.', 1, profileDirectory);
    }

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, lcov, 'utf8');
    completed = true;
    return {
      outputPath,
      objectPaths,
      rawProfileCount: rawProfiles.length,
      profileDirectory: keepProfiles ? profileDirectory : null
    };
  } catch (error) {
    if (error instanceof RustCoverageError) {
      throw error.profileDirectory ? error : new RustCoverageError(error.message, error.exitCode, profileDirectory);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new RustCoverageError(message, 1, profileDirectory);
  } finally {
    if (completed && !keepProfiles && existsSync(profileDirectory)) {
      rmSync(profileDirectory, { recursive: true, force: true });
    }
  }
}

async function exportLcov(
  llvmCov: string,
  profileDataPath: string,
  objectPaths: string[],
  workspaceRoot: string,
  environment: NodeJS.ProcessEnv,
  ignoreFilenameRegex?: string
): Promise<string> {
  const commonArgs = [
    'export',
    '-format=lcov',
    `-instr-profile=${profileDataPath}`,
    ...(ignoreFilenameRegex ? [`-ignore-filename-regex=${ignoreFilenameRegex}`] : [])
  ];
  const allObjectsResult = await runCaptured(
    llvmCov,
    [...commonArgs, objectPaths[0], ...objectPaths.slice(1).flatMap((objectPath) => ['-object', objectPath])],
    workspaceRoot,
    environment
  );
  if (allObjectsResult.exitCode === 0 && allObjectsResult.stdout.includes('SF:')) {
    return allObjectsResult.stdout;
  }

  const individualReports: string[] = [];
  for (const objectPath of objectPaths) {
    const result = await runCaptured(llvmCov, [...commonArgs, objectPath], workspaceRoot, environment);
    if (result.exitCode === 0 && result.stdout.includes('SF:')) {
      individualReports.push(result.stdout);
    }
  }

  if (individualReports.length === 0) {
    throw new RustCoverageError(
      `llvm-cov export failed: ${allObjectsResult.stderr.trim() || allObjectsResult.stdout.trim()}`
    );
  }
  return mergeLcovReports(individualReports);
}

function runRustup(toolchain: string, args: string[]): string {
  try {
    return execFileSync('rustup', ['run', toolchain, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RustCoverageError(
      `Could not resolve rustup toolchain "${toolchain}". ${detail}`
    );
  }
}

function executableName(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function isExecutableFile(filePath: string): boolean {
  if (process.platform === 'win32') {
    return filePath.endsWith('.exe');
  }
  try {
    const fileStats = statSync(filePath);
    return fileStats.isFile() && (fileStats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function findFiles(directory: string, suffix: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(entryPath, suffix));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function runInherited(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv
): Promise<CapturedCommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr }));
  });
}

interface CapturedCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCaptured(
  command: string,
  args: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv
): Promise<CapturedCommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr }));
  });
}
