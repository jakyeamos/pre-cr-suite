# Modernization Progress

## Current state

M0, M1, M2, and M3 are complete on isolated branch `codex/gpt56-modernization-audit`.
The original checkout remains untouched because it had unrelated untracked
files. M1 establishes the safe execution and changed-line correctness boundary;
M2 adds the shared stable contract registry and canonical workspace-session
engine that the runtime consolidation now uses.
M4 is in progress: the first readiness slice now persists the last result,
surfaces the state in VS Code, and leaves diagnostics owned by the server.
M5 has started with the same durable readiness result and remediation buffer in
Neovim, while preserving the existing commands and coverage overlays. Stable
editor requests now carry workspace identity and explicit staged/worktree scope,
so multi-root routing and warning-state presentation use the same result.
M6 has started: legacy VS Code tools are now opt-in behind
`preCr.experimental.enabled` and their views, commands, keybindings, and quick
actions stay hidden or disabled by default. The server now also registers its
legacy request handlers only when `initializationOptions.experimental.enabled`
is explicitly true. A VS Code activation lifecycle harness now covers stable
startup, persisted readiness recovery, explicit experimental opt-in, setting
reload, and restricted-mode trust/setup guidance.
The core package now exposes only the stable beta surface from `@pre-cr/core`;
legacy checklist/docs/review/context/debug helpers are available only through
the explicit `@pre-cr/core/experimental` subpath. A real VS Code development
host now starts the bundled server and proves stable activation with the
experimental command surface disabled by default.

## Completed

- Established a clean baseline and ran build, lint, typecheck, unit tests, beta
  headless smoke, bundled/published server parity smoke, packaging, repository
  quality gates, secret scan, and dependency scan.
- Recorded the clean-install reproducibility blocker caused by the local absolute
  anti-slop dependency.
- Completed independent architecture, product/UX, and security/quality audits.
- Created `AUDIT.md`, `TARGET.md`, and `EXEC_PLAN.md` with evidence, target state,
  contract constraints, and vertical migration milestones.
- Removed the machine-local anti-slop development dependency and its incompatible
  ESLint-9 transitive graph; the target repository config now explicitly has no
  quality adapters.
- Pinned pnpm build approval policy, aligned CI with pnpm 11.7.0, separated the
  Node 18/20 compatibility job from the Node 20.18.1 release job, and made the
  release job run the full quality, security, beta, and packaging proof.
- Proved a fresh `git clone --no-local` installs with `CI=true corepack pnpm
  install --frozen-lockfile`, no local symlink, and pnpm 11.7.0.
- Added one canonical workspace-path resolver with lexical and realpath checks,
  including symlink and missing-write-target handling.
- Made repository command execution explicit: VS Code requires workspace trust,
  Neovim defaults to read-only readiness, the server requires a trusted init
  option, and CLI/hooks acknowledge execution explicitly.
- Replaced unbounded repository/test/adapter subprocesses with one bounded,
  non-shell runner that caps output, times out, supports cancellation, and
  terminates process groups.
- Made Git attribution NUL-safe and content-aware for staged, worktree,
  untracked, renamed, unusual-name, and binary changes.
- Made changed-line coverage fail closed for missing data and unclassified
  surfaces; coverage reports and their source paths are size- and workspace-
  validated before parsing.
- Added containment checks to legacy server request, hook-audit, hook-Git, and
  VS Code fallback Git paths.
- Added a value-level stable beta method and notification registry plus runtime
  request payload guards, while preserving the typed protocol map for package
  compatibility.
- Added canonical workspace sessions keyed by real paths, nested-workspace URI
  routing, isolated coverage/trust state, and server workspace-folder lifecycle
  handling.
- Removed coverage basename fallback and migrated the server, VS Code, Neovim,
  and parity smoke stable calls to explicit contract identifiers.
- Added the versioned CLI readiness envelope with explicit staged/worktree scope,
  state, gate decision, and structured remediation; hooks expose the same engine
  result when they run Pre-CR.
- Made `@pre-cr/server/dist/server.js` the only portable server artifact. The
  build bundles its runtime dependencies, the VS Code package copies it
  directly, and the parity/package checks require hash identity between
  published and bundled artifacts.
- Added package export maps and release-facing CLI/config documentation for the
  stable contract.
- Started the VS Code readiness migration with workspace-persisted state,
  `Ready`/`Warning`/`Blocked`/`Setup needed` status presentation, a dedicated
  Readiness view, and server-owned coverage diagnostics.
- Started Neovim readiness parity with a per-workspace persisted snapshot,
  `:PreCrReadiness` recovery buffer, shared state labels, and default keymaps
  enabled by no-options `setup()`.
- Added cross-client acceptance hardening: explicit workspace-scoped stable
  requests, warning-state derivation, stale coverage/diagnostic cleanup, durable
  per-root Neovim recovery, and a headless Neovim readiness smoke script.
- Moved the legacy security scan's diagnostic publication to the server and kept
  VS Code's navigation/code actions on the server-owned diagnostics collection.
- Gated legacy VS Code checklist, documentation, review, context, debug, and
  dashboard registration behind an explicit experimental setting, with manifest
  tests covering the default-off surface.
- Isolated the server's legacy checklist/docs/review/context/debug request
  registration behind the same explicit experimental opt-in.
- Added VS Code activation lifecycle coverage for stable startup, readiness
  recovery, experimental opt-in, configuration reload, and restricted-mode
  setup/trust behavior.
- Isolated legacy core helpers behind `@pre-cr/core/experimental`, updated
  opt-in server handlers to use that entrypoint, and added stable/experimental
  package export regression tests.
- Added a standalone server-artifact bundle and a real VS Code host smoke that
  verifies activation, stable readiness commands, and default-off experimental
  commands.

## Verified baseline

| Check | Result |
| --- | --- |
| Build, lint, typecheck | Pass |
| Unit tests | Pass, 441 tests |
| Neovim readiness smoke | Pass (or cleanly skips when Neovim is unavailable) |
| Headless beta smoke | Pass |
| Bundled/published server parity smoke | Pass |
| VSIX package | Pass |
| VS Code extension-host smoke | Pass (trusted development host, server starts) |
| Format, validation, dead-code, complexity gates | Pass |
| Secret and high/critical dependency scan | Pass |
| Fresh external install | Pass with pnpm 11.7.0 and no local symlink |

## Primary risks to resolve first

1. The real host smoke proves activation and command gating, but the complete
   Setup → Run → Diagnose → Fix → Rerun workflow still needs end-to-end parity
   assertions against the consolidated result contract.
2. The legacy server methods and core modules are explicitly isolated now, but
   still need a removal or separately versioned release decision.
3. Experimental VS Code tools need a documented migration path before deletion.

## Proposed defaults pending product review

| Decision | Default proposed in the plan |
| --- | --- |
| Product scope | Ship only the coverage-readiness beta loop; remove or explicitly isolate experimental features. |
| Migration shape | Build v2 in parallel and migrate vertical slices; do not refactor the legacy suite in place. |
| Config evolution | Read v1 through a tested adapter, offer explicit v2 migration, then remove the adapter at the documented cutover. |
| Trust behavior | Require explicit execution trust at every repository-command boundary; VS Code supplies Workspace Trust, Neovim requires opt-in, and automation opts in explicitly. |
| Public compatibility | Preserve documented beta commands/entrypoints temporarily; do not preserve undocumented experimental RPC as permanent shims. |

## Next step

Continue M7 in coherent vertical slices: add end-to-end VS Code host assertions
for Setup → Run → Diagnose → Fix → Rerun, then decide whether the isolated
legacy package should be removed or separately versioned. Keep the application
runnable at every milestone.
