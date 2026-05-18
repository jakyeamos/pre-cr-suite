# @pre-cr/server

Language Server Protocol server and CLI package for Pre-CR Suite.

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

Runtime dependencies include `@pre-cr/core`, `vscode-languageserver`, `vscode-languageserver-textdocument`, `vscode-uri`.
Use `pnpm` from the containing workspace to install dependencies and run scripts.

## Verification

Run the relevant test script listed above before changing behavior.
