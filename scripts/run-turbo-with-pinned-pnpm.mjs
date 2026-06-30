import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { spawnSync } from 'child_process';

const shimDir = mkdtempSync(join(tmpdir(), 'pre-cr-pnpm-shim-'));
const shimPath = join(shimDir, 'pnpm');

writeFileSync(shimPath, '#!/bin/sh\nexec corepack pnpm "$@"\n', { mode: 0o755 });

try {
  const result = spawnSync('turbo', process.argv.slice(2), {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${shimDir}${delimiter}${process.env.PATH ?? ''}`
    }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  process.exit(result.status ?? 0);
} finally {
  rmSync(shimDir, { recursive: true, force: true });
}
