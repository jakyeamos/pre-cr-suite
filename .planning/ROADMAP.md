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
