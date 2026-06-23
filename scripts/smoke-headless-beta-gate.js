const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'fixtures', 'headless-beta-gate');
const cliPath = path.join(repoRoot, 'packages', 'server', 'dist', 'cli.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-headless-beta-'));
const workspaceRoot = path.join(tempRoot, 'workspace');
const binRoot = path.join(tempRoot, 'bin');
const preCrBin = path.join(binRoot, 'pre-cr');

function runGit(args) {
  execFileSync('git', args, {
    cwd: workspaceRoot,
    stdio: 'pipe'
  });
}

try {
  if (!fs.existsSync(cliPath)) {
    throw new Error(`Missing built CLI at ${cliPath}. Run pnpm build first.`);
  }

  fs.cpSync(fixtureRoot, workspaceRoot, { recursive: true });
  fs.mkdirSync(binRoot);
  fs.chmodSync(cliPath, 0o755);
  fs.symlinkSync(cliPath, preCrBin);

  runGit(['init']);
  runGit(['config', 'user.email', 'smoke@example.com']);
  runGit(['config', 'user.name', 'Smoke Test']);
  runGit(['add', '.']);
  runGit(['commit', '-m', 'fixture baseline']);
  fs.appendFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'module.exports.changed = true;\n');

  const result = spawnSync(preCrBin, ['run', '--json', '--workspace', workspaceRoot], {
    cwd: workspaceRoot,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FORCE_COLOR: '0'
    }
  });

  if (result.status !== 0) {
    throw new Error([
      `pre-cr exited with ${result.status}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }

  const payload = JSON.parse(result.stdout);
  const coverageCheck = payload.result && payload.result.coverageCheck;

  if (payload.ok !== true) {
    throw new Error(`Expected ok=true, received ${payload.ok}`);
  }

  if (!payload.result.coveragePath.endsWith(path.join('build', 'fixture.lcov'))) {
    throw new Error(`Expected adapter coverage path, received ${payload.result.coveragePath}`);
  }

  if (!coverageCheck || coverageCheck.passed !== true) {
    throw new Error(`Expected passing coverage check, received ${JSON.stringify(coverageCheck)}`);
  }

  if (coverageCheck.summary.coveredLines !== 1 || coverageCheck.summary.uncoveredLines !== 0) {
    throw new Error(`Unexpected coverage summary: ${JSON.stringify(coverageCheck.summary)}`);
  }

  process.stdout.write(`Headless beta smoke passed in ${workspaceRoot}\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
