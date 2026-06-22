import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(),
    createWebviewPanel: vi.fn()
  },
  workspace: {
    workspaceFolders: []
  },
  commands: {
    registerCommand: vi.fn()
  },
  languages: {
    createDiagnosticCollection: vi.fn()
  },
  ViewColumn: {
    Two: 2
  },
  DiagnosticSeverity: {
    Warning: 1
  },
  Diagnostic: vi.fn(),
  Range: vi.fn()
}));

vi.mock('vscode-languageclient/node', () => ({}));

import { formatCoverageSurfaceLines } from '../features/preCrCheck';

describe('formatCoverageSurfaceLines', () => {
  it('includes surface counts and unsupported files', () => {
    const lines = formatCoverageSurfaceLines({
      surfaceSummary: {
        coveredFiles: 2,
        ignoredFiles: 1,
        unsupportedFiles: 2
      },
      unsupportedFiles: ['python/app.py', 'infra/template.yaml']
    });

    expect(lines).toEqual([
      '  Covered Surface Files: 2',
      '  Ignored Surface Files: 1',
      '  Unsupported Surface Files: 2',
      '',
      'Unsupported Files',
      '  - python/app.py',
      '  - infra/template.yaml'
    ]);
  });

  it('limits long unsupported file lists', () => {
    const lines = formatCoverageSurfaceLines({
      surfaceSummary: {
        coveredFiles: 1,
        ignoredFiles: 0,
        unsupportedFiles: 12
      },
      unsupportedFiles: Array.from({ length: 12 }, (_, index) => `file-${index}.txt`)
    });

    expect(lines).toContain('  ... and 2 more');
    expect(lines.filter((line) => line.startsWith('  - '))).toHaveLength(10);
  });
});
