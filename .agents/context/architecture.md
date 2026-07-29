---
id: pre-cr-suite-lsp.architecture
last_reviewed: 2026-07-28
---

# Architecture and boundaries

- `packages/core`: config loading, coverage formats, changed-line analysis,
  gate decisions, and shared protocol types.
- `packages/server`: CLI and LSP server; it calls the core pipeline and owns
  command-only hook management.
- `packages/vscode-client`: editor UI and bundled server integration.
- `packages/neovim-client`: client-side command and setup surface.
- `fixtures/`: deterministic beta and headless parity fixtures.
- `scripts/`: smoke tests, security checks, and release helpers.

Keep core behavior editor-neutral. A client may present results but must not
invent a different gate decision. Published server artifacts must not depend on
workspace source paths.
