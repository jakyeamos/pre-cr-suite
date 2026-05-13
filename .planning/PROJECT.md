# pre-cr-suite-lsp

## What This Is

TypeScript monorepo for a coverage-first pre-review workflow that supports both VS Code and Neovim. The beta promise is already clear, and the immediate job is to harden release gates and preserve parity across clients.

## Core Value

A developer should be able to run the same pre-CR workflow with reliable parity in both VS Code and Neovim.

## Requirements

### Validated

- ✓ The public beta scope is already defined around pre-review readiness, coverage refresh, and setup repair.
- ✓ The repo already has a TypeScript monorepo structure and explicit release-gate expectations.

### Active

- [ ] Run the public-beta release gates from a clean clone.
- [ ] Keep hardening config loading and path resolution.
- [ ] Protect VS Code and Neovim parity while the beta scope stays narrow.

### Out of Scope

- Broad expansion beyond the current beta workflow - The current value comes from doing a narrow workflow well.
- Client-specific drift that weakens parity - The product promise depends on comparable behavior across editors.

## Context

- README and docs already describe the beta surface clearly.
- The biggest operational risk is parity drift while configuration logic evolves.
- Release gates are part of the project identity, not optional cleanup.

## Constraints

- **Parity**: VS Code and Neovim must stay first-class clients - The product promise depends on editor parity.
- **Release quality**: Build, lint, test, typecheck, and packaging gates are part of the beta contract - A broken release baseline undermines trust.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bootstrap GSD planning in an existing brownfield repo | The repo needed planning state before phase work could be managed coherently | - Pending |

---
*Last updated: 2026-04-10 after initial GSD bootstrap*
