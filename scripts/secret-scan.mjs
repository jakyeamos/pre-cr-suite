import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirs = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'test',
  'tests',
])
const ignoredFiles = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'tsconfig.tsbuildinfo',
])
const extensions = new Set(['.cjs', '.js', '.json', '.mjs', '.md', '.ts', '.tsx', '.yaml', '.yml'])
const patterns = [
  /(?:sk-ant-|sk-proj-)[A-Za-z0-9_-]{20,}/,
  /(?:API_KEY|SECRET|TOKEN|PRIVATE_KEY)\s*=\s*["']?[A-Za-z0-9_./+-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
]

function extname(path) {
  const index = path.lastIndexOf('.')
  return index === -1 ? '' : path.slice(index)
}

function scanDir(dir, findings) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) scanDir(path, findings)
      continue
    }

    if (
      !stat.isFile() ||
      ignoredFiles.has(entry) ||
      entry.includes('.test.') ||
      entry.includes('.spec.') ||
      !extensions.has(extname(entry))
    ) continue

    const text = readFileSync(path, 'utf8')
    for (const pattern of patterns) {
      if (pattern.test(text)) findings.push(relative(root, path))
    }
  }
}

const findings = []
scanDir(root, findings)

if (findings.length > 0) {
  console.error(`Potential secret literals found in: ${[...new Set(findings)].join(', ')}`)
  process.exit(1)
}

console.log('No high-confidence secret literals found.')
