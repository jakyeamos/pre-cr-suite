---
id: pre-cr-suite-lsp.failure-modes
last_reviewed: 2026-07-28
---

# Common failure modes

- Running ambient `pnpm` can select the wrong version; use Corepack.
- A missing or stale coverage file is not a passing coverage result.
- A fixture Git command may invoke user-global hooks; isolate fixture Git
  config and never change the user's global hooks.
- Client parity can appear green while using different server artifacts; run
  both beta smoke tests after server or packaging changes.
- A missing anti-slop or security adapter is a gate failure unless the repo
  explicitly documents and validates a replacement.
- Ignored `dist`, coverage, and `.aios` files are generated evidence, not
  source to edit manually.
- The strict compiler expansion currently exposes legacy indexing and optional
  property debt in `packages/core`. Keep every package's strict flags enabled;
  fix the owning source modules incrementally, and never suppress or lower the
  flags to make a gate appear green.
