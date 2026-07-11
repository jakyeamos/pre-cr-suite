import { describe, expect, it } from 'vitest';
import type { ReadinessRemediation } from '@pre-cr/core';

import { formatReadinessLabel } from '../features/readinessModel';

const base = {
  gateDecision: null,
  scope: null,
  summary: null,
  remediation: [] as ReadinessRemediation[],
  lastRunAt: null
} as const;

describe('readiness presentation model', () => {
  it.each([
    ['idle', '$(circle-outline) Not run'],
    ['ready', '$(check) Ready'],
    ['warning', '$(warning) Warning'],
    ['blocked', '$(error) Blocked'],
    ['setup-needed', '$(tools) Setup needed']
  ] as const)('maps %s to a stable label', (state, label) => {
    expect(formatReadinessLabel({ ...base, state })).toBe(label);
  });
});
