import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { runWorkspacePreCrCheck } from './precheck';

const tempRoots: string[] = [];
const PRECHECK_INTEGRATION_TIMEOUT_MS = 15_000;

function createGitWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-precheck-'));
  tempRoots.push(workspaceRoot);
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'core.hooksPath', '/dev/null'], { cwd: workspaceRoot });
  return workspaceRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('runWorkspacePreCrCheck', () => {
  it('honors an absolute configured coverage path from a custom test command', async () => {
    const workspaceRoot = createGitWorkspace();
    const coveragePath = path.join(workspaceRoot, 'build', 'python.lcov');
    fs.mkdirSync(path.join(workspaceRoot, 'python'));
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'));
    fs.writeFileSync(path.join(workspaceRoot, 'python', 'app.py'), 'print("old")\n');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'emit-coverage.js'), `
const fs = require('fs');
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/python.lcov', [
  'TN:',
  'SF:python/app.py',
  'DA:1,1',
  'DA:2,1',
  'LF:2',
  'LH:2',
  'end_of_record',
  ''
].join('\\n'));
`);
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      testCommand: 'node scripts/emit-coverage.js',
      coveragePaths: [coveragePath],
      coverageFormat: 'lcov',
      threshold: 100
    }));
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, 'python', 'app.py'), 'print("new")\n');

    const result = await runWorkspacePreCrCheck(workspaceRoot);

    expect(result.error).toBeUndefined();
    expect(result.result?.coveragePath).toBe(coveragePath);
    expect(result.result?.coverageCheck?.passed).toBe(true);
    expect(result.result?.coverageCheck?.summary.coveredLines).toBe(1);
  }, PRECHECK_INTEGRATION_TIMEOUT_MS);

  it('can use a configured coverage adapter after the test command succeeds', async () => {
    const workspaceRoot = createGitWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, 'python'));
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'));
    fs.writeFileSync(path.join(workspaceRoot, 'python', 'app.py'), 'print("old")\n');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'test-ok.js'), '');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'emit-coverage.js'), `
const fs = require('fs');
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/python.lcov', [
  'TN:',
  'SF:python/app.py',
  'DA:1,1',
  'DA:2,1',
  'LF:2',
  'LH:2',
  'end_of_record',
  ''
].join('\\n'));
`);
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      testCommand: 'node scripts/test-ok.js',
      coverageAdapters: [
        {
          name: 'python-lcov',
          command: 'node scripts/emit-coverage.js',
          coveragePath: 'build/python.lcov',
          coverageFormat: 'lcov'
        }
      ],
      surfaces: {
        covered: ['python/**'],
        ignored: [],
        unsupported: []
      },
      threshold: 100
    }));
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, 'python', 'app.py'), 'print("new")\n');

    const result = await runWorkspacePreCrCheck(workspaceRoot);

    expect(result.error).toBeUndefined();
    expect(result.result?.coveragePath).toBe(path.join(workspaceRoot, 'build', 'python.lcov'));
    expect(result.result?.coverageCheck?.passed).toBe(true);
    expect(result.result?.coverageCheck?.summary.coveredLines).toBe(1);
  }, PRECHECK_INTEGRATION_TIMEOUT_MS);

  it('prefers configured adapter coverage over a default runner coverage file', async () => {
    const workspaceRoot = createGitWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, 'python'));
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'));
    fs.writeFileSync(path.join(workspaceRoot, 'python', 'app.py'), 'print("old")\n');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'test-with-js-coverage.js'), `
const fs = require('fs');
fs.mkdirSync('coverage', { recursive: true });
fs.writeFileSync('coverage/lcov.info', [
  'TN:',
  'SF:python/app.py',
  'DA:1,1',
  'DA:2,0',
  'LF:2',
  'LH:1',
  'end_of_record',
  ''
].join('\\n'));
`);
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'emit-python-coverage.js'), `
const fs = require('fs');
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/python.lcov', [
  'TN:',
  'SF:python/app.py',
  'DA:1,1',
  'DA:2,1',
  'LF:2',
  'LH:2',
  'end_of_record',
  ''
].join('\\n'));
`);
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      testCommand: 'node scripts/test-with-js-coverage.js',
      coveragePaths: ['coverage/lcov.info'],
      coverageAdapters: [
        {
          name: 'python-lcov',
          command: 'node scripts/emit-python-coverage.js',
          coveragePath: 'build/python.lcov',
          coverageFormat: 'lcov'
        }
      ],
      surfaces: {
        covered: ['python/**'],
        ignored: [],
        unsupported: []
      },
      threshold: 100
    }));
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, 'python', 'app.py'), 'print("new")\n');

    const result = await runWorkspacePreCrCheck(workspaceRoot);

    expect(result.result?.coveragePath).toBe(path.join(workspaceRoot, 'build', 'python.lcov'));
    expect(result.result?.coverageCheck?.passed).toBe(true);
  }, PRECHECK_INTEGRATION_TIMEOUT_MS);

  it('runs quality adapters against the Pre-CR changed-file set', async () => {
    const workspaceRoot = createGitWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'));
    fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), 'build/\nquality-args.json\n');
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'console.log("old");\n');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'test-ok.js'), '');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'emit-coverage.js'), `
const fs = require('fs');
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/app.lcov', [
  'TN:',
  'SF:src/app.js',
  'DA:1,1',
  'DA:2,1',
  'LF:2',
  'LH:2',
  'end_of_record',
  ''
].join('\\n'));
`);
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'quality-gate.js'), `
const fs = require('fs');
const args = process.argv.slice(2);
fs.writeFileSync('quality-args.json', JSON.stringify(args));
process.exit(0);
`);
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      testCommand: 'node scripts/test-ok.js',
      coverageAdapters: [
        {
          name: 'js-lcov',
          command: 'node scripts/emit-coverage.js',
          coveragePath: 'build/app.lcov',
          coverageFormat: 'lcov'
        }
      ],
      qualityAdapters: [
        {
          name: 'anti-slop',
          command: 'node scripts/quality-gate.js --files {changedFiles}',
          required: true
        }
      ],
      surfaces: {
        covered: ['src/**'],
        ignored: [],
        unsupported: []
      },
      threshold: 100
    }));
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot });
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'initial'], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'console.log("new");\n');

    const result = await runWorkspacePreCrCheck(workspaceRoot);
    const qualityArgs = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'quality-args.json'), 'utf-8'));

    expect(result.result?.coverageCheck?.passed).toBe(true);
    expect(result.result?.qualityAdaptersPassed).toBe(true);
    expect(result.result?.qualityAdapters[0].name).toBe('anti-slop');
    expect(qualityArgs).toEqual(['--files', 'src/app.js']);
  }, PRECHECK_INTEGRATION_TIMEOUT_MS);

  it('marks the Pre-CR result failed when a required quality adapter fails', async () => {
    const workspaceRoot = createGitWorkspace();
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.mkdirSync(path.join(workspaceRoot, 'scripts'));
    fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), 'build/\nquality-args.json\n');
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'console.log("old");\n');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'test-ok.js'), '');
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'emit-coverage.js'), `
const fs = require('fs');
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/app.lcov', [
  'TN:',
  'SF:src/app.js',
  'DA:1,1',
  'DA:2,1',
  'LF:2',
  'LH:2',
  'end_of_record',
  ''
].join('\\n'));
`);
    fs.writeFileSync(path.join(workspaceRoot, 'scripts', 'quality-gate.js'), 'process.exit(1);\n');
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      testCommand: 'node scripts/test-ok.js',
      coverageAdapters: [
        {
          name: 'js-lcov',
          command: 'node scripts/emit-coverage.js',
          coveragePath: 'build/app.lcov',
          coverageFormat: 'lcov'
        }
      ],
      qualityAdapters: [
        {
          name: 'anti-slop',
          command: 'node scripts/quality-gate.js --files {changedFiles}',
          required: true
        }
      ],
      surfaces: {
        covered: ['src/**'],
        ignored: [],
        unsupported: []
      },
      threshold: 100
    }));
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot });
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'initial'], { cwd: workspaceRoot });
    fs.appendFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'console.log("new");\n');

    const result = await runWorkspacePreCrCheck(workspaceRoot);

    expect(result.result?.coverageCheck?.passed).toBe(true);
    expect(result.result?.qualityAdaptersPassed).toBe(false);
    expect(result.result?.qualityAdapters[0].success).toBe(false);
  }, PRECHECK_INTEGRATION_TIMEOUT_MS);

});
