# Roadmap: pre-cr-suite-lsp

## Overview

Bootstrap roadmap for taking this brownfield repo from current-state discovery to a clean, plan-ready execution baseline.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Reconfirm Beta Contract** - Translate the current beta promise into an executable planning baseline.
- [ ] **Phase 2: Run Release Gates** - Verify build, lint, type, test, and packaging gates from a clean baseline.
- [ ] **Phase 3: Harden Cross-Editor Reliability** - Close the highest-value parity and config-hardening gaps surfaced by the release baseline.

## Phase Details

### Phase 1: Reconfirm Beta Contract
**Goal**: Translate the current beta promise into an executable planning baseline.
**Depends on**: Nothing (first phase)
**Requirements**: [PCR-01, PCR-02]
**Success Criteria** (what must be TRUE):
  1. The beta workflow is captured in project planning docs.
  2. Parity expectations across editors are explicit.
  3. The next phase can focus on release execution rather than rediscovery.
**Plans**: 2 plans

Plans:
- [ ] 01-01: Capture beta contract in planning docs
- [ ] 01-02: Record parity expectations

### Phase 2: Run Release Gates
**Goal**: Verify build, lint, type, test, and packaging gates from a clean baseline.
**Depends on**: Phase 1
**Requirements**: [PCR-03, PCR-04]
**Success Criteria** (what must be TRUE):
  1. Release gates are executed against the current repo state.
  2. Failures are explicit and actionable if anything breaks.
  3. The beta baseline is grounded in real verification.
**Plans**: 2 plans

Plans:
- [ ] 02-01: Execute release-gate checks
- [ ] 02-02: Capture and prioritize failures

### Phase 3: Harden Cross-Editor Reliability
**Goal**: Close the highest-value parity and config-hardening gaps surfaced by the release baseline.
**Depends on**: Phase 2
**Requirements**: [PCR-02, PCR-03]
**Success Criteria** (what must be TRUE):
  1. Known parity gaps are explicitly queued or resolved.
  2. Config-path behavior is more predictable.
  3. The beta can continue without hidden reliability debt.
**Plans**: 2 plans

Plans:
- [ ] 03-01: Fix top parity issues
- [ ] 03-02: Queue post-baseline hardening work

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reconfirm Beta Contract | 0/2 | Not started | - |
| 2. Run Release Gates | 0/2 | Not started | - |
| 3. Harden Cross-Editor Reliability | 0/2 | Not started | - |

### Phase 4: AIOS Format Gate Backfill
**Goal**: Clear the formatter adoption gate with a mechanical whitespace cleanup.
**Depends on**: Phase 2 release-gate baseline
**Requirements**: AIOS-FORMAT
**Success Criteria**: `node scripts/aios-adoption-gates.mjs format` exits 0.
**Plans**: 1 plan
Plans:
- [ ] 04-01: Format-check remediation

### Phase 5: AIOS Server Simplification Gates
**Goal**: Clear the coupled complexity and thermo blockers in `packages/server/src/server.ts`.
**Depends on**: Phase 4
**Requirements**: AIOS-COMPLEXITY, AIOS-THERMO
**Success Criteria**: `node scripts/aios-adoption-gates.mjs complexity` and `node scripts/aios-adoption-gates.mjs thermo` exit 0.
**Plans**: 1 plan
Plans:
- [ ] 05-01: Split server responsibilities without weakening LSP behavior

### Phase 6: AIOS Final Certification Gate
**Goal**: Refresh developer-tool adoption certification after remediation.
**Depends on**: Phase 5
**Requirements**: AIOS-CERT
**Success Criteria**: Fresh adoption docs report absent=0, warning_count=0, with non-UI classification and local CI proof explicit.
**Plans**: 1 plan
Plans:
- [ ] 06-01: Final adoption certification proof

### Phase 7: QR remediation: pre-cr-suite-lsp



**Goal:** Resolve Quality Runner findings for pre-cr-suite-lsp using cluster-oriented, behavior-preserving remediation from run qr-fleet-continue-20260704-pre-cr-suite-lsp.
**Requirements**: QR-PRE-CR-SUITE-LSP
**Depends on:** Phase 6
**Plans:** 2 plans

Plans:
- [ ] 07-01-PLAN.md - Primary QR cluster remediation
- [ ] 07-02-PLAN.md - Additional QR cluster remediation

**Cross-cutting constraints:**
- The post-remediation QR run records no unresolved regression for this plan scope.
