import { describe, expect, it } from 'vitest';

import {
  PRE_CR_METHODS,
  PRE_CR_NOTIFICATIONS,
  isEmptyRequestParams,
  isGetCoverageDecorationsParams,
  isGetCoverageParams
} from './index';

describe('stable protocol contracts', () => {
  it('exposes one canonical registry for stable beta methods', () => {
    expect(PRE_CR_METHODS).toEqual({
      getProjectHealth: '$/preCr/getProjectHealth',
      runPreCrCheck: '$/preCr/runPreCrCheck',
      refreshCoverage: '$/preCr/refreshCoverage',
      getCoverageSummary: '$/preCr/getCoverageSummary',
      getCoverage: '$/preCr/getCoverage',
      getCoverageDecorations: '$/preCr/getCoverageDecorations'
    });
    expect(PRE_CR_NOTIFICATIONS.coverageChanged).toBe('$/preCr/coverageChanged');
  });

  it('rejects malformed stable request payloads', () => {
    expect(isEmptyRequestParams({})).toBe(true);
    expect(isEmptyRequestParams({ unexpected: true })).toBe(false);
    expect(isGetCoverageParams({ uri: 'file:///workspace/src/index.ts' })).toBe(true);
    expect(isGetCoverageParams({ uri: '' })).toBe(false);
    expect(isGetCoverageDecorationsParams({
      textDocument: { uri: 'file:///workspace/src/index.ts' }
    })).toBe(true);
    expect(isGetCoverageDecorationsParams({ textDocument: {} })).toBe(false);
  });
});
