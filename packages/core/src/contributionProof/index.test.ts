import { describe, expect, it } from 'vitest';

import {
  evaluateContributionProof,
  type ContributionProofBinding,
  type ContributionProofInput
} from './index';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);

function binding(overrides: Partial<ContributionProofBinding> = {}): ContributionProofBinding {
  return {
    baseCommit: BASE,
    headCommit: HEAD,
    baseIsAncestor: true,
    clean: true,
    changedFiles: ['src/change.ts'],
    ...overrides
  };
}

function manifest(
  risk: ContributionProofInput['risk'] = 'high',
  overrides: Partial<ContributionProofInput> = {}
): ContributionProofInput {
  return {
    schemaVersion: 1,
    risk,
    baseCommit: BASE,
    claims: [{ id: 'claim-1', statement: 'The changed behavior is observable.' }],
    directObservations: [{
      claimIds: ['claim-1'],
      procedure: 'Run the public command.',
      observed: 'The command reports the changed behavior.'
    }],
    automatedTests: [{
      claimIds: ['claim-1'],
      command: 'pnpm test',
      result: 'passed'
    }],
    negativeControls: [{
      claimIds: ['claim-1'],
      method: 'mutation',
      change: 'Invert the expected decision.',
      expectedFailure: 'The focused test fails.',
      observedFailure: 'The focused test failed on the mutated decision.'
    }],
    edgeCases: [{
      claimIds: ['claim-1'],
      case: 'The evidence list is empty.',
      expected: 'The proof blocks.',
      observed: 'The proof reported a missing-evidence block.'
    }],
    unknowns: [],
    reviewerHandoff: {
      summary: 'Review the evidence policy and Git binding.',
      focusAreas: ['Risk-tier requirements'],
      reproductionSteps: ['pnpm test']
    },
    ...overrides
  };
}

describe('evaluateContributionProof', () => {
  it('passes a high-risk proof only when each claim has all four evidence classes', () => {
    const result = evaluateContributionProof(manifest(), binding());

    expect(result).toMatchObject({
      schema: 'pre-cr-contribution-proof/v1',
      state: 'ready',
      gateDecision: 'pass',
      readOnly: true,
      executionAuthority: false
    });
    expect(result.claims[0]?.coverage).toEqual({
      directObservation: 1,
      automatedTest: 1,
      negativeControl: 1,
      edgeCase: 1
    });
  });

  it('blocks high-risk claims when a test fails or falsification evidence is absent', () => {
    const candidate = manifest('high', {
      automatedTests: [{ claimIds: ['claim-1'], command: 'pnpm test', result: 'failed' }],
      negativeControls: [],
      edgeCases: []
    });

    const result = evaluateContributionProof(candidate, binding());

    expect(result.gateDecision).toBe('block');
    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      'missing-automated-test',
      'missing-negative-control',
      'missing-edge-case'
    ]));
  });

  it('warns but does not block low-risk proof without cheap secondary evidence', () => {
    const candidate = manifest('low', { negativeControls: [], edgeCases: [] });

    const result = evaluateContributionProof(candidate, binding());

    expect(result).toMatchObject({ state: 'warning', gateDecision: 'warn' });
    expect(result.gaps.every((gap) => gap.severity === 'warning')).toBe(true);
  });

  it('binds the proof to a clean, non-empty descendant diff', () => {
    const result = evaluateContributionProof(manifest(), binding({
      baseIsAncestor: false,
      clean: false,
      changedFiles: []
    }));

    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      'base-not-ancestor',
      'dirty-worktree',
      'empty-diff'
    ]));
  });

  it('blocks unknown claim references and blocking unknowns', () => {
    const candidate = manifest('medium', {
      directObservations: [{
        claimIds: ['missing-claim'],
        procedure: 'Run a command.',
        observed: 'Observed output.'
      }],
      unknowns: [{
        summary: 'Cross-platform behavior is unverified',
        impact: 'The claim may not hold on Windows.',
        disposition: 'blocking'
      }]
    });

    const result = evaluateContributionProof(candidate, binding());

    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining([
      'unknown-claim-reference',
      'blocking-unknown'
    ]));
  });
});
