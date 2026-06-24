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

import { buildProjectConfigTemplate, formatCoverageFailureMessage, formatCoverageSurfaceLines } from '../features/preCrCheck';

describe('buildProjectConfigTemplate', () => {
  it('enables every check in new project configs', () => {
    const config = JSON.parse(buildProjectConfigTemplate()) as {
      checks: {
        coverage: boolean;
        security: boolean;
        checklist: boolean;
      };
      threshold: number;
    };

    expect(config.checks).toEqual({
      coverage: true,
      security: true,
      checklist: true
    });
    expect(config.threshold).toBe(80);
  });
});

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
      '  - infra/template.yaml',
      '',
      'Fix Setup: Unsupported files are outside the current coverage surface.',
      '  Add a coverage adapter for these paths or reclassify them in .pre-cr.json under surfaces.covered, surfaces.ignored, or surfaces.unsupported.'
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

describe('formatCoverageFailureMessage', () => {
  it('reports unsupported surfaces as the blocking reason', () => {
    expect(formatCoverageFailureMessage({
      coveragePercent: 100,
      threshold: 80,
      unsupportedFiles: ['python/app.py']
    })).toBe('1 unsupported surface file needs setup guidance');
  });

  it('falls back to threshold wording when no unsupported files are present', () => {
    expect(formatCoverageFailureMessage({
      coveragePercent: 72.5,
      threshold: 80,
      unsupportedFiles: []
    })).toBe('Coverage 72.5% is below 80%');
  });
});
