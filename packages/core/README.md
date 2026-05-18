# @pre-cr/core

Core parsing, validation, review, doc generation, logging, and runner logic for Pre-CR Suite.

## Scope

This README documents the `core` subproject inside `pre-cr-suite-lsp/packages`.

## Repository Layout

- `.eslintrc.json` - project file.
- `package.json` - JavaScript package metadata and scripts.
- `src/` - source code and package internals.
- `tsconfig.json` - project file.
- `vitest.config.ts` - project file.

## Common Commands

- `pnpm build` - `tsc`
- `pnpm typecheck` - `tsc --noEmit`
- `pnpm test` - `vitest run`
- `pnpm test:coverage` - `vitest run --coverage`
- `pnpm lint` - `eslint src --ext ts`
- `pnpm clean` - `rm -rf dist coverage`

## Development Notes

Use `pnpm` from the containing workspace to install dependencies and run scripts.

## Verification

Run the relevant test script listed above before changing behavior.
