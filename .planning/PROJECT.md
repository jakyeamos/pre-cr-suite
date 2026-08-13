# pre-cr-suite-lsp

## What This Is

TypeScript monorepo with a shared pre-review enforcement workflow and a standalone VS Code IDE surface. The server, CLI, and Neovim client share repo configuration and coverage decisions; VS Code adds continuity, navigation, setup health, and recovery.

## Core Value

A developer should be able to run the same enforcement workflow in VS Code, Neovim, and the CLI, then recover the surrounding VS Code work without losing context.

## Requirements

### Validated

- ✓ The enforcement boundary is explicit: the LSP/CLI owns repo configuration, test execution, coverage evaluation, and machine-readable results.
- ✓ The VS Code client has a durable continuity implementation, a primary command surface, setup state, and user-facing workflow docs.
- ✓ Core build, typecheck, lint, test, package, and installed VS Code gates passed after a bounded local dependency repair.

### Active

- [ ] Preserve VS Code/Neovim parity for enforcement while keeping IDE-only behavior in the client.

The 5.6 modernization itself is complete on this branch. Cross-client parity remains normal follow-up work, not an IDE product completion blocker.

### Out of Scope

- Marketplace publication, deployment, and external-service mutation without owner authority.
- Telemetry or remote snapshot storage.
- Moving IDE continuity into the enforcement stack or duplicating server analysis in the client.

## Context

- `docs/modernization/IDE_5_6_AUDIT.md` records the evidence ledger and preserved parent dirty work.
- The parent `dev` checkout contains an unrelated/in-progress continuity patch and is not proof for this isolated branch.
- Generated worktrees cannot use `pnpm install --frozen-lockfile` while the lockfile points at a sibling `eslint-plugin-anti-slop` path; the bounded no-lockfile install is provisional.

## Constraints

- **Enforcement boundary**: Shared repo behavior and quality results must remain authoritative in core/LSP/CLI.
- **IDE ownership**: VS Code owns interaction, continuity, presentation, local state, and recovery.
- **Release quality**: Build, lint, test, typecheck, packaging, and installed behavior evidence are separate gates.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep enforcement and IDE surfaces separate | The requested 5.6 work is a VS Code product modernization, not a second quality engine | Adopted |
| Persist snapshot metadata in VS Code workspace state | Server memory alone cannot survive an extension/server restart | Adopted |
| Keep telemetry absent | No owner-approved privacy change is needed for local recovery | Adopted |

---
*Last updated: 2026-08-12 for Upgrading to 5.6*
