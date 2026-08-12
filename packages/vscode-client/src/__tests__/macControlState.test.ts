import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() }
}));

import { formatMacControlState } from '../utils/macControlState';

describe('Mac Control task state readback', () => {
  it('formats a stable machine-readable output record', () => {
    expect(formatMacControlState('preCr.runPreCrCheck', 'check_passed')).toBe(
      '[mac-control task=preCr.runPreCrCheck state=check_passed]'
    );
  });

  it('rejects identifiers that would make the output record ambiguous', () => {
    expect(() => formatMacControlState('preCr check', 'check passed')).toThrow(
      'must be stable tokens'
    );
  });
});
