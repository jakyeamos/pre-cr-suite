# VS Code IDE modernization execution plan — Upgrading to 5.6

This plan is the durable execution record for the IDE surface. Status is updated as work lands.

## Strategy

Complete the product loop in vertical slices, starting with continuity because the open-tab loss is a live trust failure. Then make the shell and readiness language coherent, followed by coverage/setup/checklist recovery, and finally package/install/docs proof. Each slice must have source, tests, docs, machine-readable truth, and a direct installed check where the surface is visible.

## Phases

### Phase 0 — Truth and ownership

- **Status:** completed
- **Objective:** Establish current route, integration lane, dirty-work ownership, baseline commands, and installed runtime facts.
- **Affected systems:** Pronto route/doctor, Git worktrees, root package scripts, VS Code CLI.
- **Preserve:** parent `dev` dirty work and its active showcase patch.
- **Completion evidence:** `IDE_5_6_AUDIT.md` records observed/inferred/pending evidence and the exact worktree boundary.

### Phase 1 — Continuity and interruption recovery

- **Status:** completed
- **Objective:** Make Where Was I? and branch snapshots durable, tab-complete, safe, and honest about partial restore.
- **Affected systems:** `features/context.ts`, snapshot persistence seam, path validation, context tests, server export/import seam.
- **Behavior to preserve:** branch-specific snapshots, cursor-only/full restore choices, server summary generation.
- **Behavior to change:** enumerate every open text tab in every editor group; import/export through VS Code workspace state; validate paths; clamp positions; report skipped files.
- **Verification:** pure tab aggregation tests; server/core snapshot tests; packaged VSIX with three real tabs; restart and restore proof; missing-file fixture proof.
- **Rollback:** revert the client continuity slice; server snapshot contracts remain backward-compatible.

### Phase 2 — IDE shell and readiness language

- **Status:** completed
- **Objective:** Make Quick Actions, command palette, keybindings, status bar, sidebar, empty states, walkthrough, and dashboard speak as one product.
- **Affected systems:** `extension.ts`, `statusBar.ts`, `dashboard.ts`, `package.json`, walkthrough and view welcome metadata.
- **Behavior to preserve:** existing command IDs and the enforcement-owned commands.
- **Behavior to change:** remove beta/experimental split from primary IDE workflows; expose the next action from readiness state; align shortcut labels with metadata.
- **Verification:** package metadata assertions, UI-source tests where deterministic, installed command-palette/status-bar/sidebar walkthrough checks.
- **Rollback:** metadata and shell changes are independently revertible without changing LSP methods.

### Phase 3 — Coverage, setup health, and review recovery

- **Status:** completed
- **Objective:** Connect coverage overlays/navigation, setup health/fix flows, checklist results, and errors to actionable, keyboard-accessible recovery.
- **Affected systems:** coverage/checklist/pre-check features, error/notification utilities, dashboard, docs.
- **Behavior to preserve:** server-owned coverage/checklist analysis and shared `.pre-cr.json` behavior.
- **Behavior to change:** no-data states offer the right next action; partial/error results retain evidence and point to logs or setup; issue navigation is explicit.
- **Verification:** focused feature tests, root release gates, installed coverage fixture and missing-report scenarios.
- **Rollback:** retain existing commands and views while reverting presentation-only changes.

### Phase 4 — Privacy, packaging, release evidence, and project truth

- **Status:** completed
- **Objective:** Close privacy language, package/update evidence, user docs, planning state, and machine-readable status.
- **Affected systems:** README/docs, `.planning`, `.tracker`, `package.json`, VSIX inspection scripts or documented commands, status JSON.
- **Behavior to preserve:** no external publishing or telemetry.
- **Behavior to change:** docs describe the actual install/update/recovery flow and IDE/enforcement boundary; stale telemetry claim is removed.
- **Verification:** `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm package`; inspect VSIX contents; installed activation; `git diff --check`; route/doctor on canonical parent if needed.
- **Rollback:** docs/metadata can revert without touching runtime state; no external artifacts are published.

## Completion rule

The modernization is complete only when all phases are either completed with evidence or have an exact owner/external blocker recorded in `IDE_5_6_OWNER_QUESTIONS.md` and `IDE_5_6_STATUS.json`. A passing source build alone cannot close installed behavior.

## Completion evidence

Phases 0–4 are complete on the isolated branch. The canonical parent route/doctor is Ready, the final root gates pass, the final VSIX was installed in an isolated VS Code 1.133.0 profile, and three-file capture, persisted snapshot listing, Full Restore, and clean-restart persistence were directly observed. OQ-01 is the only remaining owner question and applies only to Marketplace publishing or an update channel.
