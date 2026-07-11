import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const publishedArtifact = path.join(repoRoot, '..', 'packages', 'server', 'dist', 'server.js');
const bundledArtifact = path.join(repoRoot, '..', 'packages', 'vscode-client', 'dist', 'server.js');

function hash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

for (const filePath of [publishedArtifact, bundledArtifact]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing server artifact: ${filePath}`);
  }
}

const publishedHash = hash(publishedArtifact);
const bundledHash = hash(bundledArtifact);
if (publishedHash !== bundledHash) {
  throw new Error(`Server artifact mismatch: published=${publishedHash} bundled=${bundledHash}`);
}

console.log(`server-artifact-check: pass (${publishedHash})`);
