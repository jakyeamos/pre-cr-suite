# Modernization Progress

## Current state

M0, M1, M2, and M3 are complete on isolated branch `codex/gpt56-modernization-audit`.
The original checkout remains untouched because it had unrelated untracked
files. M1 establishes the safe execution and changed-line correctness boundary;
M2 adds the shared stable contract registry and canonical workspace-session
engine that the runtime consolidation now uses.
M4 is in progress: the first readiness slice now persists the last result,
surfaces the state in VS Code, and leaves diagnostics owned by the server.

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
  VS Code package copies it directly and the parity/package checks require hash
  identity between published and bundled artifacts.
- Added package export maps and release-facing CLI/config documentation for the
  stable contract.
- Started the VS Code readiness migration with workspace-persisted state,
  `Ready`/`Warning`/`Blocked`/`Setup needed` status presentation, a dedicated
  Readiness view, and server-owned coverage diagnostics.

## Verified baseline

| Check | Result |
| --- | --- |
| Build, lint, typecheck | Pass |
| Unit tests | Pass, 424 tests |
| Headless beta smoke | Pass |
| Bundled/published server parity smoke | Pass |
| VSIX package | Pass |
| Format, validation, dead-code, complexity gates | Pass |
| Secret and high/critical dependency scan | Pass |
| Fresh external install | Pass with pnpm 11.7.0 and no local symlink |

## Primary risks to resolve first

1. The legacy suite still exposes experimental surfaces that should be isolated
   or removed as the v2 contract is introduced.
2. Client workflows still need end-to-end parity proof against the consolidated
   result contract.
3. VS Code and Neovim still need readiness-first presentation and durable
   recovery around the consolidated result.

## Proposed defaults pending product review

| Decision | Default proposed in the plan |
| --- | --- |
| Product scope | Ship only the coverage-readiness beta loop; remove or explicitly isolate experimental features. |
| Migration shape | Build v2 in parallel and migrate vertical slices; do not refactor the legacy suite in place. |
| Config evolution | Read v1 through a tested adapter, offer explicit v2 migration, then remove the adapter at the documented cutover. |
| Trust behavior | Require explicit execution trust at every repository-command boundary; VS Code supplies Workspace Trust, Neovim requires opt-in, and automation opts in explicitly. |
| Public compatibility | Preserve documented beta commands/entrypoints temporarily; do not preserve undocumented experimental RPC as permanent shims. |

## Next step

Continue M4 in a coherent vertical slice: finish the VS Code readiness flow and
extension-host verification while keeping the existing beta commands as
compatibility aliases. Keep the application runnable at every milestone.
