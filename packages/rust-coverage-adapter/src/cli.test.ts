import { afterEach, describe, expect, it, vi } from 'vitest';

import { main } from './cli';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Rust coverage CLI', () => {
  it('reports the package version without parsing coverage options', async () => {
    for (const argument of ['version', '--version', '-V']) {
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await expect(main([argument])).resolves.toBe(0);
      expect(write).toHaveBeenCalledWith('pre-cr-rust-coverage 0.1.0\n');
      write.mockRestore();
    }
  });
});
