import { spawn, type ChildProcess } from 'child_process';

export const DEFAULT_PROCESS_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;
const TERMINATION_GRACE_MS = 1_000;

export interface RunProcessOptions {
  command: string;
  args?: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  signal?: AbortSignal;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
}

export interface ProcessOutput {
  text: string;
  totalBytes: number;
  capturedBytes: number;
  omittedBytes: number;
  truncated: boolean;
}

export interface ProcessRunResult {
  success: boolean;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  stdout: ProcessOutput;
  stderr: ProcessOutput;
  error?: string;
}

interface OutputAccumulator {
  chunks: Buffer[];
  totalBytes: number;
  capturedBytes: number;
  limit: number;
  truncated: boolean;
}

/**
 * Run a command without a shell while bounding execution time and captured output.
 */
export async function runProcess(options: RunProcessOptions): Promise<ProcessRunResult> {
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const maxStdoutBytes = normalizeOutputLimit(options.maxStdoutBytes, 'maxStdoutBytes');
  const maxStderrBytes = normalizeOutputLimit(options.maxStderrBytes, 'maxStderrBytes');
  const startedAt = Date.now();
  const stdout = createAccumulator(maxStdoutBytes);
  const stderr = createAccumulator(maxStderrBytes);

  if (options.signal?.aborted) {
    return createResult({
      startedAt,
      stdout,
      stderr,
      aborted: true,
      error: 'Process run was aborted before it started.'
    });
  }

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(options.command, [...(options.args ?? [])], {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true
      });
    } catch (error) {
      resolve(createResult({
        startedAt,
        stdout,
        stderr,
        error: `Failed to start process: ${messageFor(error)}`
      }));
      return;
    }

    let settled = false;
    let timedOut = false;
    let aborted = false;
    let terminationRequested = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let forceKillId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (forceKillId && !terminationRequested) {
        clearTimeout(forceKillId);
      }
      options.signal?.removeEventListener('abort', onAbort);
    };

    const finish = (exitCode: number | null, exitSignal: NodeJS.Signals | null, startupError?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      const error = startupError
        ? `Failed to start process: ${messageFor(startupError)}`
        : timedOut
          ? `Process timed out after ${timeoutMs}ms.`
          : aborted
            ? 'Process run was aborted.'
            : exitCode === 0
              ? undefined
              : exitSignal
                ? `Process terminated by signal ${exitSignal}.`
                : `Process exited with code ${exitCode ?? 'unknown'}.`;

      resolve(createResult({
        startedAt,
        stdout,
        stderr,
        exitCode,
        exitSignal,
        timedOut,
        aborted,
        error
      }));
    };

    const terminate = (): boolean => {
      if (settled || child.exitCode !== null || child.signalCode !== null) {
        return false;
      }

      if (!signalProcessTree(child, 'SIGTERM')) {
        return false;
      }
      terminationRequested = true;
      forceKillId = setTimeout(() => {
        forceKillId = undefined;
        signalProcessTree(child, 'SIGKILL');
      }, TERMINATION_GRACE_MS);
      return true;
    };

    const onAbort = (): void => {
      if (terminate()) {
        aborted = true;
      }
    };

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      appendOutput(stdout, chunk);
      options.onStdout?.(text);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      appendOutput(stderr, chunk);
      options.onStderr?.(text);
    });
    child.once('error', (error) => finish(null, null, error));
    child.once('close', (exitCode, exitSignal) => finish(exitCode, exitSignal));

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (terminate()) {
          timedOut = true;
        }
      }, timeoutMs);
    }

    options.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): boolean {
  if (!child.pid) {
    return false;
  }

  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch {
      // The process may have exited between the liveness check and the group
      // signal. Fall back to the direct child handle in that case.
    }
  }

  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PROCESS_TIMEOUT_MS;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('timeoutMs must be a non-negative safe integer.');
  }
  return value;
}

function normalizeOutputLimit(value: number | undefined, name: string): number {
  if (value === undefined) {
    return DEFAULT_MAX_PROCESS_OUTPUT_BYTES;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function createAccumulator(limit: number): OutputAccumulator {
  return {
    chunks: [],
    totalBytes: 0,
    capturedBytes: 0,
    limit,
    truncated: false
  };
}

function appendOutput(accumulator: OutputAccumulator, chunk: Buffer | string): void {
  const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  accumulator.totalBytes += data.length;

  const remaining = accumulator.limit - accumulator.capturedBytes;
  if (remaining <= 0) {
    accumulator.truncated = accumulator.truncated || data.length > 0;
    return;
  }

  const captured = data.subarray(0, remaining);
  if (captured.length > 0) {
    accumulator.chunks.push(captured);
    accumulator.capturedBytes += captured.length;
  }
  if (captured.length < data.length) {
    accumulator.truncated = true;
  }
}

function createResult(input: {
  startedAt: number;
  stdout: OutputAccumulator;
  stderr: OutputAccumulator;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  timedOut?: boolean;
  aborted?: boolean;
  error?: string;
}): ProcessRunResult {
  const timedOut = input.timedOut ?? false;
  const aborted = input.aborted ?? false;
  const exitCode = input.exitCode ?? null;
  const exitSignal = input.exitSignal ?? null;

  return {
    success: !input.error && !timedOut && !aborted && exitCode === 0,
    exitCode,
    exitSignal,
    durationMs: Date.now() - input.startedAt,
    timedOut,
    aborted,
    stdout: toOutput(input.stdout),
    stderr: toOutput(input.stderr),
    error: input.error
  };
}

function toOutput(accumulator: OutputAccumulator): ProcessOutput {
  return {
    text: Buffer.concat(accumulator.chunks).toString('utf8'),
    totalBytes: accumulator.totalBytes,
    capturedBytes: accumulator.capturedBytes,
    omittedBytes: accumulator.totalBytes - accumulator.capturedBytes,
    truncated: accumulator.truncated
  };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
