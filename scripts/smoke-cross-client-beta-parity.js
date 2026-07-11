const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'fixtures', 'cross-client-beta-parity');
const vscodeBundledServerPath = path.join(repoRoot, 'packages', 'vscode-client', 'dist', 'server.js');
const publishedServerPath = path.join(repoRoot, 'packages', 'server', 'dist', 'server.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-cross-client-beta-'));
const workspaceRoot = path.join(tempRoot, 'workspace');

function runGit(args) {
  execFileSync('git', args, {
    cwd: workspaceRoot,
    stdio: 'pipe'
  });
}

function fileUri(filePath) {
  return `file://${filePath}`;
}

function assertBuiltServer(serverPath, label) {
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Missing ${label} server at ${serverPath}. Run pnpm build first.`);
  }
}

class LspSession {
  constructor(label, serverPath) {
    this.label = label;
    this.serverPath = serverPath;
    this.nextId = 1;
    this.buffer = '';
    this.pending = new Map();
    this.child = spawn(process.execPath, [serverPath, '--stdio'], {
      cwd: workspaceRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.stderr = '';

    this.child.stdout.setEncoding('utf-8');
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      this.readMessages();
    });
    this.child.stderr.setEncoding('utf-8');
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
    });
    this.child.on('exit', (code, signal) => {
      const error = new Error(`${this.label} server exited with ${code ?? signal ?? 'unknown'}`);
      for (const { reject } of this.pending.values()) {
        reject(error);
      }
      this.pending.clear();
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      processId: process.pid,
      rootUri: fileUri(workspaceRoot),
      workspaceFolders: [
        {
          uri: fileUri(workspaceRoot),
          name: 'cross-client-beta-parity'
        }
      ],
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true
        }
      },
      initializationOptions: {
        trustedExecution: true
      }
    });
    this.notify('initialized', {});
    return result;
  }

  request(method, params) {
    const id = this.nextId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(message);
    });
  }

  notify(method, params) {
    this.write({
      jsonrpc: '2.0',
      method,
      params
    });
  }

  write(message) {
    const payload = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf-8')}\r\n\r\n${payload}`);
  }

  readMessages() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const header = this.buffer.slice(0, headerEnd);
      const match = /Content-Length: (\d+)/i.exec(header);
      if (!match) {
        throw new Error(`${this.label} server sent a response without Content-Length.`);
      }

      const length = Number(match[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + length;
      if (this.buffer.length < messageEnd) {
        return;
      }

      const rawMessage = this.buffer.slice(messageStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);
      this.handleMessage(JSON.parse(rawMessage));
    }
  }

  handleMessage(message) {
    if (typeof message.id === 'undefined') {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${this.label} ${message.error.message}`));
      return;
    }

    pending.resolve(message.result);
  }

  async close() {
    try {
      await this.request('shutdown', null);
    } catch {
      // The server may already be closing after a failed assertion.
    }
    this.notify('exit', null);
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill();
        resolve();
      }, 1000);
      this.child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

function normalizePath(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replaceAll(workspaceRoot, '<workspace>');
}

function normalizeHealth(health) {
  return {
    workspaceRoot: normalizePath(health.workspaceRoot),
    configPath: normalizePath(health.configPath),
    isLegacyConfig: health.isLegacyConfig,
    config: health.config,
    framework: {
      ...health.framework,
      configFile: normalizePath(health.framework.configFile)
    },
    coverage: {
      loaded: health.coverage.loaded,
      path: normalizePath(health.coverage.path),
      format: health.coverage.format,
      summary: health.coverage.summary
    },
    issues: health.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      hint: issue.hint
    })),
    warnings: health.warnings,
    ready: health.ready
  };
}

function normalizeRunResult(response) {
  const result = response.result;
  return {
    error: response.error,
    result: result
      ? {
          health: normalizeHealth(result.health),
          changedFiles: result.changedFiles.map((file) => ({
            path: file.path,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions
          })),
          testRun: result.testRun
            ? {
                framework: result.testRun.framework,
                command: result.testRun.command,
                success: result.testRun.success,
                exitCode: result.testRun.exitCode,
                coveragePath: normalizePath(result.testRun.coveragePath),
                error: result.testRun.error
              }
            : null,
          coverageCheck: result.coverageCheck,
          qualityAdapters: result.qualityAdapters.map((adapter) => ({
            name: adapter.name,
            command: adapter.command,
            required: adapter.required,
            success: adapter.success,
            skipped: adapter.skipped,
            exitCode: adapter.exitCode,
            error: adapter.error
          })),
          qualityAdaptersPassed: result.qualityAdaptersPassed,
          coveragePath: normalizePath(result.coveragePath)
        }
      : null
  };
}

function normalizeRefresh(result) {
  return {
    success: result.success,
    coveragePath: normalizePath(result.coveragePath),
    summary: result.summary,
    error: result.error
  };
}

function assertDeepEqual(label, actual, expected) {
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch\nExpected:\n${expectedJson}\nActual:\n${actualJson}`);
  }
}

async function collectPublicBetaSnapshot(label, serverPath) {
  const session = new LspSession(label, serverPath);
  try {
    await session.initialize();
    const healthBefore = await session.request('$/preCr/getProjectHealth', {});
    const refreshBefore = await session.request('$/preCr/refreshCoverage', {});
    const check = await session.request('$/preCr/runPreCrCheck', {});
    const refreshAfter = await session.request('$/preCr/refreshCoverage', {});

    return {
      healthBefore: normalizeHealth(healthBefore.health),
      refreshBefore: normalizeRefresh(refreshBefore),
      check: normalizeRunResult(check),
      refreshAfter: normalizeRefresh(refreshAfter)
    };
  } finally {
    await session.close();
  }
}

function assertBetaPromise(snapshot) {
  const check = snapshot.check.result;
  if (!check || !check.coverageCheck) {
    throw new Error('Expected runPreCrCheck to produce a coverage result.');
  }

  if (check.health.config.surfaces.covered[0] !== 'src/**') {
    throw new Error('Expected .pre-cr.json covered surface to be loaded.');
  }

  if (check.coverageCheck.passed !== false) {
    throw new Error('Expected unsupported surface to fail the changed-line gate.');
  }

  assertDeepEqual('surface summary', check.coverageCheck.surfaceSummary, {
    coveredFiles: 1,
    ignoredFiles: 1,
    unsupportedFiles: 1
  });
  assertDeepEqual('unsupported files', check.coverageCheck.unsupportedFiles, ['legacy/worker.js']);

  if (!check.coveragePath.endsWith(path.join('build', 'fixture.lcov'))) {
    throw new Error(`Expected adapter coverage path, received ${check.coveragePath}`);
  }

  if (snapshot.refreshAfter.success !== true || !snapshot.refreshAfter.summary) {
    throw new Error('Expected refreshCoverage to load the configured adapter report after Pre-CR Check.');
  }
}

try {
  assertBuiltServer(vscodeBundledServerPath, 'VS Code bundled');
  assertBuiltServer(publishedServerPath, 'published');

  fs.cpSync(fixtureRoot, workspaceRoot, { recursive: true });
  runGit(['init']);
  runGit(['config', 'user.email', 'smoke@example.com']);
  runGit(['config', 'user.name', 'Smoke Test']);
  runGit(['config', 'core.hooksPath', '/dev/null']);
  runGit(['add', '.']);
  runGit(['commit', '-m', 'fixture baseline']);
  fs.appendFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'module.exports.changed = true;\n');
  fs.appendFileSync(path.join(workspaceRoot, 'docs', 'setup.md'), '\nIgnored docs change.\n');
  fs.appendFileSync(path.join(workspaceRoot, 'legacy', 'worker.js'), 'module.exports.changed = true;\n');
  runGit(['add', 'src/app.js', 'docs/setup.md', 'legacy/worker.js']);

  Promise.all([
    collectPublicBetaSnapshot('VS Code bundled server', vscodeBundledServerPath),
    collectPublicBetaSnapshot('published server', publishedServerPath)
  ]).then(([vscodeSnapshot, publishedSnapshot]) => {
    assertBetaPromise(vscodeSnapshot);
    assertBetaPromise(publishedSnapshot);
    assertDeepEqual('cross-client public beta snapshot', publishedSnapshot, vscodeSnapshot);
    process.stdout.write(`Cross-client beta parity smoke passed in ${workspaceRoot}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }).finally(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
} catch (error) {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
}
