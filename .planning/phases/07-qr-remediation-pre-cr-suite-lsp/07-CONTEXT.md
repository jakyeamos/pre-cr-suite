# Phase 7: QR remediation: pre-cr-suite-lsp - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning
**Source:** PRD Express Path (/Users/jakyeamos/.local/state/quality-runner/fleet/per-repo-summaries-20260704/pre-cr-suite-lsp.md)

<domain>
## Phase Boundary

Plan the remediation work for pre-cr-suite-lsp from Quality Runner run qr-fleet-continue-20260704-pre-cr-suite-lsp.
This phase is planning-only until execute-phase runs. Quality Runner remains advisory-only: it identifies findings, remediation clusters, and verification suggestions, but all source changes happen in /Users/jakyeamos/projects/pre-cr-suite-lsp.

Findings: 19
Severity: `blocker` 1, `observation` 5, `warning` 13
Categories: `capability` 2, `structural:deduplicate` 1, `structural:harden` 7, `structural:improve-tests` 2, `structural:ponytail` 3, `structural:simplify` 3, `structural:speed` 1
Fleet phase candidate: Phase 3 - Mixed Medium Repos
Requirement: QR-PRE-CR-SUITE-LSP

</domain>

<decisions>
## Implementation Decisions

### D-01 - QR summary is the planning source
- Use /Users/jakyeamos/.local/state/quality-runner/fleet/per-repo-summaries-20260704/pre-cr-suite-lsp.md and the artifacts under /Users/jakyeamos/projects/pre-cr-suite-lsp/.quality-runner/runs/qr-fleet-continue-20260704-pre-cr-suite-lsp as the source of truth for this remediation phase.

### D-02 - Cluster-oriented remediation
- Plan and execute coherent remediation batches by QR cluster, not one isolated edit per finding row.

### D-03 - Behavior preservation
- Prefer behavior-preserving refactors, hardening, and simplification. Do not change product behavior unless a QR hardening cluster explicitly requires safer behavior.

### D-04 - Existing project conventions first
- Read the target files and local manifests before editing. Follow existing package-manager, formatter, test, and architecture conventions. Use pnpm for JavaScript package scripts.

### D-05 - Evidence-backed closure
- A cluster is done only when focused repo verification passes and a post-remediation QR run shows the fingerprints cleared or are dispositioned with evidence.

### Claude's Discretion
- Choose exact helper extraction boundaries, naming, and task order when the QR document identifies the finding but not the implementation shape.
- If a cluster turns out to require product, API, or design decisions, stop that cluster and capture the question instead of guessing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Quality Runner Inputs
- `/Users/jakyeamos/.local/state/quality-runner/fleet/per-repo-summaries-20260704/pre-cr-suite-lsp.md` - Per-repo QR summary used as this phase PRD.
- `/Users/jakyeamos/projects/pre-cr-suite-lsp/.quality-runner/runs/qr-fleet-continue-20260704-pre-cr-suite-lsp/quality-audit.json` - Quality audit report.
- `/Users/jakyeamos/projects/pre-cr-suite-lsp/.quality-runner/runs/qr-fleet-continue-20260704-pre-cr-suite-lsp/remediation-plan.json` - QR remediation plan.
- `/Users/jakyeamos/projects/pre-cr-suite-lsp/.quality-runner/runs/qr-fleet-continue-20260704-pre-cr-suite-lsp/code-quality-scan.json` - Code-quality scan fingerprints.
- `/Users/jakyeamos/projects/pre-cr-suite-lsp/.quality-runner/runs/qr-fleet-continue-20260704-pre-cr-suite-lsp/resolution-ledger.md` - Resolution ledger for closure evidence.
- `/Users/jakyeamos/projects/pre-cr-suite-lsp/.quality-runner/runs/qr-fleet-continue-20260704-pre-cr-suite-lsp/agent-handoff.md` - QR agent handoff.

</canonical_refs>

<specifics>
## Top Findings

- `missing-formatter` blocker capability: Required quality capability is missing: formatter. Fix: Add a formatter command such as pnpm format. Evidence: Capability map lists formatter as missing.; Missing command capability evidence: no quality command found for formatter.
- `structural-simplify-deep-nesting` warning structural:simplify: 381 deep-nesting structural findings in simplification and shrink pass. Fix: 381 findings, aggregate score 2286: Flatten guard clauses, extract decision helpers, or split rendering branches. Evidence: packages/core/src/beta/command.ts:32: deep-nesting; packages/core/src/beta/command.ts:46: deep-nesting; packages/core/src/beta/git.ts:106: deep-nesting
- `structural-harden-explicit-any` warning structural:harden: 28 explicit-any structural findings in API hardening and type safety. Fix: 28 findings, aggregate score 252: Replace `any` with a narrow local type, generic constraint, or existing contract. Evidence: packages/server/src/cli.test.ts:327: explicit-any; packages/server/src/hooks/rules.test.ts:20: explicit-any; packages/server/src/hooks/rules.test.ts:80: explicit-any
- `structural-simplify-nested-ternary` warning structural:simplify: 18 nested-ternary structural findings in simplification and shrink pass. Fix: 18 findings, aggregate score 162: Replace nested ternaries with named branches or helpers. Evidence: packages/core/src/docgen/extractorAST.ts:370: nested-ternary; packages/server/src/beta/coverageController.ts:252: nested-ternary; packages/server/src/cli.ts:189: nested-ternary
- `structural-improve-tests-weak-test-assertion` warning structural:improve-tests: 13 weak-test-assertion structural findings in tests, E2E, scripts, CI cleanup. Fix: 13 findings, aggregate score 117: Assert behavior, payload shape, or state transition. Evidence: packages/vscode-client/src/__tests__/logger.test.ts:51: weak-test-assertion; packages/vscode-client/src/__tests__/logger.test.ts:59: weak-test-assertion; packages/vscode-client/src/__tests__/logger.test.ts:66: weak-test-assertion
- `structural-simplify-large-source-file` warning structural:simplify: 13 large-source-file structural findings in simplification and shrink pass. Fix: 13 findings, aggregate score 117: Split mixed responsibilities into focused modules. Evidence: packages/core/src/beta/precheck.ts:1: large-source-file; packages/core/src/context/snapshot.ts:1: large-source-file; packages/core/src/debug/capture.ts:1: large-source-file
- `structural-speed-await-in-loop` warning structural:speed: 16 await-in-loop structural findings in performance and batching improvements. Fix: 16 findings, aggregate score 96: Batch independent work or document required sequencing. Evidence: packages/core/src/beta/git.ts:110: await-in-loop; packages/core/src/beta/precheck.ts:140: await-in-loop; packages/core/src/beta/precheck.ts:165: await-in-loop
- `structural-harden-eval-user-code` warning structural:harden: 5 eval-user-code structural findings in API hardening and type safety. Fix: 5 findings, aggregate score 45: Replace dynamic code execution with explicit parsing or dispatch. Evidence: packages/core/src/checklist/security.test.ts:131: eval-user-code; packages/core/src/checklist/security.test.ts:227: eval-user-code; packages/core/src/checklist/security.ts:154: eval-user-code

## Remediation Clusters

1. remediate-structural-packages-core-src-docgen-extractor-ts (medium, score 237) - Remediate structural cluster in packages/core/src/docgen/extractor.ts
2. remediate-structural-packages-core-src-checklist-security-ts (medium, score 216) - Remediate structural cluster in packages/core/src/checklist/security.ts
3. remediate-structural-packages-core-src-docgen-extractorast-ts (medium, score 180) - Remediate structural cluster in packages/core/src/docgen/extractorAST.ts
4. remediate-structural-packages-vscode-client-src-tests-vscode-mock-ts (medium, score 162) - Remediate structural cluster in packages/vscode-client/src/__tests__/vscode.mock.ts
5. remediate-structural-packages-core-src-parsers-lcovstreaming-ts (medium, score 132) - Remediate structural cluster in packages/core/src/parsers/lcovStreaming.ts

</specifics>

<deferred>
## Deferred Ideas

- Broad rewrites outside the QR clusters.
- Running Quality Runner as an executor or letting QR mutate source code.
- Remediating repos outside pre-cr-suite-lsp; each repo gets its own GSD phase.

</deferred>

---

*Phase: 7*
*Context gathered: 2026-07-04 via QR per-repo PRD*
