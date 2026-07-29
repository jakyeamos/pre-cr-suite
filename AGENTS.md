# Repository agent contract

Pre-CR Suite is a public-beta developer tool. Its core promise is one
coverage-first pre-CR workflow with behavioral parity across the VS Code and
Neovim clients.

## Ownership and boundaries

- `packages/core` owns configuration, coverage, and gate logic.
- `packages/server` owns the headless CLI and LSP server.
- `packages/vscode-client` owns the VS Code integration; the Neovim client is
  a separate consumer of the published server.
- `fixtures/` and `scripts/` are validation support, not product runtime.
- Quality Runner owns repository quality findings. This repository consumes
  its results; it does not recreate a second quality engine.
- AIOS-compatible audit output is historical compatibility only; do not import
  AIOS modules, write to its database, or inherit its permissions.

## Routing

Read `.agents/context/README.md` first, then load only the packet matching the
task. Keep context minimal: use architecture and commands before reading
implementation details, and do not paste the whole repository into a prompt.

## Required quality ladder

Use the pinned Corepack package manager and run the narrowest relevant checks:

```text
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm run coverage
corepack pnpm build
corepack pnpm package
node scripts/check_environment_contract.mjs
corepack pnpm secret:scan
corepack pnpm dependency:security
```

Keep TypeScript strict. Do not weaken compiler options, bypass Pre-CR, disable
security checks, or hide a failing gate to make a branch green. Publishing,
marketplace release, remotes, and deployment require explicit human approval.

Before editing, inspect Git state and preserve unrelated work. Use a disposable
worktree for autonomous experiments. Do not modify generated coverage, `dist`,
`.aios/`, credentials, or release artifacts by hand.

## Definition of done

A change is done only when the relevant tests and quality gates pass, the
cross-client behavior remains covered, package contents are inspected when
release surfaces change, and the result is documented with its validation
evidence.
