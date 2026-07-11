# Pre-CR Suite

Coverage-first pre-PR readiness for VS Code and Neovim.

Pre-CR Suite is moving to a public beta around one workflow:

1. Run `Pre-CR Check`
2. Refresh coverage overlays and summaries
3. Fix repo setup issues from a shared `.pre-cr.json`

The beta promise is simple: the same repo-configured coverage workflow should behave the same in VS Code and Neovim before you open a pull request.

## Public Beta Scope

| Surface | Status | Notes |
| --- | --- | --- |
| Run Pre-CR Check | Supported | Runs tests with coverage and checks changed-line coverage against the repo threshold |
| Headless JSON gate | Supported | Runs the same gate without LSP via `pre-cr run --json` |
| Refresh Coverage | Supported | Reloads configured coverage reports for overlays, diagnostics, and summaries |
| Fix Setup | Supported | Shows repo config, coverage-path, and test-command health |
| VS Code | Supported | Ships with a bundled language-server artifact |
| Neovim | Supported | Uses the published `@pre-cr/server` package |
| Generic LSP clients | Compatible | Protocol-compatible, but not first-class beta targets |
| Checklist, docs, review, context, debug | Experimental | Still available in-repo, but not part of the beta contract |

## Quick Start

Published npm packages:

- [`@pre-cr/core`](https://www.npmjs.com/package/@pre-cr/core) provides the shared coverage, config, and gate logic.
- [`@pre-cr/server`](https://www.npmjs.com/package/@pre-cr/server) provides the LSP server and `pre-cr` headless CLI.

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
pre-cr run --workspace /path/to/repo
pre-cr run --json --workspace /path/to/repo
```

The CLI uses the same `@pre-cr/core` pipeline as the editor integrations and exits non-zero when the gate fails on `main`, `master`, `dev`, `develop`, `development`, or a branch connected to a dev environment through `AIOS_DEV_ENVIRONMENT`, `AIOS_DEV_ENV`, `QUALITY_GATE_DEV_ENV`, or `GATE_CONNECTED_DEV_ENV`. Failed checks on detected unprotected feature branches return exit code 0 with `gateDecision: "warn"` in JSON output. Unknown branches remain conservative and block. Human-readable output includes covered, ignored, and unsupported surface counts plus the unsupported file list. Use `--json` for the stable automation contract.

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

Notes:

- `.pre-cr.json` is the canonical source of repo behavior across editors.
- Legacy `coveragePath` is still accepted during beta and maps to the first `coveragePaths` entry.
- `coverageAdapters` can generate LCOV or Istanbul coverage after the test command succeeds.
- `qualityAdapters` run after changed-line coverage and can block the Pre-CR result; `{changedFiles}` expands to the same changed-file set Pre-CR checked.
- Anti-Slop is the default required quality adapter. If `anti-slop` reports blocking findings or the binary is unavailable, Pre-CR fails unless the repo explicitly overrides `qualityAdapters`.
- `surfaces` lets repos declare covered, ignored, and unsupported directories in repo config.
- Editor settings are for presentation only: colors, notifications, and experimental visibility.
- Repository config can name executable commands. Editors require an explicit trust decision before running them; see [configuration trust guidance](docs/CONFIGURATION.md#trusting-repository-commands).

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
