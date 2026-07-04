# @pre-cr/core

Core parsing, validation, review, doc generation, logging, and runner logic for Pre-CR Suite.

## Install

```bash
pnpm add @pre-cr/core
```

`@pre-cr/core` is the shared runtime library used by the server, editor clients, and headless gate. It is not a standalone command.

## Public Beta Surface

The beta-stable surface is the changed-line coverage and setup-health pipeline exported from `@pre-cr/core`. Checklist, docs, review, context, and debug helpers remain available for in-repo use, but they are experimental until their contracts are hardened.

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
