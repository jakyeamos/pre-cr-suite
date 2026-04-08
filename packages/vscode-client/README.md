# Pre-CR Suite for VS Code

Pre-CR Suite for VS Code is the first-class beta client for the coverage-first pre-PR workflow.

## Supported Beta Workflow

- `Pre-CR: Run Pre-CR Check`
- `Pre-CR: Refresh Coverage`
- `Pre-CR: Fix Setup`
- Coverage overlays, diagnostics, and summaries driven by repo config

The extension now bundles the Pre-CR language server artifact. VS Code users do not need a separate server install.

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
    "security": false,
    "checklist": false
  }
}
```

Editor settings are presentation-only during beta. Use them for notification and overlay preferences, not repo behavior.

## Experimental Features

These features remain in the extension, but they are explicitly experimental during beta:

- Checklist and security flows outside the main coverage path
- Documentation generation
- Review estimation and flaky-test reporting
- Context snapshots
- Debug-session capture

## From Source

```bash
pnpm install
pnpm --filter @pre-cr/core build
pnpm --filter pre-cr-suite build
pnpm --filter pre-cr-suite package
```

The package command creates a VSIX that includes `dist/extension.js` and the bundled `dist/server.js`.
