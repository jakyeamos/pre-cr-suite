import { describe, expect, it } from 'vitest';

import { parseCommandString } from './command';

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
