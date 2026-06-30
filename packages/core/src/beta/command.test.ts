import { describe, expect, it } from 'vitest';

import { parseCommandString, resolveWorkspaceCommand } from './command';

describe('parseCommandString', () => {
  it('parses whitespace-separated commands', () => {
    expect(parseCommandString('pnpm test -- --coverage')).toEqual({
      command: 'pnpm',
      args: ['test', '--', '--coverage']
    });
  });

  it('preserves quoted segments', () => {
    expect(parseCommandString('pnpm exec vitest --reporter "dot reporter"')).toEqual({
      command: 'pnpm',
      args: ['exec', 'vitest', '--reporter', 'dot reporter']
    });
  });

  it('returns null for blank input', () => {
    expect(parseCommandString('   ')).toBeNull();
  });
});

describe('resolveWorkspaceCommand', () => {
  it('routes pnpm through corepack when packageManager pins pnpm', () => {
    expect(resolveWorkspaceCommand('/repo', {
      command: 'pnpm',
      args: ['test']
    }, {
      packageManager: 'pnpm@9.15.0'
    })).toEqual({
      command: 'corepack',
      args: ['pnpm', 'test']
    });
  });
});
