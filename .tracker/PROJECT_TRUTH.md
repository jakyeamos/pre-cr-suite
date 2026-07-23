---
schemaVersion: 1
healthScore: 96
statusLabel: adopted_runtime_certified
summary: "The full-audit Pre-CR fold is release-ready at 0.1.0: the lockfile resolves eslint-plugin-anti-slop from the public 0.5.0 artifact, frozen clean-clone installation succeeds, and uncached lint, typecheck, 376 tests across core/server/client, builds, secret scan, dependency security, format, validation, dead-code, complexity, and VSIX packaging all pass."
nextStep: "Reconcile the immutable v0.1.0 tag with a GitHub release, verify the published @pre-cr/core and @pre-cr/server 0.1.0 consumers plus the VS Code Marketplace artifact, then decide whether the dev-only reproducibility fix warrants a new patch release before main promotion."
blockers: []
lastUpdated: "2026-07-22"
quality:
  lint: warning
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

pre-cr-suite-lsp is a coverage-first pre-PR readiness workflow for VS Code and Neovim, centered on running a pre-review coverage check, refreshing coverage overlays, and fixing setup issues from shared repo config. The repo is positioned as a public beta with a narrow, explicit promise rather than a broad tool suite, and `.planning/` now exists to drive the next release-hardening phases.

## Context

The README and `docs/ROADMAP.md` both describe the public beta scope: `Run Pre-CR Check`, `Refresh Coverage`, and `Fix Setup`, with VS Code and Neovim as first-class clients. The repo is a TypeScript monorepo whose release gates require build, lint, test, typecheck, packaging, and parity verification from a clean clone.

As of 2026-06-25, the beta gate also has a first-class headless JSON path through `pre-cr run --json`, repo-configured coverage adapters for non-JS emitters, explicit `surfaces` declarations for covered, ignored, and unsupported directories, and AIOS-compatible `.aios/audit/` artifacts when the headless gate blocks, warns, or forces iteration. Protected branches and explicit dev-environment flags block; detected unprotected feature branches warn. Direct executable runs emit start, heartbeat, and finish progress lines to stderr so JSON stdout remains machine-readable while Codex and terminals see long-running activity.

## Risks

The main risk is parity drift between clients while experimental features continue to live in-repo. The product should stay disciplined around the beta workflow until those release gates are routinely passing.

## Recent Documentation Updates

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

- 2026-06-25: `pnpm lint` passed with existing warnings in `@pre-cr/core` and `pre-cr-suite`.
- 2026-06-25: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm secret:scan`, `pnpm test:headless-beta`, and VSIX packaging smoke passed.
- 2026-06-25: `pnpm dependency:security` passed with no known vulnerabilities.
- 2026-06-25: No `knip` or `audit:dead-code` script is configured, so dead-code and structure status remain unknown.
- 2026-06-26: `node scripts/aios-adoption-gates.mjs format` and `git diff --check` pass after Phase 04 format remediation.
- 2026-06-26: `node scripts/aios-adoption-gates.mjs complexity` and `node scripts/aios-adoption-gates.mjs thermo` pass after reducing `packages/server/src/server.ts` from 1684 to 228 lines.
- 2026-06-26: `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass with pnpm 9.15.0; full `pnpm test` is blocked by temporary fixture commits invoking the user global AIOS commit hook under Turbo, while the affected `src/beta/precheck.test.ts` passes directly with isolated Git config.
- 2026-06-26: AIOS adoption doc quality for `phase29-pre-cr-suite-lsp-post-remediation-001` passes with 66 document pairs, 0 blockers, 0 warnings, and 0 absent gates; final status is adopted_but_blocked pending runtime smoke/test blockers.
- 2026-06-26: Non-UI exception accepted for final certification: this is a developer-tool/LSP repo, so no browser or visual proof is applicable.
- 2026-06-26: Anti-Slop is now the required default Pre-CR quality adapter. `corepack pnpm --filter @pre-cr/core test` passes with 215 tests, and `corepack pnpm --filter @pre-cr/core build` refreshes the local compiled runtime. `pre-cr run --json` confirms the loaded config has `qualityAdapters[0].required: true`, but still returns warning-only because the configured test command uses pnpm 11 in the Codex shell before quality adapters run.
- 2026-06-30: Focused regression coverage passes: `corepack pnpm --filter @pre-cr/core test -- src/beta/command.test.ts src/beta/precheck.test.ts` reports 8 passing tests, including Corepack routing for pinned pnpm and hook-isolated precheck fixture commits.
- 2026-06-30: Runtime gates pass from the ambient Codex shell where `pnpm --version` is 11.7.0: `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:headless-beta` all complete successfully while project scripts and headless Pre-CR commands execute through the repo-pinned pnpm 9.15.0 path.
- 2026-06-30: `pnpm lint` passes with existing warnings only: 40 warnings in `@pre-cr/core`, 67 warnings in `pre-cr-suite`, and no lint errors.
- 2026-06-30: Direct `node packages/server/dist/cli.js run --json --workspace /Users/jakyeamos/projects/pre-cr-suite-lsp` confirms the loaded headless framework command resolves to `corepack pnpm --filter pre-cr-suite test -- --coverage`; with no staged changes at the time of that check, it returned the expected no-changes warning-only result.
- 2026-07-04: `pnpm lint`, `pnpm typecheck`, and `pnpm test` passed after the README package-install documentation update; lint still reports only the existing TypeScript support warning banner from `@typescript-eslint/typescript-estree`.
- 2026-07-04: Added `fixtures/cross-client-beta-parity` and `pnpm test:beta-parity` to verify the public beta workflow across the VS Code bundled server artifact and the published `@pre-cr/server`/Neovim-style server entrypoint from the same `.pre-cr.json`. `pnpm test:beta-parity` and `pnpm test:headless-beta` pass.
- 2026-07-22: Full-audit release preparation passed on `codex/full-audit-fold-pre-cr`: frozen install resolves the public `eslint-plugin-anti-slop@0.5.0`, uncached `pnpm test` reports 376 passing tests, and build, package, security, format, validation, dead-code, and type/lint gates pass. The existing `v0.1.0` tag still needs GitHub-release and registry/Marketplace verification.

## QR Remediation Planning

- 2026-07-04: Added GSD Phase 7 for QR remediation from qr-fleet-continue-20260704-pre-cr-suite-lsp; 2 plan(s) created from pre-cr-suite-lsp.md. Execution has not started.
