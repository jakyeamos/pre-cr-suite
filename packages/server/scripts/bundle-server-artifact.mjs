import { build } from 'esbuild';
import { resolve } from 'node:path';

const packageRoot = resolve(new URL('..', import.meta.url).pathname);

await build({
  entryPoints: [resolve(packageRoot, 'dist/server.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: resolve(packageRoot, 'dist/server.js'),
  allowOverwrite: true,
  legalComments: 'none',
  sourcemap: false
});
