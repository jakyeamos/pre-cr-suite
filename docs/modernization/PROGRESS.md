# Modernization Progress

## Current state

M0 is complete on isolated branch `codex/gpt56-modernization-audit` at
`3e88e4d`. The original checkout remains untouched because it had unrelated
untracked files. M1—correct, bounded, trust-aware gate behavior—is next.

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
| Fresh external install | Pass with pnpm 11.7.0 and no local symlink |

## Primary risks to resolve first

1. The current gate can pass uncovered modified code.
2. Workspace config can escape the workspace and execute repository-supplied
   commands without an explicit trust boundary.
3. The first-class editor experiences do not actually prove the public beta loop.

## Proposed defaults pending product review

| Decision | Default proposed in the plan |
| --- | --- |
| Product scope | Ship only the coverage-readiness beta loop; remove or explicitly isolate experimental features. |
| Migration shape | Build v2 in parallel and migrate vertical slices; do not refactor the legacy suite in place. |
| Config evolution | Read v1 through a tested adapter, offer explicit v2 migration, then remove the adapter at the documented cutover. |
| Trust behavior | Require VS Code workspace trust before execution and an explicit CLI acknowledgement when non-interactive automation needs it. |
| Public compatibility | Preserve documented beta commands/entrypoints temporarily; do not preserve undocumented experimental RPC as permanent shims. |

## Next step

Implement M1 in coherent commits: canonical workspace containment, fail-closed
changed-line attribution, bounded command execution, and trusted config execution.
Keep the application runnable at every milestone.
