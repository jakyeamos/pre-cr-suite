import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { runWorkspacePreCrCheck } from './precheck';

const tempRoots: string[] = [];

function createGitWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-precheck-'));
  tempRoots.push(workspaceRoot);
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: workspaceRoot });
  return workspaceRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('runWorkspacePreCrCheck', () => {
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
  });

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
  });
});
