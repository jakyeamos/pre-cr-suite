# Pre-CR Suite Configuration Reference

Complete guide to all configuration options available in Pre-CR Suite.

## VS Code Settings

All settings are prefixed with `preCr.` in VS Code settings.

---

## Coverage Settings

### `preCr.coverage.autoLoad`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Automatically load coverage data when a coverage file is detected in the workspace.

### `preCr.coverage.searchPaths`
- **Type:** `string[]`
- **Default:** `["coverage/lcov.info", "coverage/coverage-final.json"]`
- **Description:** Paths to search for coverage files, relative to workspace root.

### `preCr.coverage.threshold`
- **Type:** `number`
- **Default:** `80`
- **Range:** `0-100`
- **Description:** Minimum coverage percentage required for Pre-CR Check to pass.

### `preCr.coverage.decorations.covered`
- **Type:** `string`
- **Default:** `"rgba(0, 255, 0, 0.1)"`
- **Description:** Background color for covered lines.

### `preCr.coverage.decorations.uncovered`
- **Type:** `string`
- **Default:** `"rgba(255, 0, 0, 0.1)"`
- **Description:** Background color for uncovered lines.

### `preCr.coverage.decorations.partial`
- **Type:** `string`
- **Default:** `"rgba(255, 255, 0, 0.1)"`
- **Description:** Background color for partially covered lines (e.g., branches).

---

## Security Settings

### `preCr.security.scanOnSave`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Automatically scan files for security issues on save.

### `preCr.security.excludePatterns`
- **Type:** `string[]`
- **Default:** `[]`
- **Description:** Glob patterns for files to exclude from security scans.

### `preCr.security.severity.high`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Report high severity security issues.

### `preCr.security.severity.medium`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Report medium severity security issues.

### `preCr.security.severity.low`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Report low severity security issues.

---

## Checklist Settings

### `preCr.checklist.autoRun`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Automatically run checklist on file save.

### `preCr.checklist.maxPrSize`
- **Type:** `number`
- **Default:** `500`
- **Range:** `50-5000`
- **Description:** Maximum lines changed before suggesting PR split.

### `preCr.checklist.maxFileSize`
- **Type:** `number`
- **Default:** `500`
- **Range:** `50-2000`
- **Description:** Maximum lines per file before flagging.

---

## Documentation Settings

### `preCr.docs.style`
- **Type:** `string`
- **Default:** `"jsdoc"`
- **Options:** `"jsdoc"`, `"tsdoc"`, `"google"`, `"numpy"`
- **Description:** Documentation style for generated docs.

### `preCr.docs.includeExamples`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Include example usage in generated documentation.

### `preCr.docs.filter.skipTrivialGettersSetters`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Skip simple getter/setter methods when generating docs.

### `preCr.docs.filter.skipSimpleFunctions`
- **Type:** `boolean`
- **Default:** `false`
- **Description:** Skip functions with low complexity.

### `preCr.docs.filter.complexityThreshold`
- **Type:** `number`
- **Default:** `3`
- **Range:** `1-20`
- **Description:** Cyclomatic complexity threshold for "simple" functions.

---

## Flaky Test Settings

### `preCr.flakyTests.enabled`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Enable flaky test detection.

### `preCr.flakyTests.threshold`
- **Type:** `number`
- **Default:** `0.8`
- **Range:** `0.5-1.0`
- **Description:** Pass rate below which a test is considered flaky.

### `preCr.flakyTests.minRuns`
- **Type:** `number`
- **Default:** `3`
- **Range:** `2-100`
- **Description:** Minimum test runs before calculating flakiness.

---

## Context Settings

### `preCr.context.autoCaptureOnBranchSwitch`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Automatically save context when switching branches.

### `preCr.context.autoRestoreOnBranchReturn`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Automatically restore context when returning to a branch.

---

## Debug Settings

### `preCr.debug.captureConsole`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Include console output in debug captures.

### `preCr.debug.maxBreakpointHits`
- **Type:** `number`
- **Default:** `100`
- **Range:** `10-1000`
- **Description:** Maximum breakpoint hits to record per session.

---

## Notification Settings

### `preCr.notifications.autoDismiss`
- **Type:** `boolean`
- **Default:** `true`
- **Description:** Automatically dismiss notifications after timeout.

### `preCr.notifications.successTimeout`
- **Type:** `number`
- **Default:** `3000`
- **Range:** `1000-10000`
- **Description:** Timeout in milliseconds for success notifications.

### `preCr.notifications.infoTimeout`
- **Type:** `number`
- **Default:** `5000`
- **Range:** `1000-15000`
- **Description:** Timeout in milliseconds for info notifications.

### `preCr.notifications.warningTimeout`
- **Type:** `number`
- **Default:** `8000`
- **Range:** `2000-20000`
- **Description:** Timeout in milliseconds for warning notifications.

### `preCr.notifications.errorTimeout`
- **Type:** `number`
- **Default:** `10000`
- **Range:** `3000-30000`
- **Description:** Timeout in milliseconds for error notifications.

---

## Project-Level Configuration

Create a `.pre-cr.json` file in your workspace root for project-specific behavior across editors:

```json
{
  "version": 1,
  "testCommand": "pnpm test -- --coverage",
  "coveragePaths": [
    "coverage/lcov.info",
    "coverage/coverage-final.json"
  ],
  "coverageFormat": "auto",
  "threshold": 80,
  "excludePatterns": [
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**"
  ],
  "checks": {
    "coverage": true,
    "security": false,
    "checklist": false
  }
}
```

### `.pre-cr.json` Options

| Option | Type | Description |
|--------|------|-------------|
| `version` | `1` | Config schema version for the public beta |
| `testCommand` | `string` | Custom command to run tests with coverage |
| `coveragePaths` | `string[]` | Ordered list of coverage report paths |
| `coveragePath` | `string` | Legacy alias accepted during beta; mapped to the first `coveragePaths` entry |
| `coverageFormat` | `"auto"` \| `"lcov"` \| `"istanbul"` | Coverage file format |
| `threshold` | `number` | Coverage threshold percentage |
| `excludePatterns` | `string[]` | Files to exclude from coverage checks |
| `checks` | `object` | Toggles for coverage/checklist/security flows |

During beta, `.pre-cr.json` owns project behavior. Editor settings should be used for presentation only.

---

## Keyboard Shortcuts

| Command | Windows/Linux | macOS | Description |
|---------|---------------|-------|-------------|
| Pre-CR Check | `Ctrl+Shift+T` | `⌘⇧T` | Run tests and check coverage |
| Toggle Coverage | `Ctrl+Shift+O` | `⌘⇧O` | Show/hide coverage overlay |
| Next Issue | `F8` | `F8` | Jump to next uncovered line |
| Previous Issue | `Shift+F8` | `⇧F8` | Jump to previous uncovered line |
| Quick Actions | Click status bar | Click status bar | Open quick actions menu |
| Dashboard | `Ctrl+Shift+B` | `⌘⇧B` | Open Pre-CR dashboard |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PRE_CR_LOG_LEVEL` | Set log level: `debug`, `info`, `warn`, `error` |
| `PRE_CR_DISABLE_TELEMETRY` | Set to `1` to disable anonymous usage stats |

---

## Troubleshooting

### Extension not activating

1. Ensure you have a supported file type open (TypeScript, JavaScript, Python, Go, Rust)
2. Or ensure your workspace contains a `coverage/` folder
3. Check Output panel → "Pre-CR Suite" for errors

### Coverage not loading

1. Run your tests with coverage first
2. Check that the coverage file exists in one of the repo `coveragePaths`
3. Verify coverage format is LCOV or Istanbul JSON, or leave `coverageFormat` on `auto`

### Pre-CR Check failing

1. Run `Fix Setup` to inspect config, test-command, git, and coverage-path readiness
2. Check the threshold setting matches your project standards
3. Verify your test command generates coverage output at one of the configured `coveragePaths`

### Status bar not visible

1. Check if status bar items are hidden (right-click status bar)
2. Reload VS Code window (`Developer: Reload Window`)
3. Check for errors in Developer Tools console
