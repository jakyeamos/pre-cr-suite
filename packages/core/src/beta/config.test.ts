import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PRE_CR_CONFIG, loadProjectConfig, resolveProjectPath } from './config';

const tempRoots: string[] = [];

function createWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-config-'));
  tempRoots.push(workspaceRoot);
  return workspaceRoot;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('loadProjectConfig', () => {
  it('falls back to defaults when no repo config exists', () => {
    const workspaceRoot = createWorkspace();

    const result = loadProjectConfig(workspaceRoot);

    expect(result.path).toBeNull();
    expect(result.config).toEqual(DEFAULT_PRE_CR_CONFIG);
    expect(result.warnings).toEqual([]);
  });

  it('maps legacy coveragePath to coveragePaths', () => {
    const workspaceRoot = createWorkspace();
    const configPath = path.join(workspaceRoot, '.pre-cr.json');

    fs.writeFileSync(configPath, JSON.stringify({
      version: 1,
      coveragePath: 'coverage/lcov.info',
      threshold: 90
    }));

    const result = loadProjectConfig(workspaceRoot);

    expect(result.path).toBe(configPath);
    expect(result.isLegacyConfig).toBe(true);
    expect(result.config.coveragePaths).toEqual(['coverage/lcov.info']);
    expect(result.config.threshold).toBe(90);
    expect(result.warnings).toContain('Using legacy "coveragePath"; prefer "coveragePaths".');
  });

  it('resolves project-relative coverage paths from the config directory', () => {
    const workspaceRoot = createWorkspace();
    const configPath = path.join(workspaceRoot, '.pre-cr.json');

    fs.writeFileSync(configPath, JSON.stringify({
      version: 1,
      coveragePaths: ['reports/lcov.info']
    }));

    const result = loadProjectConfig(workspaceRoot);

    expect(resolveProjectPath(workspaceRoot, result, 'reports/lcov.info')).toBe(
      path.join(workspaceRoot, 'reports/lcov.info')
    );
  });

  it('loads coverage adapters and surface declarations', () => {
    const workspaceRoot = createWorkspace();
    fs.writeFileSync(path.join(workspaceRoot, '.pre-cr.json'), JSON.stringify({
      version: 1,
      coverageAdapters: [
        {
          name: 'python-lcov',
          command: 'python scripts/emit_lcov.py',
          coveragePath: 'build/python.lcov',
          coverageFormat: 'lcov'
        }
      ],
      surfaces: {
        covered: ['src/**'],
        ignored: ['docs/**'],
        unsupported: ['python/**']
      }
    }));

    const result = loadProjectConfig(workspaceRoot);

    expect(result.config.coverageAdapters).toEqual([
      {
        name: 'python-lcov',
        command: 'python scripts/emit_lcov.py',
        coveragePath: 'build/python.lcov',
        coverageFormat: 'lcov'
      }
    ]);
    expect(result.config.surfaces).toEqual({
      covered: ['src/**'],
      ignored: ['docs/**'],
      unsupported: ['python/**']
    });
  });
});
