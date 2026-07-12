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
const workspaceRoot = mkdtempSync(join(tmpdir(), 'pre-cr-vscode-host-'));
const testProfileRoot = join(tmpdir(), 'pre-cr-vscode-test-profile');
const workspaceSettingsDirectory = join(workspaceRoot, '.vscode');

try {
  cpSync(fixtureRoot, workspaceRoot, { recursive: true });
  await mkdir(workspaceSettingsDirectory, { recursive: true });
  writeFileSync(
    join(workspaceSettingsDirectory, 'settings.json'),
    JSON.stringify({ 'preCr.experimental.enabled': false })
  );

  const runGit = (args) => execFileSync('git', args, { cwd: workspaceRoot, stdio: 'pipe' });
  runGit(['init']);
  runGit(['config', 'user.email', 'smoke@example.com']);
  runGit(['config', 'user.name', 'VS Code Host Smoke']);
  runGit(['config', 'core.hooksPath', '/dev/null']);
  runGit(['add', '.']);
  runGit(['commit', '-m', 'fixture baseline']);
  const sourcePath = join(workspaceRoot, 'src', 'app.js');
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(sourcePath, 'utf8'));
  writeFileSync(sourcePath, source.replace('return 1;', 'return 2;'));
  appendFileSync(sourcePath, '\n');
  runGit(['add', 'src/app.js']);

  const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;
  const exitCode = await runTests({
    ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
    cachePath: join(tmpdir(), 'pre-cr-vscode-test-cache'),
    extensionDevelopmentPath: packageRoot,
    extensionTestsPath: join(packageRoot, 'test', 'extensionHostSmoke.mjs'),
    extensionTestsEnv: {
      PRE_CR_EXTENSION_HOST_MODE: 'trusted'
    },
    launchArgs: [
      `--extensions-dir=${join(testProfileRoot, 'extensions')}`,
      `--user-data-dir=${join(testProfileRoot, 'user-data')}`,
      workspaceRoot,
      '--disable-extensions'
    ]
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
} finally {
  rmSync(workspaceRoot, { recursive: true, force: true });
}
