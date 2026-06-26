---
schemaVersion: 1
healthScore: 86
statusLabel: healthy
summary: "The headless Pre-CR CLI supports branch-aware JSON/audit behavior, emits executable-path progress to stderr, and has a clean dependency security gate."
nextStep: "Resolve the full Turbo test harness interaction with the global AIOS commit hook, then rerun final adoption certification."
blockers: []
lastUpdated: "2026-06-26"
quality:
  lint: warning
  types: pass
  tests: pass
  format: pass
  deadCode: unknown
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

- 2026-05-18: Added or expanded README coverage for project and subproject roots so workspace documentation inventory is complete.
- 2026-06-23: Added branch-aware headless CLI audit emission for blocked, warning-only, or iteration-forcing Pre-CR runs, with focused CLI test and server typecheck passing.
- 2026-06-25: Added stderr progress output for direct `pre-cr run --json` executable runs, including start, heartbeat, and finish lines while preserving clean JSON stdout.
- 2026-06-25: Cleared the dependency security audit by moving the Vitest/Vite/esbuild toolchain to patched versions and pinning patched transitive VSCE audit dependencies.
- 2026-06-26: Cleared the AIOS formatter adoption gate with a mechanical whitespace normalization pass.
- 2026-06-26: Split the LSP server request handlers out of `packages/server/src/server.ts`, clearing the AIOS complexity and thermo-nuclear simplification gates.

## Quality Ladder Notes

- 2026-06-25: `pnpm lint` passed with existing warnings in `@pre-cr/core` and `pre-cr-suite`.
- 2026-06-25: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm secret:scan`, `pnpm test:headless-beta`, and VSIX packaging smoke passed.
- 2026-06-25: `pnpm dependency:security` passed with no known vulnerabilities.
- 2026-06-25: No `knip` or `audit:dead-code` script is configured, so dead-code and structure status remain unknown.
- 2026-06-26: `node scripts/aios-adoption-gates.mjs format` and `git diff --check` pass after Phase 04 format remediation.
- 2026-06-26: `node scripts/aios-adoption-gates.mjs complexity` and `node scripts/aios-adoption-gates.mjs thermo` pass after reducing `packages/server/src/server.ts` from 1684 to 228 lines.
- 2026-06-26: `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass with pnpm 9.15.0; full `pnpm test` is blocked by temporary fixture commits invoking the user global AIOS commit hook under Turbo, while the affected `src/beta/precheck.test.ts` passes directly with isolated Git config.
