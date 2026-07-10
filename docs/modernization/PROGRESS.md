# Modernization Progress

## Current state

Audit and target-design phase completed on 2026-07-10 in isolated worktree branch
`codex/gpt56-modernization-audit`. No application behavior has been changed.

The current checkout was left untouched because it had unrelated untracked files.
The audit worktree is based on commit `459e09f`.

## Completed

- Established a clean baseline and ran build, lint, typecheck, unit tests, beta
  headless smoke, bundled/published server parity smoke, packaging, repository
  quality gates, secret scan, and dependency scan.
- Recorded the clean-install reproducibility blocker caused by the local absolute
  anti-slop dependency.
- Completed independent architecture, product/UX, and security/quality audits.
- Created `AUDIT.md`, `TARGET.md`, and `EXEC_PLAN.md` with evidence, target state,
  contract constraints, and vertical migration milestones.

## Verified baseline

| Check | Result |
| --- | --- |
| Build, lint, typecheck | Pass |
| Unit tests | Pass, 376 tests |
| Headless beta smoke | Pass |
| Bundled/published server parity smoke | Pass |
| VSIX package | Pass |
| Format, validation, dead-code, complexity gates | Pass |
| Secret and high/critical dependency scan | Pass |
| Fresh external install | Blocked by a local absolute `file:` dependency |

## Primary risks to resolve first

1. The current gate can pass uncovered modified code.
2. Workspace config can escape the workspace and execute repository-supplied
   commands without an explicit trust boundary.
3. A clean external install is impossible with the local dependency.
4. The first-class editor experiences do not actually prove the public beta loop.

## Proposed defaults pending product review

| Decision | Default proposed in the plan |
| --- | --- |
| Product scope | Ship only the coverage-readiness beta loop; remove or explicitly isolate experimental features. |
| Migration shape | Build v2 in parallel and migrate vertical slices; do not refactor the legacy suite in place. |
| Config evolution | Read v1 through a tested adapter, offer explicit v2 migration, then remove the adapter at the documented cutover. |
| Trust behavior | Require VS Code workspace trust before execution and an explicit CLI acknowledgement when non-interactive automation needs it. |
| Public compatibility | Preserve documented beta commands/entrypoints temporarily; do not preserve undocumented experimental RPC as permanent shims. |

## Next step

Review `TARGET.md` and `EXEC_PLAN.md`, especially the proposed product narrowing,
config/trust policy, and compatibility window. Once approved, begin M0 and M1 in
separate coherent commits, keeping the application runnable at every milestone.

