import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseIstanbulContent } from './istanbul';
import { parseLcovContent } from './lcov';

const temporaryRoots: string[] = [];

function createWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-parser-path-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('coverage source path containment', () => {
  it('rejects an LCOV source outside the workspace', () => {
    const workspaceRoot = createWorkspace();

    const result = parseLcovContent([
      'SF:/tmp/outside.ts',
      'DA:1,1',
      'LF:1',
      'LH:1',
      'end_of_record'
    ].join('\n'), workspaceRoot);

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fatal: true }));
  });

  it('rejects an Istanbul source outside the workspace', () => {
    const workspaceRoot = createWorkspace();

    const result = parseIstanbulContent(JSON.stringify({
      '/tmp/outside.ts': {
        path: '/tmp/outside.ts',
        statementMap: {
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }
        },
        s: { '0': 1 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {}
      }
    }), workspaceRoot);

    expect(result.success).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ fatal: true }));
  });
});
