# VS Code IDE modernization audit — Upgrading to 5.6

**Status:** local modernization complete; external publishing remains owner-gated

**Date:** 2026-08-12

**Scope:** `packages/vscode-client`, its user-facing documentation, packaging metadata, and the client/server seams required by the IDE workflow.

## Product boundary

The VS Code client is a standalone IDE product surface. It owns the interaction loop: orientation, continuity, setup health, coverage presentation and navigation, checklists, recovery, empty states, accessibility, and local state. The Pre-CR LSP/CLI remains the enforcement and analysis authority for repo configuration, test execution, coverage evaluation, and machine-readable results. The IDE must not become a second enforcement engine or a showcase-only demo.

The 5.6 target is a coherent local workflow:

1. Open the Pre-CR surface from the command palette, activity bar, status bar, or walkthrough.
2. Understand what needs attention before running a check.
3. Run or refresh the shared enforcement workflow.
4. Navigate coverage and checklist findings from the editor.
5. Leave and return to a branch without losing the open text tabs and cursor context.
6. Recover from missing setup, missing reports, unavailable server, deleted files, or interrupted operations with an explicit next action.

## Evidence ledger

| Evidence | Classification | Finding |
| --- | --- | --- |
| Canonical `dev` route and doctor | Observed | Pronto route/doctor is Ready for `/Users/jakyeamos/projects/pre-cr-suite-lsp`; configured integration target is `dev`. |
| This isolated worktree route | Observed | Pronto reports Blocked because the generated worktree is not registered. No registry mutation was made. |
| Current worktree | Observed | Clean at `c872468` before this work; branch was created for isolated implementation. |
| Parent `dev` checkout | Observed | Dirty with an in-progress context continuity patch, including uncommitted changes to `snapshot.ts`, `context.ts`, `extension.ts`, docs, tests, and skill text. It is preserved and is not evidence of completion. |
| VS Code CLI | Observed | `code` resolves to `/opt/homebrew/bin/code`, version `1.133.0`, arm64. Default profile listing hit a sandbox log-permission error; a temporary profile is required for installed proof. |
| Source snapshot capture | Observed | Clean baseline used `vscode.window.visibleTextEditors`, which omits non-visible open tabs in a normal single-pane workspace. |
| Source continuity storage | Observed | Server exposes export/import methods, but the clean client did not import/export them to VS Code workspace state. A server restart therefore discarded the client’s only recovery path. |
| Source Quick Actions | Observed | Primary IDE workflows were split into “Beta Workflow” and “Experimental,” and the Quick Actions shortcut display did not match the manifest on macOS. |
| Source privacy contract | Observed | No telemetry or network sender exists in the client, but `docs/CONFIGURATION.md` advertised `PRE_CR_DISABLE_TELEMETRY`. This was a stale promise, not an implemented control. |
| Source packaging | Observed | `.vscodeignore` already excludes source and build tooling and retains bundled `dist`, README, package metadata, and license. The package repository URL was stale (`jakye` rather than `jakyeamos`). |
| Baseline validation | Observed | After the documented local dependency repair (`pnpm install --lockfile=false`), the final root build, typecheck, lint, test, and package gates passed. Lint produced warnings but no errors; the final workspace run was 202 core tests, 7 server tests, and 137 VS Code tests. |
| Lint toolchain | Observed | Migrated package-local linting from ESLint 8 legacy configs to ESLint 9.39.5 flat configs with `@eslint/js@9.39.5` and `typescript-eslint@8.67.0`; `pnpm why eslint` now resolves the anti-slop peer to ESLint 9. The root Node engine floor is `>=18.18.0`. |
| Installed behavior | Observed | Final `pre-cr-suite-0.2.0.vsix` installed in `/private/tmp/pre-cr-suite-ide-5-6-extensions` with an isolated profile. VS Code 1.133.0 captured three open text files, showed two persisted three-file snapshots after a clean restart, exposed Full Restore/Cursor Only, and visibly reopened the saved files. |
| Installed IDE shell | Observed | The final installed package exposed Quick Actions with setup, dashboard, Where Was I?, save/restore, capture, settings, and logs; the status bar reported `Pre-CR · saved`. Native accessibility inspection reached the Code window and setup-health surface; webview contents remain a provider boundary. |
| Coverage navigation | Observed | Coverage diagnostics now bind to validated workspace-relative paths instead of basename matches. Deterministic tests cover an in-workspace absolute path and an outside-workspace same-basename path. |

## Current surface audit

| Surface | Baseline | 5.6 disposition |
| --- | --- | --- |
| Where Was I? | Server summary exists; file action is loosely parsed and path handling is not bounded. | Keep as the resume entry point, make file actions safe, line-aware, and useful when a snapshot is absent. |
| Snapshots and restore | Captures visible editors only; in-memory server state; restore swallows missing files and reports success. | Enumerate open text tabs, persist snapshots in workspace state, validate paths, clamp positions, report partial restore. |
| Quick Actions | Scope-first picker with “Beta/Experimental” labels and stale shortcut text. | Make it the IDE home: recent, current file, changes, workspace, continuity, setup, and recovery. |
| Coverage | Decorations and summaries exist; navigation/empty state are split across features. | Keep server-owned coverage; make overlay state, navigation, and no-data actions discoverable and keyboard-safe. |
| Setup health | Project health webview and Fix Setup exist. | Make the health result explicit: ready, attention, or blocked, with actionable recovery and output provenance. |
| Checklists | Existing tree, command, and diagnostics flows. | Present as IDE review aids; preserve enforcement ownership in the server. |
| Command palette/keybindings | Commands exist; most palette visibility is implicit; Quick Actions display differs from manifest. | Define the primary command contract in metadata and docs; remove conflicting or misleading shortcuts. |
| Status bar/sidebar | One status item and four views; status item often says “check” without telling the user what is ready. | Use readiness language and direct next action; improve view welcome copy and titles. |
| Walkthrough | Explains only the narrow beta and labels other useful workflows experimental. | Teach the full IDE loop, recovery, coverage navigation, privacy, and the enforcement boundary. |
| Interruption/error recovery | LSP startup, missing files, and failed restore paths are generic or silent. | Preserve recoverable state, expose partial outcomes, and link failures to setup/log/reload actions. |
| Accessibility | Native Quick Picks and tree views are available; webviews use theme variables but contain emoji labels and dense custom cards. | Use text labels/icons as supplemental, preserve keyboard flow, add semantic headings/labels, and avoid color-only meaning. |
| Telemetry/privacy | No sender or telemetry registration found. | State local-only behavior explicitly and persist only path/cursor metadata needed for recovery. |
| Packaging/install/update | Bundled server and `.vscodeignore` exist; the final local package and isolated install are now verified. | Keep reproducible package verification and version/update notes; marketplace identity/publishing remains owner-gated. |

## Baseline release evidence

The documented root integration lane is:

```text
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm package
```

The worktree-local frozen install was not portable because the lockfile referenced a sibling path outside this generated worktree (`eslint-plugin-anti-slop`). The bounded repair used for this audit was `pnpm install --lockfile=false`; it did not modify `pnpm-lock.yaml`. A fresh-clone release claim remains conditional until the dependency topology is repaired or verified in a canonical checkout.

The follow-up ESLint migration closes the remaining local compatibility warning. Root and package linting now use ESLint 9.39.5 flat configs, `@eslint/js@9.39.5`, and `typescript-eslint@8.67.0`; package lint reports zero errors, and the anti-slop peer resolves to ESLint 9. The development-only client lint config is excluded from the VSIX.

## Installed proof record

- Package: `packages/vscode-client/pre-cr-suite-0.2.0.vsix` (9 files, approximately 4.72 MB), rebuilt after the final source change; the development-only lint config is excluded from the artifact.
- VS Code: 1.133.0 arm64, isolated user data under `/private/tmp/pre-cr-suite-ide-5-6-user-data`.
- Continuity: capture notification reported `Saved 3 open file(s)`; the restore picker showed two entries with `3 open file(s)`; Full Restore reopened the saved files; after a clean app restart, Quick Actions retained `Restore Snapshot` as a recent action and the picker still showed both entries.
- Visual evidence: the final exact-package pass is recorded at `/private/tmp/pre-cr-suite-ide-5-6-final-exact-quick-actions.png`, `/private/tmp/pre-cr-suite-ide-5-6-final-exact-restore-picker.png`, `/private/tmp/pre-cr-suite-ide-5-6-final-exact-restore-mode.png`, and `/private/tmp/pre-cr-suite-ide-5-6-final-exact-full-restore.png`; earlier capture/restart evidence remains at `/private/tmp/pre-cr-suite-ide-5-6-installed-save-result-final.png`, `/private/tmp/pre-cr-suite-ide-5-6-full-restore-result.png`, and `/private/tmp/pre-cr-suite-ide-5-6-final-restart-snapshots.png`.
- The remote-debugging experiment was not used as evidence: the VS Code build did not retain the requested debug port. Mac Control foreground checks, screenshots, native menu inspection, and the installed UI itself were used instead.

## Guardrails

- Preserve the parent `dev` dirty patch; do not copy it wholesale or use it as proof.
- Keep snapshots local to the workspace state store. Never store file contents, credentials, or network identifiers.
- Keep core/LSP analysis authoritative. The client only adapts it to IDE interactions.
- Treat missing files and unavailable server state as partial outcomes, not successful restores.
- Prefer real installed dogfood; use deterministic fixtures only for edge cases such as a deleted file or out-of-range cursor.
- Do not publish, push, deploy, alter Pronto registry state, or mutate external services in this task.
