export type ContributionProofRisk = 'low' | 'medium' | 'high';
export type ContributionProofState = 'ready' | 'warning' | 'blocked';
export type ContributionProofDecision = 'pass' | 'warn' | 'block';
export type ContributionProofGapSeverity = 'warning' | 'block';

export interface ContributionProofClaim {
  id: string;
  statement: string;
}

export interface ContributionProofEvidence {
  claimIds: string[];
  artifact?: string;
}

export interface ContributionProofDirectObservation extends ContributionProofEvidence {
  procedure: string;
  observed: string;
}

export interface ContributionProofAutomatedTest extends ContributionProofEvidence {
  command: string;
  result: 'passed' | 'failed';
}

export interface ContributionProofNegativeControl extends ContributionProofEvidence {
  method: 'revert' | 'mutation' | 'fault-injection' | 'other';
  change: string;
  expectedFailure: string;
  observedFailure: string;
}

export interface ContributionProofEdgeCase extends ContributionProofEvidence {
  case: string;
  expected: string;
  observed: string;
}

export interface ContributionProofUnknown {
  summary: string;
  impact: string;
  disposition: 'accepted' | 'blocking';
}

export interface ContributionProofReviewerHandoff {
  summary: string;
  focusAreas: string[];
  reproductionSteps: string[];
}

export interface ContributionProofInput {
  schemaVersion: 1;
  risk: ContributionProofRisk;
  baseCommit: string;
  claims: ContributionProofClaim[];
  directObservations: ContributionProofDirectObservation[];
  automatedTests: ContributionProofAutomatedTest[];
  negativeControls: ContributionProofNegativeControl[];
  edgeCases: ContributionProofEdgeCase[];
  unknowns: ContributionProofUnknown[];
  reviewerHandoff: ContributionProofReviewerHandoff;
}

export interface ContributionProofBinding {
  baseCommit: string;
  headCommit: string;
  baseIsAncestor: boolean;
  clean: boolean;
  changedFiles: string[];
  error?: string;
}

export interface ContributionProofGap {
  code: string;
  severity: ContributionProofGapSeverity;
  message: string;
  claimId?: string;
}

export interface ContributionProofClaimCoverage {
  id: string;
  statement: string;
  coverage: {
    directObservation: number;
    automatedTest: number;
    negativeControl: number;
    edgeCase: number;
  };
}

export interface ContributionProofEnvelope {
  schemaVersion: 1;
  schema: 'pre-cr-contribution-proof/v1';
  state: ContributionProofState;
  gateDecision: ContributionProofDecision;
  risk: ContributionProofRisk | null;
  readOnly: true;
  executionAuthority: false;
  binding: ContributionProofBinding;
  claims: ContributionProofClaimCoverage[];
  evidenceSummary: {
    directObservations: number;
    automatedTests: number;
    negativeControls: number;
    edgeCases: number;
  };
  unknowns: ContributionProofUnknown[];
  reviewerHandoff: ContributionProofReviewerHandoff | null;
  gaps: ContributionProofGap[];
}

export function evaluateContributionProof(
  candidate: unknown,
  binding: ContributionProofBinding
): ContributionProofEnvelope {
  const validation = validateInput(candidate);
  if (!validation.input) {
    return buildEnvelope(null, binding, validation.gaps);
  }

  const input = validation.input;
  const gaps = [...validation.gaps, ...validateBinding(input, binding)];
  const claimIds = new Set(input.claims.map((claim) => claim.id));
  const evidenceGroups = [
    input.directObservations,
    input.automatedTests,
    input.negativeControls,
    input.edgeCases
  ];

  for (const group of evidenceGroups) {
    for (const evidence of group) {
      for (const claimId of evidence.claimIds) {
        if (!claimIds.has(claimId)) {
          gaps.push({
            code: 'unknown-claim-reference',
            severity: 'block',
            message: `Evidence references unknown claim "${claimId}".`,
            claimId
          });
        }
      }
    }
  }

  const claims = input.claims.map((claim) => ({
    id: claim.id,
    statement: claim.statement,
    coverage: {
      directObservation: countCoverage(input.directObservations, claim.id),
      automatedTest: countCoverage(input.automatedTests, claim.id, (evidence) => evidence.result === 'passed'),
      negativeControl: countCoverage(input.negativeControls, claim.id),
      edgeCase: countCoverage(input.edgeCases, claim.id)
    }
  }));

  for (const claim of claims) {
    applyRiskPolicy(input.risk, claim, gaps);
  }

  if (input.risk === 'low') {
    if (input.negativeControls.length === 0) {
      gaps.push({
        code: 'negative-control-recommended',
        severity: 'warning',
        message: 'Low-risk proof has no negative control; add one when a cheap falsification is available.'
      });
    }
    if (input.edgeCases.length === 0) {
      gaps.push({
        code: 'edge-case-recommended',
        severity: 'warning',
        message: 'Low-risk proof has no edge-case observation.'
      });
    }
  }

  for (const unknown of input.unknowns) {
    gaps.push({
      code: unknown.disposition === 'blocking' ? 'blocking-unknown' : 'accepted-unknown',
      severity: unknown.disposition === 'blocking' ? 'block' : 'warning',
      message: `${unknown.summary}: ${unknown.impact}`
    });
  }

  return buildEnvelope(input, binding, gaps, claims);
}

function applyRiskPolicy(
  risk: ContributionProofRisk,
  claim: ContributionProofClaimCoverage,
  gaps: ContributionProofGap[]
): void {
  const coverage = claim.coverage;
  if (risk === 'low') {
    if (coverage.directObservation + coverage.automatedTest === 0) {
      addMissingGap(gaps, claim.id, 'primary-evidence', 'a passed automated test or direct observation');
    }
    return;
  }

  requireCoverage(gaps, claim.id, 'direct-observation', coverage.directObservation, 'a direct observation');
  requireCoverage(gaps, claim.id, 'automated-test', coverage.automatedTest, 'a passed automated test');

  if (risk === 'high') {
    requireCoverage(gaps, claim.id, 'negative-control', coverage.negativeControl, 'a negative control');
    requireCoverage(gaps, claim.id, 'edge-case', coverage.edgeCase, 'an edge-case observation');
  }
}

function requireCoverage(
  gaps: ContributionProofGap[],
  claimId: string,
  code: string,
  count: number,
  description: string
): void {
  if (count === 0) {
    addMissingGap(gaps, claimId, code, description);
  }
}

function addMissingGap(
  gaps: ContributionProofGap[],
  claimId: string,
  code: string,
  description: string
): void {
  gaps.push({
    code: `missing-${code}`,
    severity: 'block',
    message: `Claim "${claimId}" requires ${description}.`,
    claimId
  });
}

function countCoverage<T extends ContributionProofEvidence>(
  evidence: T[],
  claimId: string,
  predicate: (item: T) => boolean = () => true
): number {
  return evidence.filter((item) => item.claimIds.includes(claimId) && predicate(item)).length;
}

function validateBinding(
  input: ContributionProofInput,
  binding: ContributionProofBinding
): ContributionProofGap[] {
  const gaps: ContributionProofGap[] = [];
  if (binding.error) {
    gaps.push({ code: 'git-binding-error', severity: 'block', message: binding.error });
  }
  if (input.baseCommit !== binding.baseCommit) {
    gaps.push({
      code: 'base-commit-mismatch',
      severity: 'block',
      message: `Manifest base ${input.baseCommit} does not match resolved base ${binding.baseCommit}.`
    });
  }
  if (!binding.baseIsAncestor) {
    gaps.push({
      code: 'base-not-ancestor',
      severity: 'block',
      message: 'The declared base commit is not an ancestor of HEAD.'
    });
  }
  if (!binding.clean) {
    gaps.push({
      code: 'dirty-worktree',
      severity: 'block',
      message: 'Commit-bound proof requires a clean worktree.'
    });
  }
  if (binding.changedFiles.length === 0) {
    gaps.push({
      code: 'empty-diff',
      severity: 'block',
      message: 'The declared base and HEAD do not contain a changed file.'
    });
  }
  return gaps;
}

function validateInput(candidate: unknown): {
  input: ContributionProofInput | null;
  gaps: ContributionProofGap[];
} {
  const gaps: ContributionProofGap[] = [];
  if (!isRecord(candidate)) {
    return {
      input: null,
      gaps: [{ code: 'invalid-manifest', severity: 'block', message: 'Manifest must be a JSON object.' }]
    };
  }

  const risk = candidate.risk;
  const baseCommit = candidate.baseCommit;
  const claims = candidate.claims;
  const directObservations = candidate.directObservations;
  const automatedTests = candidate.automatedTests;
  const negativeControls = candidate.negativeControls;
  const edgeCases = candidate.edgeCases;
  const unknowns = candidate.unknowns;
  const reviewerHandoff = candidate.reviewerHandoff;

  if (candidate.schemaVersion !== 1) {
    gaps.push({ code: 'invalid-schema-version', severity: 'block', message: 'schemaVersion must be 1.' });
  }
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high') {
    gaps.push({ code: 'invalid-risk', severity: 'block', message: 'risk must be low, medium, or high.' });
  }
  if (!isFullCommit(baseCommit)) {
    gaps.push({ code: 'invalid-base-commit', severity: 'block', message: 'baseCommit must be a full 40-character Git commit.' });
  }
  if (!isArrayOf(claims, isClaim) || claims.length === 0) {
    gaps.push({ code: 'invalid-claims', severity: 'block', message: 'claims must contain at least one unique id and statement.' });
  } else if (new Set(claims.map((claim) => claim.id)).size !== claims.length) {
    gaps.push({ code: 'duplicate-claim-id', severity: 'block', message: 'Claim ids must be unique.' });
  }
  if (!isArrayOf(directObservations, isDirectObservation)) {
    gaps.push({ code: 'invalid-direct-observations', severity: 'block', message: 'directObservations must be a valid array.' });
  }
  if (!isArrayOf(automatedTests, isAutomatedTest)) {
    gaps.push({ code: 'invalid-automated-tests', severity: 'block', message: 'automatedTests must be a valid array.' });
  }
  if (!isArrayOf(negativeControls, isNegativeControl)) {
    gaps.push({ code: 'invalid-negative-controls', severity: 'block', message: 'negativeControls must be a valid array.' });
  }
  if (!isArrayOf(edgeCases, isEdgeCase)) {
    gaps.push({ code: 'invalid-edge-cases', severity: 'block', message: 'edgeCases must be a valid array.' });
  }
  if (!isArrayOf(unknowns, isUnknown)) {
    gaps.push({ code: 'invalid-unknowns', severity: 'block', message: 'unknowns must be a valid array, including when empty.' });
  }
  if (!isReviewerHandoff(reviewerHandoff)) {
    gaps.push({ code: 'invalid-reviewer-handoff', severity: 'block', message: 'reviewerHandoff requires a summary, focusAreas, and reproductionSteps.' });
  }

  if (gaps.length > 0) {
    return { input: null, gaps };
  }

  return { input: candidate as unknown as ContributionProofInput, gaps };
}

function buildEnvelope(
  input: ContributionProofInput | null,
  binding: ContributionProofBinding,
  gaps: ContributionProofGap[],
  claims: ContributionProofClaimCoverage[] = []
): ContributionProofEnvelope {
  const hasBlock = gaps.some((gap) => gap.severity === 'block');
  const hasWarning = gaps.some((gap) => gap.severity === 'warning');
  return {
    schemaVersion: 1,
    schema: 'pre-cr-contribution-proof/v1',
    state: hasBlock ? 'blocked' : hasWarning ? 'warning' : 'ready',
    gateDecision: hasBlock ? 'block' : hasWarning ? 'warn' : 'pass',
    risk: input?.risk ?? null,
    readOnly: true,
    executionAuthority: false,
    binding,
    claims,
    evidenceSummary: {
      directObservations: input?.directObservations.length ?? 0,
      automatedTests: input?.automatedTests.length ?? 0,
      negativeControls: input?.negativeControls.length ?? 0,
      edgeCases: input?.edgeCases.length ?? 0
    },
    unknowns: input?.unknowns ?? [],
    reviewerHandoff: input?.reviewerHandoff ?? null,
    gaps
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isFullCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

function isEvidence(value: unknown): value is ContributionProofEvidence {
  return isRecord(value) && isStringArray(value.claimIds) && value.claimIds.length > 0
    && (value.artifact === undefined || isNonEmptyString(value.artifact));
}

function isClaim(value: unknown): value is ContributionProofClaim {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.statement);
}

function isDirectObservation(value: unknown): value is ContributionProofDirectObservation {
  return isRecord(value) && isEvidence(value)
    && isNonEmptyString(value['procedure']) && isNonEmptyString(value['observed']);
}

function isAutomatedTest(value: unknown): value is ContributionProofAutomatedTest {
  return isRecord(value) && isEvidence(value) && isNonEmptyString(value['command'])
    && (value['result'] === 'passed' || value['result'] === 'failed');
}

function isNegativeControl(value: unknown): value is ContributionProofNegativeControl {
  return isRecord(value) && isEvidence(value)
    && (value['method'] === 'revert' || value['method'] === 'mutation' || value['method'] === 'fault-injection' || value['method'] === 'other')
    && isNonEmptyString(value['change'])
    && isNonEmptyString(value['expectedFailure'])
    && isNonEmptyString(value['observedFailure']);
}

function isEdgeCase(value: unknown): value is ContributionProofEdgeCase {
  return isRecord(value) && isEvidence(value) && isNonEmptyString(value['case'])
    && isNonEmptyString(value['expected']) && isNonEmptyString(value['observed']);
}

function isUnknown(value: unknown): value is ContributionProofUnknown {
  return isRecord(value) && isNonEmptyString(value.summary) && isNonEmptyString(value.impact)
    && (value.disposition === 'accepted' || value.disposition === 'blocking');
}

function isReviewerHandoff(value: unknown): value is ContributionProofReviewerHandoff {
  return isRecord(value) && isNonEmptyString(value.summary)
    && isStringArray(value.focusAreas) && value.focusAreas.length > 0
    && isStringArray(value.reproductionSteps) && value.reproductionSteps.length > 0;
}
