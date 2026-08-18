# Pre-CR Suite

Coverage-first pre-PR readiness for VS Code and Neovim.

Pre-CR Suite is moving to a public beta around one workflow:

1. Run `Pre-CR Check`
2. Refresh coverage overlays and summaries
3. Fix repo setup issues from a shared `.pre-cr.json`

The beta promise is simple: the same repo-configured coverage workflow should behave the same in VS Code and Neovim before you open a pull request.

![Pre-CR terminal snapshot](docs/assets/readme-snapshot.png)

## Why This Matters

### Problem

Coverage and setup problems usually surface too late: after a branch is pushed, after CI starts, or after review already began. Editor extensions, CLI scripts, and repo-specific coverage commands often drift from one another.

### Who It Helps

Pre-CR helps developers and reviewers who want a pre-review signal inside the tools they already use. It is especially useful for teams that care about changed-line coverage but do not want every editor, repo, and CI job to invent its own readiness workflow.

### What I Built

I built a TypeScript monorepo with shared coverage/config logic, a language server, a VS Code client, a Neovim client, and a headless CLI path. The core workflow runs a repo-defined Pre-CR check, refreshes coverage overlays, and reports setup issues from `.pre-cr.json`.

### Technical Decisions

- The shared `@pre-cr/core` package owns coverage parsing, repo config, changed-line evaluation, and protocol contracts.
- The LSP server keeps VS Code, Neovim, and generic clients on the same behavior instead of duplicating editor logic.
- `.pre-cr.json` is the repo-level contract so editor settings stay presentational and project behavior stays versioned.
- The CLI uses the same core pipeline as the editor integrations so automation and local editor feedback do not diverge.

### How To Run It

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pre-cr run --json --workspace /path/to/repo
```

Use `Pre-CR: Run Pre-CR Check` in VS Code or `:PreCrCheck` in Neovim for the editor workflow.

### What I Would Improve Next

The next improvements are clean-clone release verification, stronger marketplace packaging evidence, and a tighter demo path that shows the same failure moving through CLI JSON, VS Code diagnostics, and Neovim commands.

## Public Beta Scope

| Surface | Status | Notes |
| --- | --- | --- |
| Run Pre-CR Check | Supported | Runs tests with coverage and checks changed-line coverage against the repo threshold |
| Headless JSON gate | Supported | Runs the same gate without LSP via `pre-cr run --json` |
| Refresh Coverage | Supported | Reloads configured coverage reports for overlays, diagnostics, and summaries |
| Fix Setup | Supported | Shows repo config, coverage-path, and test-command health |
| VS Code context continuity | Source-verified candidate | Save Snapshot, Where Was I?, and Restore Snapshot persist branch context in workspace storage; installed VSIX proof remains open |
| VS Code | Supported | Ships with a bundled language-server artifact |
| Neovim | Supported | Uses the published `@pre-cr/server` package |
| Generic LSP clients | Compatible | Protocol-compatible, but not first-class beta targets |
| Checklist, docs, review, debug | Experimental | Still available in-repo, but not part of the beta contract |

## Quick Start

Published npm packages:

- [`@pre-cr/core`](https://www.npmjs.com/package/@pre-cr/core) provides the shared coverage, config, and gate logic.
- [`@pre-cr/server`](https://www.npmjs.com/package/@pre-cr/server) provides the LSP server and `pre-cr` headless CLI.
- [`@pre-cr/rust-coverage-adapter`](https://www.npmjs.com/package/@pre-cr/rust-coverage-adapter) runs Rust tests with LLVM instrumentation and emits LCOV for changed-line gates.

The VS Code Marketplace listing is pending verification. Until that is confirmed, use a built VSIX or local extension package for VS Code installs.

### VS Code

Install the extension from a built VSIX or local package artifact, open a repo, and use:

- `Pre-CR: Run Pre-CR Check`
- `Pre-CR: Refresh Coverage`
- `Pre-CR: Fix Setup`

VS Code uses the bundled server artifact inside the extension package. No separate server install is required.

### Neovim

Install the published server package:

```bash
pnpm add -g @pre-cr/server
```

Then wire the plugin into your config and use:

- `:PreCrCheck`
- `:PreCrRefresh`
- `:PreCrSummary`
- `:PreCrFixSetup`

See [packages/neovim-client/README.md](packages/neovim-client/README.md) for the full setup.

### Headless CLI

Install the server package, then run the gate directly:

```bash
pre-cr --version
pre-cr run --workspace /path/to/repo
pre-cr run --json --workspace /path/to/repo
```

The CLI uses the same `@pre-cr/core` pipeline as the editor integrations and exits non-zero when the gate fails on `main`, `master`, `dev`, `develop`, `development`, or a branch connected to a dev environment through `AIOS_DEV_ENVIRONMENT`, `AIOS_DEV_ENV`, `QUALITY_GATE_DEV_ENV`, or `GATE_CONNECTED_DEV_ENV`. Failed checks on detected unprotected feature branches return exit code 0 with `gateDecision: "warn"` in JSON output. Unknown branches remain conservative and block. Human-readable output includes covered, ignored, and unsupported surface counts plus the unsupported file list. Use `--json` for the stable automation contract.

Executable `run` and `hook run` commands write an immediate start message, a periodic heartbeat, and a terminal exit summary to stderr. JSON stdout remains machine-readable, so a long-running commit hook is observable without corrupting automation output.

When the headless gate blocks, warns, or forces iteration, it appends an AIOS-compatible event to `.aios/audit/gate-events.jsonl` in the checked workspace and refreshes `.aios/audit/gate-summary.md` plus `.aios/audit/learning-lessons.md`. Audit write failures are non-blocking; the branch-aware Pre-CR exit code remains authoritative.

## Repo Configuration

Project behavior lives in `.pre-cr.json` at the repo root.

```json
{
  "version": 1,
  "testCommand": "pnpm test -- --coverage",
  "coveragePaths": [
    "coverage/lcov.info",
    "coverage/coverage-final.json"
  ],
  "coverageFormat": "auto",
  "coverageAdapters": [
    {
      "name": "python-lcov",
      "command": "python scripts/emit_lcov.py",
      "coveragePath": "build/python.lcov",
      "coverageFormat": "lcov"
    }
  ],
  "qualityAdapters": [
    {
      "name": "anti-slop",
      "command": "anti-slop gate --files {changedFiles} --mode block --format pre-cr",
      "required": true
    }
  ],
  "surfaces": {
    "covered": ["src/**"],
    "ignored": ["docs/**"],
    "unsupported": ["legacy/**"]
  },
  "threshold": 80,
  "excludePatterns": [
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**"
  ],
  "checks": {
    "coverage": true,
    "security": true,
    "checklist": true
  }
}
```

Use `pre-cr-rust-coverage --version` to verify the installed adapter version.

Notes:

- `.pre-cr.json` is the canonical source of repo behavior across editors.
- Legacy `coveragePath` is still accepted during beta and maps to the first `coveragePaths` entry.
- `coverageAdapters` can generate LCOV or Istanbul coverage after the test command succeeds.
- `qualityAdapters` run after changed-line coverage and can block the Pre-CR result; `{changedFiles}` expands to the same changed-file set Pre-CR checked.
- Anti-Slop is the default required quality adapter. If `anti-slop` reports blocking findings or the binary is unavailable, Pre-CR fails unless the repo explicitly overrides `qualityAdapters`.
- `surfaces` lets repos declare covered, ignored, and unsupported directories in repo config.
- Editor settings are for presentation only: colors, notifications, and experimental visibility.

### Rust coverage

Rust repositories can use the reusable LLVM adapter as their configured test
command:

```bash
pnpm add --save-dev @pre-cr/rust-coverage-adapter
rustup component add llvm-tools-preview --toolchain stable
```

```json
{
  "version": 1,
  "testCommand": "pnpm exec pre-cr-rust-coverage --output coverage/lcov.info -- cargo test --workspace",
  "coveragePaths": ["coverage/lcov.info"],
  "coverageFormat": "lcov",
  "threshold": 80
}
```

The adapter uses the selected Rust toolchain's matching `llvm-profdata` and
`llvm-cov`, preserves existing `RUSTFLAGS`, and writes unique raw profiles
before merging them into the configured LCOV path. See
[`packages/rust-coverage-adapter/README.md`](packages/rust-coverage-adapter/README.md)
for non-standard target directories and explicit object selection.

## Development

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm package
```

## Workspace Layout

```text
packages/
  core/           Shared coverage, config, protocol, and pre-check logic
  server/         LSP server for beta and experimental methods
  rust-coverage-adapter/  Rust/LLVM instrumentation-to-LCOV adapter
  vscode-client/  VS Code extension with bundled server artifact
  neovim-client/  Neovim client commands and setup
```

## Docs

- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [packages/vscode-client/README.md](packages/vscode-client/README.md)
- [packages/neovim-client/README.md](packages/neovim-client/README.md)

## License

MIT
