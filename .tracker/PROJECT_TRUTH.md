---
schemaVersion: 1
healthScore: 96
statusLabel: modernization_m6_in_progress
summary: "M0 made installs and release checks reproducible. M1 hardened process, trust, containment, Git, and changed-line coverage. M2 added the stable contract/session boundary. M3 unified CLI, hooks, published server, and VSIX. M4/M5 route workspace-scoped readiness with explicit scope, warning states, stale-coverage cleanup, durable VS Code/Neovim recovery, and Neovim headless acceptance coverage. Restricted VS Code mode keeps readiness controls available until trust is granted, security diagnostics have one server owner, legacy VS Code/server tools are opt-in behind explicit experimental settings, activation lifecycle coverage proves stable startup and recovery boundaries, legacy core helpers are isolated behind an explicit experimental package entrypoint, and the standalone server artifact now starts in a real VS Code host smoke (commit dee6aa5)."
nextStep: "Add end-to-end VS Code host assertions for Setup → Run → Diagnose → Fix → Rerun, then decide whether the isolated legacy core package should be removed or separately versioned."
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

- 2026-07-11: Isolated legacy server request registration behind `initializationOptions.experimental.enabled`, matching the VS Code opt-in setting; committed as `376d17e`.
- 2026-07-11: Added VS Code activation lifecycle coverage for stable startup, persisted readiness recovery, experimental opt-in, configuration reload, and restricted-mode setup/trust behavior.
- 2026-07-11: Isolated checklist/docs/review/context/debug helpers behind `@pre-cr/core/experimental`; stable root exports and server imports now have regression coverage in `f8a299e`.
- 2026-07-11: Added package `typesVersions` coverage for the experimental subpath so the server resolves the isolated entrypoint under the repository's CommonJS TypeScript settings; committed as `dee6aa5`.
- 2026-07-12: Bundled runtime dependencies into the published server artifact, added a real VS Code development-host smoke, and moved its caches outside the repository.
- 2026-07-11: Started M6 by gating legacy VS Code checklist/docs/review/context/debug/dashboard tools behind `preCr.experimental.enabled` (default false), with manifest regression tests; committed as `a207de6`.
- 2026-07-11: Added a server request regression test proving security diagnostics are published through the LSP connection; committed as `e2a5185`.
- 2026-07-11: Moved experimental security diagnostics to the server publisher and made VS Code navigation consume server diagnostics; committed as `4417a80`.
- 2026-07-11: Kept VS Code readiness view, status, and trust guidance available in Restricted Mode with safe command stubs; committed as `990a503`.
- 2026-07-11: Committed cross-client readiness hardening as `fa39418`: workspace-scoped stable requests, explicit staged/worktree scope, warning-state parity, stale coverage cleanup, per-root Neovim state, and a Neovim readiness smoke script.
- 2026-07-11: Recorded M3 completion after adding CLI scope/state/remediation, hook readiness envelopes, package export maps, and published-to-VSIX server artifact identity checks.
- 2026-07-11: Started M4 with persisted VS Code readiness state, status/view presentation, and server-owned coverage diagnostics; focused client tests pass.
- 2026-07-11: Started M5 with Neovim persisted readiness, recovery buffer, shared labels, and default keymap behavior; headless Lua load/setup checks pass.
- 2026-07-11: Committed the M5 Neovim recovery slice as `256868e`; Lua load/setup checks pass alongside the TypeScript gates.
- 2026-07-11: Preserved warning-state envelopes through hook policy handling in `c64f701`; focused CLI/hook tests pass.
- 2026-07-11: Hardened Neovim LSP error rendering so string and structured errors produce safe recovery messages; headless setup check passes.
- 2026-07-11: Committed Neovim error normalization as `6599fa7`; focused server and headless checks pass.
- 2026-07-11: Committed the M4 readiness slice as `ef58bfd`; client state/presentation tests and package typechecks pass.
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
