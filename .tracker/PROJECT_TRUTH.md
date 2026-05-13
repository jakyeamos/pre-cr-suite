---
schemaVersion: 1
healthScore: 79
nextStep: "Run full release gates from the headless CLI branch, then verify VS Code and Neovim parity against the expanded .pre-cr.json contract."
blockers: []
lastUpdated: "2026-05-13"
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

As of 2026-05-13, the beta gate also has a first-class headless JSON path through `pre-cr run --json`, repo-configured coverage adapters for non-JS emitters, and explicit `surfaces` declarations for covered, ignored, and unsupported directories.

## Risks

The main risk is parity drift between clients while experimental features continue to live in-repo. The product should stay disciplined around the beta workflow until those release gates are routinely passing.
