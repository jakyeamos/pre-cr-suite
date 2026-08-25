import { describe, expect, it } from 'vitest';

import { runContributionProofCli } from './contributionProofCli';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);

function manifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    risk: 'medium',
    baseCommit: BASE,
    claims: [{ id: 'claim-1', statement: 'The command exposes proof status.' }],
    directObservations: [{
      claimIds: ['claim-1'],
      procedure: 'Run pre-cr proof.',
      observed: 'The command emitted a ready envelope.'
    }],
    automatedTests: [{ claimIds: ['claim-1'], command: 'pnpm test', result: 'passed' }],
    negativeControls: [],
    edgeCases: [],
    unknowns: [],
    reviewerHandoff: {
      summary: 'Review the manifest and command output.',
      focusAreas: ['Git binding'],
      reproductionSteps: ['pre-cr proof --manifest proof.json --json']
    }
  });
}

describe('runContributionProofCli', () => {
  it('reads a manifest and returns a machine-readable commit-bound envelope', async () => {
    const result = await runContributionProofCli(['--manifest', 'proof.json', '--json'], {
      cwd: '/repo',
      readManifest: async (manifestPath) => {
        expect(manifestPath).toBe('/repo/proof.json');
        return manifest();
      },
      inspectBinding: async (workspaceRoot, baseCommit) => {
        expect({ workspaceRoot, baseCommit }).toEqual({ workspaceRoot: '/repo', baseCommit: BASE });
        return {
          baseCommit: BASE,
          headCommit: HEAD,
          baseIsAncestor: true,
          clean: true,
          changedFiles: ['src/proof.ts']
        };
      }
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema: 'pre-cr-contribution-proof/v1',
      state: 'ready',
      gateDecision: 'pass',
      binding: { baseCommit: BASE, headCommit: HEAD, changedFiles: ['src/proof.ts'] }
    });
    expect(result.stderr).toBe('');
  });

  it('blocks malformed JSON without executing Git inspection', async () => {
    let inspected = false;
    const result = await runContributionProofCli(['--manifest', '-', '--json'], {
      readStdin: async () => '{',
      inspectBinding: async () => {
        inspected = true;
        throw new Error('must not run');
      }
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: 'blocked',
      gateDecision: 'block',
      gaps: [{ code: 'manifest-read-error', severity: 'block' }]
    });
    expect(inspected).toBe(false);
  });

  it('uses exit code 2 for invalid command syntax', async () => {
    const result = await runContributionProofCli(['--json']);

    expect(result).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'Usage: pre-cr proof --manifest <path|-> [--json] [--workspace <path>]\n'
    });
  });
});
