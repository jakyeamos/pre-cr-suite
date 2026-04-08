# Pre-CR Suite Roadmap

## Current Direction

Pre-CR Suite is being narrowed into a public beta around one strong workflow:

- catch coverage issues before review
- make repo setup obvious when it is broken
- make VS Code and Neovim behave the same from the same repo config

## Public Beta

### Supported

| Area | Status | Notes |
| --- | --- | --- |
| Repo-level `.pre-cr.json` | Active | Canonical config for the beta workflow |
| Run Pre-CR Check | Active | Server-owned orchestration and changed-line coverage evaluation |
| Refresh Coverage | Active | Shared coverage loading for overlays, diagnostics, and summaries |
| Fix Setup | Active | Project health for config, git, coverage, and test-command readiness |
| VS Code | Active | Bundled server artifact |
| Neovim | Active | Published server package and matching commands |

### Experimental

| Area | Status | Notes |
| --- | --- | --- |
| Checklist and broad review helpers | Experimental | Still available, not part of the beta guarantee |
| Documentation generation | Experimental | Needs typed/tested parity work |
| Review estimation and flaky tests | Experimental | Kept in-repo, not part of the beta contract |
| Context snapshots | Experimental | Needs stronger verification |
| Debug capture | Experimental | Needs stronger verification |

## Release Gates

The public beta is ready when:

1. `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm package` pass from a clean clone.
2. VS Code packages with the bundled server artifact.
3. Neovim and VS Code produce matching results from the same `.pre-cr.json`.
4. Docs match the actual install and run flow.

## Next Work

1. Keep hardening typed beta methods and setup health.
2. Expand verification around config loading, path resolution, and security-sensitive rendering.
3. Add stronger cross-client sample repos and smoke tests.
4. Only promote experimental features after they earn typed contracts, tests, and parity plans.
