# VS Code IDE workflow contract

Status: source-verified candidate. Installed VSIX behavior is not yet proven.

This contract defines the smallest dependable standalone IDE subset. It does
not promote every registered Pre-CR command and does not depend on Anti-Slop or
Quality Runner.

## Dependable subset

| Responsibility | Commands | Required behavior |
| --- | --- | --- |
| Continuity | `Save Snapshot`, `Where Was I?`, `Restore Snapshot` | Save the current branch, visible files, active file, and cursor positions in workspace storage; re-import them after the bundled server restarts; restore only within the current workspace. |
| Navigation | `Quick Actions Menu` | Route directly to continuity, coverage, setup health, and the main Pre-CR check without requiring command-palette recall. |
| Visibility | `Refresh Coverage`, `Toggle Coverage Overlay`, `Show Summary`, `Check Changes Coverage` | Load configured coverage evidence and keep unsupported surfaces explicit. |
| Readiness | `Run Pre-CR Check`, `Fix Setup` | Run the shared changed-line gate or explain the repo/configuration prerequisite that prevents it. |

Checklist, documentation generation, review estimation, flaky-test reporting,
and debug capture remain experimental. They can appear in the extension, but
they are not required to explain or prove the standalone IDE workflow.

## Required failure behavior

- **No Git branch:** snapshot commands warn and do not create an unattributed
  snapshot.
- **No prior snapshot:** `Where Was I?` offers `Save Snapshot`; restore reports
  that no saved context exists.
- **Server restart:** stored snapshots are imported from VS Code workspace
  storage before the current branch is summarized.
- **Missing or stale file:** restoration continues for valid files and reports
  the skipped count; it never reports unconditional success.
- **Stale cursor:** line and character positions clamp to the current document
  bounds.
- **Outside-workspace path:** restoration rejects the path and keeps the
  failure visible.
- **Branch switch:** automatic capture is persisted before it can be relied on
  for a later return.

## Installed proof gate

Using a packaged VSIX in a disposable fixture repository:

1. open three files on a feature branch and place the cursor on a known line;
2. save a snapshot and confirm `Where Was I?` names the active file and its
   one-based line number;
3. restart the extension host and confirm the snapshot remains available;
4. restore the snapshot and verify the files, active editor, and cursor;
5. delete one saved file, move another cursor target beyond the new end of the
   file, and confirm partial restore plus cursor clamping;
6. switch branches and return, confirming automatic capture survives the
   bundled server process; and
7. move from `Where Was I?` to Quick Actions, coverage visibility, and a passing
   Pre-CR Check.

Source tests prove the storage, line-number, cursor-bound, and visible
partial-restore contracts. Only this installed workflow can promote the subset
from source-verified candidate to installed beta behavior.
