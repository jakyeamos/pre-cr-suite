import type { WorkspaceCoverage } from '@pre-cr/core';

export interface ServerSettings {
  coverage: {
    lcovPath: string;
    istanbulJsonPath: string;
    preferredFormat: 'auto' | 'lcov' | 'istanbul';
    showDiagnostics: boolean;
    showCodeLens: boolean;
  };
  checklist: {
    enabled: boolean;
    prSize: {
      warnThreshold: number;
      errorThreshold: number;
      fileWarnThreshold: number;
    };
    security: {
      enabled: boolean;
    };
    docCoverage: {
      enabled: boolean;
      minCoverage: number;
    };
    testCoverage: {
      enabled: boolean;
      minNewCodeCoverage: number;
    };
  };
}

export const defaultSettings: ServerSettings = {
  coverage: {
    lcovPath: 'coverage/lcov.info',
    istanbulJsonPath: 'coverage/coverage-final.json',
    preferredFormat: 'auto',
    showDiagnostics: true,
    showCodeLens: true
  },
  checklist: {
    enabled: true,
    prSize: {
      warnThreshold: 200,
      errorThreshold: 500,
      fileWarnThreshold: 10
    },
    security: {
      enabled: true
    },
    docCoverage: {
      enabled: true,
      minCoverage: 80
    },
    testCoverage: {
      enabled: true,
      minNewCodeCoverage: 80
    }
  }
};

export interface ServerRequestState {
  readonly workspaceRoot: string | null;
  readonly globalSettings: ServerSettings;
  readonly coverage: WorkspaceCoverage | null;
  readonly trustedExecution: boolean;
}
