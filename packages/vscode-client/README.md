# Pre-CR Suite for VS Code

Pre-CR Suite for VS Code is the first-class beta client for the coverage-first pre-PR workflow.

## Supported Beta Workflow

- `Pre-CR: Run Pre-CR Check`
- `Pre-CR: Refresh Coverage`
- `Pre-CR: Fix Setup`
- Coverage overlays, diagnostics, and summaries driven by repo config

The extension now bundles the Pre-CR language server artifact. VS Code users do not need a separate server install.

## IDE Continuity Candidate

The source-verified VS Code continuity subset is:

- `Pre-CR: Save Snapshot`
- `Pre-CR: Where Was I?`
- `Pre-CR: Restore Snapshot`
- `Pre-CR: Quick Actions Menu`

Snapshots persist in VS Code workspace storage and are imported when the
bundled server restarts. Missing or stale files are skipped with a visible
partial-restore warning. This subset is not promoted to installed beta proof
until the packaged VSIX passes the workflow in
[`docs/IDE_WORKFLOW.md`](../../docs/IDE_WORKFLOW.md).

## Repo Configuration

Place `.pre-cr.json` at the repo root:

```json
{
  "version": 1,
  "testCommand": "pnpm test -- --coverage",
  "coveragePaths": [
    "coverage/lcov.info"
  ],
  "coverageFormat": "auto",
  "threshold": 80,
  "excludePatterns": [
    "**/*.test.*",
    "**/*.spec.*"
  ],
  "checks": {
    "coverage": true,
    "security": true,
    "checklist": true
  }
}
```

Editor settings are presentation-only during beta. Use them for notification and overlay preferences, not repo behavior.

## Experimental Features

These features remain in the extension, but they are explicitly experimental during beta:

- Checklist and security flows outside the main coverage path
- Documentation generation
- Review estimation and flaky-test reporting
- Debug-session capture

## From Source

```bash
pnpm install
pnpm --filter @pre-cr/core build
pnpm --filter pre-cr-suite build
pnpm --filter pre-cr-suite package
```

The package command creates a VSIX that includes `dist/extension.js` and the bundled `dist/server.js`.
