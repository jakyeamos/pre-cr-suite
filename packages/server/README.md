# @pre-cr/server

Language Server Protocol server and CLI package for Pre-CR Suite.

## Install

```bash
pnpm add -g @pre-cr/server
```

This package exposes two commands:

- `pre-cr-server` starts the LSP server for editor clients.
- `pre-cr` runs the headless changed-line readiness gate.

## Headless Gate

```bash
pre-cr run --workspace /path/to/repo
pre-cr run --json --workspace /path/to/repo
pre-cr run --scope worktree --json --workspace /path/to/repo
```

The headless gate uses the same `.pre-cr.json` configuration and `@pre-cr/core` pipeline as the editor integrations. `--scope staged` is the default; `--scope worktree` evaluates the current worktree. JSON responses expose `schemaVersion`, `state`, `gateDecision`, `scope`, and structured remediation.

## Contribution Proof

```bash
pre-cr proof --manifest contribution-proof.json --json --workspace /path/to/repo
```

Contribution Proof is an experimental, read-only CLI workflow. It validates
risk-scaled evidence and binds the manifest to a clean, non-empty descendant
diff. It does not execute manifest commands, authorize a merge, or imply LSP,
VS Code, or Neovim parity. See
[`docs/CONTRIBUTION_PROOF.md`](../../docs/CONTRIBUTION_PROOF.md).

## Git Hooks

Hook installation is explicit. Installing the package does not mutate `.git/hooks`, Husky, Lefthook, or pre-commit framework config.

```bash
pre-cr hook install
pre-cr hook status --json
pre-cr hook run --workspace /path/to/repo --hook pre-commit --json
pre-cr hook uninstall
```

Supported managers are `native`, `husky`, `lefthook`, `pre-commit`, `auto`, and `all`. The default hook is `pre-commit`; `pre-push` is also supported.

Installed hooks require `.pre-cr.json`, inspect staged files, run deterministic commit checks, and then run the existing changed-line readiness gate for staged source changes.

Hook policy lives in `.pre-cr.json`:

```json
{
  "version": 1,
  "hook": {
    "defaultHook": "pre-commit",
    "rules": {
      "oversized-source": "warn",
      "typescript-any": "block"
    },
    "audit": {
      "enabled": false,
      "path": ".pre-cr/audit.jsonl"
    }
  }
}
```

When a staged line contains a non-executable package-manager example used by a
detector, fixture, or contract, document the narrow exception inline with
`quality-gate: allow package-manager: non-executable`. The marker is accepted
only on `detection_terms` or `good_example` fields without process-launch
syntax; executable commands remain blocking.

## Public Beta Surface

The beta-supported server surface is Pre-CR Check, Refresh Coverage, Fix Setup, the headless JSON gate, and command-only hook management. Contribution Proof is an experimental CLI-only surface. Broader checklist, docs, review, context, and debug methods are experimental and are not registered unless the client opts in with `initializationOptions.experimental.enabled: true`. Their implementation imports the explicit `@pre-cr/core/experimental` entrypoint and is not part of the stable core package surface.

## Scope

This README documents the `server` subproject inside `pre-cr-suite-lsp/packages`.

## Repository Layout

- `.eslintrc.json` - project file.
- `package.json` - JavaScript package metadata and scripts.
- `src/` - source code and package internals.
- `tsconfig.json` - project file.
- `vitest.config.ts` - project file.

## Common Commands

- `pnpm build` - `tsc`
- `pnpm typecheck` - `tsc --noEmit`
- `pnpm watch` - `tsc -w`
- `pnpm test` - `vitest run`
- `pnpm lint` - `eslint src --ext ts`
- `pnpm clean` - `rm -rf dist`

## Development Notes

Runtime dependencies include `@pre-cr/core`, `js-yaml`, `vscode-languageserver`, `vscode-languageserver-textdocument`, `vscode-uri`.
Use `pnpm` from the containing workspace to install dependencies and run scripts.

The build emits a standalone `dist/server.js` artifact with its runtime
dependencies bundled. The published server and VS Code extension copy are
verified byte-for-byte identical, so the editor host does not depend on a
workspace `node_modules` tree.

## Verification

Run the relevant test script listed above before changing behavior.
