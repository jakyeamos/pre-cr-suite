import { describe, expect, it } from 'vitest';

import { runProcess } from './processRunner';

const NODE = process.execPath;
const CWD = process.cwd();

describe('runProcess', () => {
  it('runs commands without a shell and captures both streams', async () => {
    const literalArgument = 'literal; this must not execute';
    const result = await runProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write(process.argv[1]); process.stderr.write("stderr");', literalArgument],
      cwd: CWD,
      timeoutMs: 1_000
    });

    expect(result).toMatchObject({
      success: true,
      exitCode: 0,
      exitSignal: null,
      timedOut: false,
      aborted: false,
      error: undefined
    });
    expect(result.stdout).toEqual({
      text: literalArgument,
      totalBytes: literalArgument.length,
      capturedBytes: literalArgument.length,
      omittedBytes: 0,
      truncated: false
    });
    expect(result.stderr.text).toBe('stderr');
  });

  it('reports non-zero exits without treating them as successful', async () => {
    const result = await runProcess({
      command: NODE,
      args: ['-e', 'process.exit(7)'],
      cwd: CWD,
      timeoutMs: 1_000
    });

    expect(result).toMatchObject({
      success: false,
      exitCode: 7,
      timedOut: false,
      aborted: false,
      error: 'Process exited with code 7.'
    });
  });

  it('caps captured stdout and stderr with deterministic metadata', async () => {
    const result = await runProcess({
      command: NODE,
      args: ['-e', 'process.stdout.write("abcdef"); process.stderr.write("123456");'],
      cwd: CWD,
      timeoutMs: 1_000,
      maxStdoutBytes: 4,
      maxStderrBytes: 3
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toEqual({
      text: 'abcd',
      totalBytes: 6,
      capturedBytes: 4,
      omittedBytes: 2,
      truncated: true
    });
    expect(result.stderr).toEqual({
      text: '123',
      totalBytes: 6,
      capturedBytes: 3,
      omittedBytes: 3,
      truncated: true
    });
  });

  it('terminates a process after the timeout', async () => {
    const result = await runProcess({
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      cwd: CWD,
      timeoutMs: 50
    });

    expect(result).toMatchObject({
      success: false,
      timedOut: true,
      aborted: false,
      error: 'Process timed out after 50ms.'
    });
  }, 5_000);

  it('terminates descendants when a process tree times out', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const result = await runProcess({
      command: NODE,
      args: ['-e', [
        "const { spawn } = require('child_process');",
        "const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);",
        'process.stdout.write(String(descendant.pid));',
        'setInterval(() => {}, 1000);'
      ].join('\n')],
      cwd: CWD,
      timeoutMs: 50
    });

    expect(result.timedOut).toBe(true);
    const descendantPid = Number(result.stdout.text);
    expect(Number.isInteger(descendantPid)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1_250));

    let descendantAlive = true;
    try {
      process.kill(descendantPid, 0);
    } catch {
      descendantAlive = false;
    }

    if (descendantAlive) {
      try {
        process.kill(descendantPid, 'SIGKILL');
      } catch {
        // The descendant may exit between the liveness check and cleanup.
      }
    }

    expect(descendantAlive).toBe(false);
  }, 5_000);

  it('returns a cancellation result when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runProcess({
      command: NODE,
      args: ['-e', 'process.exit(0)'],
      cwd: CWD,
      signal: controller.signal
    });

    expect(result).toMatchObject({
      success: false,
      exitCode: null,
      timedOut: false,
      aborted: true,
      error: 'Process run was aborted before it started.'
    });
  });

  it('terminates a running process when its signal is aborted', async () => {
    const controller = new AbortController();
    const running = runProcess({
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      cwd: CWD,
      timeoutMs: 1_000,
      signal: controller.signal
    });

    setTimeout(() => controller.abort(), 50);

    await expect(running).resolves.toMatchObject({
      success: false,
      timedOut: false,
      aborted: true,
      error: 'Process run was aborted.'
    });
  }, 5_000);
});
