import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveWorkspacePath,
  validateCoverageFile,
  validateSourcePath
} from './validation';

const temporaryRoots: string[] = [];

function createTemporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(directory);
  return directory;
}

function createWorkspace(): string {
  const root = createTemporaryDirectory('pre-cr-validation-workspace-');
  fs.mkdirSync(path.join(root, 'coverage'));
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveWorkspacePath', () => {
  it('returns lexical and real paths for an existing workspace file', () => {
    const workspaceRoot = createWorkspace();
    const coveragePath = path.join(workspaceRoot, 'coverage', 'report.lcov');
    const realWorkspaceRoot = fs.realpathSync(workspaceRoot);
    fs.writeFileSync(coveragePath, 'TN:\n');

    const result = resolveWorkspacePath(workspaceRoot, 'coverage/report.lcov');

    expect(result).toMatchObject({
      valid: true,
      resolvedPath: path.join(workspaceRoot, 'coverage', 'report.lcov'),
      realPath: fs.realpathSync(coveragePath),
      workspaceRoot: realWorkspaceRoot
    });
  });

  it('rejects null bytes, absolute paths, and traversal attempts', () => {
    const workspaceRoot = createWorkspace();
    const outsidePath = createTemporaryDirectory('pre-cr-validation-outside-');

    expect(resolveWorkspacePath(workspaceRoot, 'coverage\0report.lcov')).toMatchObject({
      valid: false,
      code: 'nul-byte'
    });
    expect(resolveWorkspacePath(workspaceRoot, outsidePath)).toMatchObject({
      valid: false,
      code: 'absolute-path'
    });
    expect(resolveWorkspacePath(workspaceRoot, '../outside/report.lcov')).toMatchObject({
      valid: false,
      code: 'outside-workspace'
    });
  });

  it('rejects a read target that escapes through a symlink', () => {
    const workspaceRoot = createWorkspace();
    const outsideRoot = createTemporaryDirectory('pre-cr-validation-outside-');
    const outsideFile = path.join(outsideRoot, 'report.lcov');
    const linkPath = path.join(workspaceRoot, 'coverage', 'external.lcov');
    fs.writeFileSync(outsideFile, 'TN:\n');
    fs.symlinkSync(outsideFile, linkPath);

    expect(resolveWorkspacePath(workspaceRoot, 'coverage/external.lcov')).toMatchObject({
      valid: false,
      code: 'outside-workspace'
    });
    expect(validateCoverageFile('coverage/external.lcov', workspaceRoot)).toMatchObject({
      valid: false,
      error: 'Path resolves outside workspace directory'
    });
  });

  it('allows a read target that resolves through an in-workspace symlink', () => {
    const workspaceRoot = createWorkspace();
    const targetPath = path.join(workspaceRoot, 'coverage', 'target.lcov');
    const linkPath = path.join(workspaceRoot, 'coverage', 'link.lcov');
    fs.writeFileSync(targetPath, 'TN:\n');
    fs.symlinkSync(targetPath, linkPath);

    expect(resolveWorkspacePath(workspaceRoot, 'coverage/link.lcov')).toMatchObject({
      valid: true,
      resolvedPath: path.join(workspaceRoot, 'coverage', 'link.lcov'),
      realPath: fs.realpathSync(targetPath)
    });
    expect(validateCoverageFile('coverage/link.lcov', workspaceRoot)).toMatchObject({
      valid: true,
      fileSize: 4
    });
  });

  it('resolves a missing write target through its nearest existing parent', () => {
    const workspaceRoot = createWorkspace();
    const realWorkspaceRoot = fs.realpathSync(workspaceRoot);

    expect(resolveWorkspacePath(workspaceRoot, 'generated/results/report.json', {
      access: 'write'
    })).toMatchObject({
      valid: true,
      resolvedPath: path.join(workspaceRoot, 'generated', 'results', 'report.json'),
      realParentPath: realWorkspaceRoot
    });
  });

  it('rejects a missing write target beneath an external symlink parent', () => {
    const workspaceRoot = createWorkspace();
    const outsideRoot = createTemporaryDirectory('pre-cr-validation-outside-');
    fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'generated'));

    expect(resolveWorkspacePath(workspaceRoot, 'generated/report.json', {
      access: 'write'
    })).toMatchObject({
      valid: false,
      code: 'outside-workspace'
    });
  });
});

describe('validateSourcePath', () => {
  it('uses contained-path validation while allowing a missing source file', () => {
    const workspaceRoot = createWorkspace();

    expect(validateSourcePath('src/missing.ts', workspaceRoot)).toEqual({
      valid: true,
      resolvedPath: path.join(workspaceRoot, 'src', 'missing.ts')
    });
    expect(validateSourcePath('/tmp/outside.ts', workspaceRoot)).toMatchObject({
      valid: false,
      error: 'Absolute paths are not allowed'
    });
  });
});
