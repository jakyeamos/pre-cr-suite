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
```

The headless gate uses the same `.pre-cr.json` configuration and `@pre-cr/core` pipeline as the editor integrations.

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

## Public Beta Surface

The beta-supported server surface is Pre-CR Check, Refresh Coverage, Fix Setup, the headless JSON gate, and command-only hook management. Broader checklist, docs, review, context, and debug methods are experimental.

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

## Verification

Run the relevant test script listed above before changing behavior.
