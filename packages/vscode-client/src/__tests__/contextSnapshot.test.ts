import { describe, expect, it } from 'vitest';
import { buildOpenFileStates, clampPosition } from '../utils/contextSnapshot';

describe('context snapshot tab handling', () => {
  it('keeps every open text tab in a single pane', () => {
    const files = buildOpenFileStates([
      { path: 'src/one.ts', isActive: false, viewColumn: 1 },
      { path: 'src/two.ts', isActive: true, viewColumn: 1, cursor: { line: 4, character: 2 } },
      { path: 'src/three.ts', isActive: false, viewColumn: 1 }
    ]);

    expect(files).toHaveLength(3);
    expect(files.map(file => file.path)).toEqual(['src/one.ts', 'src/two.ts', 'src/three.ts']);
    expect(files.find(file => file.isActive)?.path).toBe('src/two.ts');
    expect(files[0].cursor).toEqual({ line: 0, character: 0 });
  });

  it('preserves same-file tabs in different editor groups and removes duplicate observations', () => {
    const files = buildOpenFileStates([
      { path: 'src/shared.ts', viewColumn: 1 },
      { path: 'src/shared.ts', viewColumn: 1, cursor: { line: 2, character: 1 } },
      { path: 'src/shared.ts', viewColumn: 2 }
    ]);

    expect(files).toHaveLength(2);
    expect(files.map(file => file.viewColumn)).toEqual([1, 2]);
  });

  it('clamps a saved cursor when the document shrinks', () => {
    expect(clampPosition({ line: 99, character: 80 }, 3, line => line === 2 ? 7 : 10))
      .toEqual({ line: 2, character: 7 });
  });
});
