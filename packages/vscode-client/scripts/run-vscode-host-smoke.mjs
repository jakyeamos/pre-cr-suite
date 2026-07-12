import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = mkdtempSync(join(tmpdir(), 'pre-cr-vscode-host-'));
const testProfileRoot = join(tmpdir(), 'pre-cr-vscode-test-profile');
const workspaceSettingsDirectory = join(workspaceRoot, '.vscode');

try {
  await mkdir(workspaceSettingsDirectory, { recursive: true });
  writeFileSync(join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'pre-cr-extension-host-fixture' }));
  writeFileSync(
    join(workspaceSettingsDirectory, 'settings.json'),
    JSON.stringify({ 'preCr.experimental.enabled': false })
  );

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
