---
id: pre-cr-suite-lsp.environment-context
title: Pre-CR Suite environment context
tier: project
status: active
last_reviewed: 2026-07-28
---

# Environment context index

Read this router before non-trivial work. Load only the packet that matches
the task; do not dump the whole repository into an agent context.

| Evidence or task | Packet |
| --- | --- |
| architecture, package ownership, client parity | [architecture.md](architecture.md) |
| build, test, lint, coverage, packaging | [commands.md](commands.md) |
| TypeScript and review conventions | [conventions.md](conventions.md) |
| credentials, dependencies, release safety | [security.md](security.md) |
| recurring failures and recovery | [failure-modes.md](failure-modes.md) |
| good implementation boundaries | [examples.md](examples.md) |
| acceptance and definition of done | [done.md](done.md) |
| release, rollback, and deployment | [deployment.md](deployment.md) |

The root `AGENTS.md` contains invariants and the quality ladder. `.pre-cr.json`
is the canonical local gate configuration. Quality Runner owns findings;
AIOS-compatible files are historical compatibility output only.
