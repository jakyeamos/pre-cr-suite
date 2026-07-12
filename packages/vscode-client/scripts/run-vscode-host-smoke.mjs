import { appendFileSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const fixtureRoot = join(repoRoot, 'fixtures', 'headless-beta-gate');
const scenarios = (process.env.PRE_CR_EXTENSION_HOST_SCENARIOS ?? 'pass,warning,blocked').split(',');

async function runScenario(scenario) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), `pre-cr-vscode-host-${scenario}-`));
  const testProfileRoot = mkdtempSync(join(tmpdir(), `p-${scenario}-`));
  const workspaceSettingsDirectory = join(workspaceRoot, '.vscode');

  try {
    cpSync(fixtureRoot, workspaceRoot, { recursive: true });
    await mkdir(workspaceSettingsDirectory, { recursive: true });
    writeFileSync(
      join(workspaceSettingsDirectory, 'settings.json'),
      JSON.stringify({ 'preCr.experimental.enabled': false })
    );

    if (scenario === 'blocked') {
      writeFileSync(join(workspaceRoot, 'scripts', 'test-ok.js'), 'process.exitCode = 1;\n');
    }

    const runGit = (args) => execFileSync('git', args, { cwd: workspaceRoot, stdio: 'pipe' });
    runGit(['init']);
    runGit(['config', 'user.email', 'smoke@example.com']);
    runGit(['config', 'user.name', 'VS Code Host Smoke']);
    runGit(['config', 'core.hooksPath', '/dev/null']);
    runGit(['add', '.']);
    runGit(['commit', '-m', 'fixture baseline']);

    if (scenario !== 'warning') {
      const sourcePath = join(workspaceRoot, 'src', 'app.js');
      const source = await import('node:fs/promises').then(({ readFile }) => readFile(sourcePath, 'utf8'));
      writeFileSync(sourcePath, source.replace('return 1;', 'return 2;'));
      appendFileSync(sourcePath, '\n');
      runGit(['add', 'src/app.js']);
    }

    const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;
    const exitCode = await runTests({
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
      cachePath: join(tmpdir(), 'pre-cr-vscode-test-cache'),
      extensionDevelopmentPath: packageRoot,
      extensionTestsPath: join(packageRoot, 'test', 'extensionHostSmoke.mjs'),
      extensionTestsEnv: {
        PRE_CR_EXTENSION_HOST_MODE: 'trusted',
        PRE_CR_EXTENSION_HOST_SCENARIO: scenario
      },
      launchArgs: [
        `--extensions-dir=${join(testProfileRoot, 'e')}`,
        `--user-data-dir=${join(testProfileRoot, 'u')}`,
        workspaceRoot,
        '--disable-extensions'
      ]
    });

    if (exitCode !== 0) {
      throw new Error(`VS Code host smoke failed for ${scenario} scenario with exit code ${exitCode}.`);
    }
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(testProfileRoot, { recursive: true, force: true });
  }
}

for (const scenario of scenarios) {
  await runScenario(scenario);
}
