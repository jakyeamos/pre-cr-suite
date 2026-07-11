import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  WorkspaceSessionManager,
  canonicalWorkspaceRoot,
  canonicalWorkspaceUri
} from './workspaceSession';

function createWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-session-'));
}

describe('WorkspaceSessionManager', () => {
  it('canonicalizes aliases and keeps session state isolated by workspace', () => {
    const firstRoot = createWorkspace();
    const secondRoot = createWorkspace();
    const manager = new WorkspaceSessionManager();
    const first = manager.getOrCreate(path.join(firstRoot, '..', path.basename(firstRoot)), true);
    const second = manager.getOrCreate(secondRoot, false);

    expect(first.key).toBe(canonicalWorkspaceRoot(firstRoot));
    expect(manager.get(firstRoot)).toBe(first);
    expect(manager.get(secondRoot)).toBe(second);
    expect(first.trustedExecution).toBe(true);
    expect(second.trustedExecution).toBe(false);
    expect(manager.values()).toHaveLength(2);
  });

  it('resolves the most-specific nested workspace for a file URI', () => {
    const outerRoot = createWorkspace();
    const innerRoot = path.join(outerRoot, 'packages', 'app');
    fs.mkdirSync(innerRoot, { recursive: true });
    const filePath = path.join(innerRoot, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'export {}\n');

    const manager = new WorkspaceSessionManager();
    const outer = manager.getOrCreate(outerRoot);
    const inner = manager.getOrCreate(innerRoot);

    expect(manager.getForUri(canonicalWorkspaceUri(filePath))).toBe(inner);
    expect(manager.getForPath(path.join(outerRoot, 'README.md'))).toBe(outer);
    expect(manager.getForPath(path.join(os.tmpdir(), 'outside-pre-cr.ts'))).toBeNull();
  });

  it('keeps same-named files and readiness state isolated across roots', () => {
    const firstRoot = createWorkspace();
    const secondRoot = createWorkspace();
    const manager = new WorkspaceSessionManager();
    const first = manager.getOrCreate(firstRoot);
    const second = manager.getOrCreate(secondRoot);

    manager.update(firstRoot, { readiness: 'warning', coveragePath: path.join(firstRoot, 'coverage.lcov') });
    manager.update(secondRoot, { readiness: 'ready', coveragePath: path.join(secondRoot, 'coverage.lcov') });

    expect(manager.getForUri(canonicalWorkspaceUri(firstRoot))).toBe(first);
    expect(manager.getForUri(canonicalWorkspaceUri(secondRoot))).toBe(second);
    expect(first.readiness).toBe('warning');
    expect(second.readiness).toBe('ready');
    expect(first.coveragePath).not.toBe(second.coveragePath);
  });
});
