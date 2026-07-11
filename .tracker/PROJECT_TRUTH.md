---
schemaVersion: 1
healthScore: 92
statusLabel: modernization_m4_in_progress
summary: "M0 made installs and release checks reproducible. M1 hardened process, trust, containment, Git, and changed-line coverage. M2 added the stable contract/session boundary. M3 now gives CLI, hooks, published server, and VSIX one readiness envelope and one server artifact (commit c075a88)."
nextStep: "Start M4 by rebuilding the VS Code experience around the readiness result while preserving documented beta command aliases."
blockers: []
lastUpdated: "2026-07-11"
quality:
  lint: pass
  types: pass
  tests: pass
  format: pass
  deadCode: pass
  structure: pass
  security: pass
tags:
  - lsp
  - vscode
  - neovim
  - coverage
  - typescript
---

## Summary

pre-cr-suite-lsp is a coverage-first pre-PR readiness workflow for VS Code,
Neovim, and a headless CLI. The public beta should center one repo-configured
loop—Setup → Run → Diagnose → Fix → Rerun—rather than the current broad legacy
tool suite. `docs/modernization/` records the evidence-backed v2 target and
vertical execution plan.

## Context

The README and `docs/ROADMAP.md` describe the public beta scope: `Run Pre-CR
Check`, `Refresh Coverage`, and `Fix Setup`, with VS Code and Neovim as
first-class clients. The repo is a TypeScript monorepo whose verified local gates
include build, lint, typecheck, the full package test suites, headless smoke,
server-artifact parity smoke, packaging, formatting, complexity, secret, and
dependency checks.

M0 removed the developer-local install dependency and proves a fresh local clone
installs with Corepack pnpm 11.7.0. M1 moved trust, path, process, Git, and
coverage ownership into shared primitives and verified both editor boundaries.
The remaining work is architectural consolidation and client workflow migration.

## Risks

The primary risks are legacy experimental surface area, duplicate server/runtime
ownership, and incomplete end-to-end client workflow proof. M2–M3 address the
engine and contract shape before the larger UI migration.

## Recent Documentation Updates

- 2026-07-11: Recorded M3 completion after adding CLI scope/state/remediation, hook readiness envelopes, package export maps, and published-to-VSIX server artifact identity checks.
- 2026-07-11: Committed M3 implementation as `c075a88`; serialized pre-pr, artifact, smoke, and packaging gates pass.
- 2026-07-11: Recorded M2 completion after adding the stable contract registry, runtime request guards, canonical workspace sessions, nested-workspace coverage routing, and client method migration.
- 2026-07-11: Committed M2 implementation as `1d0430e`; serialized pre-pr and all beta/package quality gates pass.
- 2026-07-11: Recorded M1 completion and the M2 starting point after trusted execution, containment, bounded process, Git attribution, and coverage hardening.
- 2026-07-10: Added `docs/modernization/AUDIT.md`, `TARGET.md`, `EXEC_PLAN.md`, and `PROGRESS.md` for the protected v2 modernization phase.
- 2026-07-10: Updated modernization progress after M0 made clean installs and release checks reproducible.
- 2026-07-04: Clarified README quick start around the published `@pre-cr/core` and `@pre-cr/server` npm packages, with VS Code Marketplace installs still pending verification.
- 2026-06-30: Removed the stale generated-index skip entry from the AIOS adoption gate scanner; `node --check scripts/aios-adoption-gates.mjs` passes.
- 2026-05-18: Added or expanded README coverage for project and subproject roots so workspace documentation inventory is complete.
- 2026-06-23: Added branch-aware headless CLI audit emission for blocked, warning-only, or iteration-forcing Pre-CR runs, with focused CLI test and server typecheck passing.
- 2026-06-25: Added stderr progress output for direct `pre-cr run --json` executable runs, including start, heartbeat, and finish lines while preserving clean JSON stdout.
- 2026-06-25: Cleared the dependency security audit by moving the Vitest/Vite/esbuild toolchain to patched versions and pinning patched transitive VSCE audit dependencies.
- 2026-06-26: Cleared the AIOS formatter adoption gate with a mechanical whitespace normalization pass.
- 2026-06-26: Split the LSP server request handlers out of `packages/server/src/server.ts`, clearing the AIOS complexity and thermo-nuclear simplification gates.
- 2026-06-30: Cleared the two runtime certification blockers by routing configured pnpm commands through Corepack when `packageManager` pins pnpm, running Turbo behind a pinned pnpm shim, and isolating temporary fixture Git commits from user-global hooks.

## Quality Ladder Notes

- 2026-06-30: Runtime gates pass with the repository-pinned pnpm path; focused precheck and hook-isolated fixture tests pass.
- 2026-07-04: Cross-client beta parity smoke passes for bundled and published server artifacts.
- 2026-07-10: Full local baseline and M0 reproducibility proof pass; CI separates compatibility from Node 20.18.1 release checks.
- 2026-07-11: `pnpm pre-pr`, full tests/typecheck/lint/build, headless smoke, parity smoke, VSIX packaging, format, complexity, dead-code, secret, and dependency checks pass after M1.
- 2026-07-11: Core, server, and VS Code tests/typechecks/lints pass after M2; new contract and nested-workspace session tests pass.
- 2026-07-11: Serialized `pnpm pre-pr`, headless and parity smoke, artifact hash check, package export/build, VSIX packaging, format, complexity, dead-code, secret, and dependency checks pass after M3.

## QR Remediation Planning

- 2026-07-04: Added GSD Phase 7 for QR remediation from qr-fleet-continue-20260704-pre-cr-suite-lsp; 2 plan(s) created from pre-cr-suite-lsp.md. Execution has not started.
