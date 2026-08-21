import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const serverArtifact = path.resolve(packageRoot, '../../server/dist/server.js');
const outputPath = path.resolve(packageRoot, '../dist/server.js');

if (!fs.existsSync(serverArtifact)) {
  throw new Error(`Missing compiled server artifact at ${serverArtifact}. Build @pre-cr/server first.`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.copyFileSync(serverArtifact, outputPath);
