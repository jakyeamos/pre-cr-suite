---
name: pre-cr-suite
description: Use when coding with the Pre-CR Suite monorepo—@pre-cr/core, @pre-cr/server, the pre-cr CLI/LSP, VS Code, or Neovim—for coverage gates, .pre-cr.json configuration, integrations, debugging, tests, or migrations. Stay on public beta APIs and do not infer unsupported editor or protocol behavior.
---

# Pre-CR Suite

## Package metadata

- Package family: `@pre-cr/core`, `@pre-cr/server`, `@pre-cr/rust-coverage-adapter`, `pre-cr-suite` (VS Code), and the Neovim Lua client.
- Current repository/package version: `0.1.0` (public beta; no semver range is declared).
- Ecosystem: TypeScript/Node.js library + LSP server/CLI, VS Code extension, Lua client.
- Runtime: Node `>=18.0.0`; VS Code `^1.85.0` for the extension; pnpm `11.7.0` at the workspace root.
- Package manager: `pnpm` (use the repository's `packageManager`; commands may be run through `corepack pnpm` by workspace scripts).
- Shape: monorepo with a shared library, server/CLI, and editor clients—not a single framework.
- Source of truth consulted: root `README.md`/`package.json`, package READMEs and manifests, `docs/CONFIGURATION.md`, `docs/LSP_ARCHITECTURE.md`, `docs/ROADMAP.md`, exported TypeScript sources/types, beta/config/parser/runner/security tests, and recent git release/publish history. No changelog/release-notes file is present.

## When to use this skill

Use it for implementation, debugging, configuration, test integration, CLI automation, LSP/client work, coverage parsing, or upgrading this package family. Prefer the beta workflow: repo configuration, changed-line coverage, setup health, refresh, and parity across clients. The VS Code-only context continuity subset is a source-verified candidate with installed proof still open. Treat Contribution Proof, checklist, docs, review, and debug helpers as experimental unless the task explicitly targets them.

## Package mental model

`.pre-cr.json` at the workspace root is the canonical project behavior shared by VS Code, Neovim, hooks, and the headless CLI. `@pre-cr/core` is editor-independent and exports coverage parsers, config/protocol types, validation, and orchestration helpers. `@pre-cr/server` owns LSP requests, workspace checks, hooks, and CLI commands. VS Code bundles the server; Neovim starts the published server and uses the Lua client.

The supported gate runs tests/coverage, loads LCOV or Istanbul data, evaluates changed-line coverage against `threshold`, and may run configured quality adapters. `@pre-cr/rust-coverage-adapter` provides the reusable Rust/LLVM instrumentation-to-LCOV command for repositories whose native test runner does not emit a compatible report. `surfaces` separates covered, ignored, and unsupported files; unsupported files need explicit repo setup rather than wrapper-side guesses.

VS Code context continuity uses `Save Snapshot`, `Where Was I?`, and `Restore
Snapshot`. Snapshots are stored per workspace, re-imported after the bundled
server restarts, and restore failures stay visible when files are missing or
stale. Do not claim installed behavior until a packaged VSIX has passed the
workflow in `docs/IDE_WORKFLOW.md`. This continuity contract is VS Code-specific
and does not imply Neovim parity.

## Installation, imports, and setup

For library code, install and import public root exports:

```bash
pnpm add @pre-cr/core
pnpm add @pre-cr/server
```

```ts
import { parseLcovFile, parseIstanbulFile, loadProjectConfig } from '@pre-cr/core';
```

Do not import `src/*`, `dist/*`, or private server request/controller modules. Build `@pre-cr/core` before consumers when working from this monorepo. `@pre-cr/core` is not a standalone CLI. Install the server globally only when an external editor or shell needs its binaries:

```bash
pnpm add -g @pre-cr/server
```

For VS Code, use the extension; it bundles the server and does not require a separate server install. For Neovim, install `@pre-cr/server` and configure `require("pre-cr").setup()`.

## Common workflows

Create `.pre-cr.json` with `version: 1`, an ordered `coveragePaths` list, `coverageFormat: "auto"` (or explicit `lcov`/`istanbul`), `threshold`, `excludePatterns`, and `checks`. Use `testCommand` when auto-detection is insufficient. Paths are relative to the config/workspace root.

```json
{
  "version": 1,
  "testCommand": "pnpm test -- --coverage",
  "coveragePaths": ["coverage/lcov.info", "coverage/coverage-final.json"],
  "coverageFormat": "auto",
  "threshold": 80,
  "checks": { "coverage": true, "security": true, "checklist": true }
}
```

For Rust repositories, install `@pre-cr/rust-coverage-adapter` and use a
command such as:

```json
{
  "testCommand": "pnpm exec pre-cr-rust-coverage --output coverage/lcov.info -- cargo test --workspace",
  "coveragePaths": ["coverage/lcov.info"],
  "coverageFormat": "lcov"
}
```

The adapter uses the matching `llvm-tools-preview` component from the selected
rustup toolchain. It does not install toolchains or components automatically;
see the package README for setup and explicit object-selection options.

Run the same gate used by editor clients:

```bash
pre-cr run --workspace /path/to/repo
pre-cr run --json --workspace /path/to/repo
```

Use `--json` for automation. The CLI checks staged changes and returns non-zero for failures on protected/unknown branches; detected feature branches can return `0` with `gateDecision: "warn"`. Do not parse human-readable output as a stable API.

For an explicitly requested evidence handoff, use the experimental read-only
Contribution Proof command:

```bash
pre-cr proof --manifest contribution-proof.json --json --workspace /path/to/repo
```

The manifest binds claims, direct observations, passed automated tests,
negative controls, edge cases, unknowns, and reviewer reproduction steps to a
full base commit. Low risk requires a direct observation or passed test; medium
requires both; high also requires a negative control and edge case per claim.
The worktree must be clean and the base-to-HEAD diff non-empty. The command
validates supplied evidence but does not run it, edit the repo, open a PR, or
authorize merge. Do not infer editor or LSP parity from this CLI-only surface.

For explicit hook changes only, use `pre-cr hook install|status|run|uninstall`; supported managers are `native`, `husky`, `lefthook`, `pre-commit`, `auto`, and `all`, with `pre-commit` as the default hook. Executable `run` and `hook run` commands report start, heartbeat, and terminal status on stderr while keeping JSON stdout machine-readable.

If a staged source line contains package-manager text only as non-executable
detector or fixture data, document the narrow exception inline with
`quality-gate: allow package-manager: non-executable`. The hook validates that
the line is a `detection_terms` or `good_example` field without process-launch
syntax; executable npm or Yarn commands remain blocking.

## Preferred APIs and idioms

- Use `parseLcovFile`/`parseLcovContent` or `parseIstanbulFile`/`parseIstanbulContent` for coverage; inspect `ParseResult.success`, `errors`, and `warnings`.
- Use `loadProjectConfig` and `resolveProjectPath` for repo config/path resolution; preserve warnings such as legacy config use.
- Use `runWorkspacePreCrCheck` for the shared async check pipeline and pass `changeScope: 'worktree' | 'staged'` deliberately.
- Use `PreCrBetaMethodMap` and the six `$/preCr/*` beta methods in `protocol.ts` for LSP contracts; keep params/results typed.
- Treat parser APIs as synchronous and workspace checks/CLI/LSP calls as asynchronous; do not mix them or forget `await`.
- Prefer `coveragePaths`; `coveragePath` is a compatibility alias mapped to the first path and should be migrated.

## Errors and diagnostics

Parsing can succeed with non-fatal warnings; do not discard them. A missing `.pre-cr.json` uses defaults and produces a health warning. Distinguish missing git, test command, coverage, invalid config, and no changes through project health instead of reporting every failure as a coverage failure. Check `result.error`, `testRun`, `coverageCheck`, and `qualityAdaptersPassed` before declaring success.

## Testing and validation

From the root, use:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:headless-beta
pnpm test:beta-parity
pnpm package
pnpm pre-pr
```

For focused work: `pnpm --filter @pre-cr/core test`, `pnpm --filter @pre-cr/server test`, or the corresponding `build`, `typecheck`, and `lint` scripts. For CLI smoke tests, build core/server first, then run `pre-cr run --json --workspace <fixture-or-repo>`.

## Security and safety

Treat `.pre-cr.json` adapter commands, `testCommand`, quality adapters, and hook installation as executable operations supplied by the repository. Inspect and confirm them before running against an untrusted workspace; never inject secrets or concatenate untrusted shell fragments. The implementation uses tokenized commands and `shell: false`, but command configuration is still code execution.

Use workspace-relative coverage paths and the exported validation helpers. Coverage-file validation limits size (10 MiB), rejects directories, checks traversal/symlink escape, and handles malformed input. Do not weaken these checks or assume `validateSourcePath` alone proves a path is inside the workspace. Never hard-code API keys, tokens, passwords, private keys, or connection strings. Avoid destructive hook/file operations unless explicitly requested; hook installation is not implicit on package install.

## Common mistakes to avoid

- Importing internal files or relying on undocumented LSP methods.
- Using `coveragePath` in new config instead of `coveragePaths`.
- Treating Contribution Proof or other experimental helpers as the public beta contract.
- Running the CLI without considering staged-vs-worktree scope or branch-aware warning behavior.
- Assuming editor settings override repo behavior; project behavior belongs in `.pre-cr.json`.
- Parsing text CLI output when `--json` is available.
- Omitting `coverageFormat` when a nonstandard extension makes `auto` inference ambiguous.
- Executing adapter commands or installing hooks without reviewing their commands and target workspace.

## Migration/version notes

Version `0.1.0` is beta and config schema `version: 1`. Migrate `coveragePath` to `coveragePaths` and keep the first entry equivalent. There is no repository changelog or declared compatibility range; verify manifests, `README`s, `docs/ROADMAP.md`, protocol types, and tests before relying on a newer release. Do not invent compatibility for experimental methods.

## Before finalizing generated code

Confirm imports resolve from package roots, config paths and formats are valid, async boundaries are correct, errors/warnings are surfaced, no private API or secret was introduced, and commands are safe for the target workspace. Run the narrowest relevant package checks, then the root parity/headless checks for changes affecting config, server, CLI, or clients.

## Release maintenance

When the package family version or beta contract changes, update the metadata, supported API/method list, config migration notes, commands, runtime/package-manager requirements, and any security limits here. Recheck package manifests, root/package READMEs, protocol exports, tests, docs, and release history; remove compatibility warnings only after the implementation and tests show the old behavior is gone.
