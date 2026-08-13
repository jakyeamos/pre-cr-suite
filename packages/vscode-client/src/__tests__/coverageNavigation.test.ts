import { describe, expect, it } from 'vitest';
import { validatePathInWorkspace } from '../utils/git';

describe('coverage navigation paths', () => {
  const workspaceRoot = '/workspace/project';

  it('resolves an absolute report path only when it is inside the workspace', () => {
    const absolutePath = '/workspace/project/src/service.ts';
    const relativePath = absolutePath.slice(workspaceRoot.length + 1);

    expect(validatePathInWorkspace(relativePath, workspaceRoot)).toBe(absolutePath);
  });

  it('rejects a same-basename path outside the workspace', () => {
    expect(validatePathInWorkspace('../other/src/service.ts', workspaceRoot)).toBeNull();
  });
});
