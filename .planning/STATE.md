# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** A developer should be able to run the same pre-CR workflow with reliable parity in both VS Code and Neovim.
**Current focus:** Phase 1 - Reconfirm Beta Contract

## Current Position

Phase: 1 of 3 (Reconfirm Beta Contract)
Plan: 0 of 2 in current phase
Status: Ready to plan
Last activity: 2026-04-10 - Initial GSD bootstrap created project planning docs

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: Stable

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Bootstrap]: Initialized GSD planning state for this brownfield repo

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-10 00:00
Stopped at: Planning baseline initialized
Resume file: None

### AIOS Adoption Backfill Update - 2026-06-26

- Phase 04 added: AIOS Format Gate Backfill.
- Phase 05 added: AIOS Server Simplification Gates, clustering complexity and thermo because both failures share `packages/server/src/server.ts`.
- Phase 06 added: AIOS Final Certification Gate.
- Phase 04 completed: formatter gate now passes.
- Phase 05 completed as a clustered phase: complexity and thermo gates both passed after splitting `packages/server/src/server.ts` into request modules.
- Phase 06 completed with final status `adopted_but_blocked`: adoption docs pass, no-UI exception accepted, but full runtime certification is blocked by test fixture hook isolation and anti-slop adapter compatibility.
- Source artifact pack: `AIOS-backfill/gate-adoption/phase29-pre-cr-suite-lsp-pilot-final-doc-pass-001`.
- Post-remediation artifact pack: `AIOS-backfill/gate-adoption/phase29-pre-cr-suite-lsp-post-remediation-001`.

### Release Prep Update - 2026-07-04

- Local npm/VSIX release prep completed without publishing, tagging, pushing, or changing remote state.
- Scoped package metadata now declares public npm publish access for `@pre-cr/core` and `@pre-cr/server`.
- Server publish output now excludes compiled tests; local tarball inspection confirmed `@pre-cr/server` packs runtime dist only and rewrites `@pre-cr/core` from `workspace:*` to `0.1.0`.
- VS Code VSIX packaging now excludes coverage artifacts while retaining the bundled server artifact.
- Verification passed: build, lint, typecheck, test, package, headless beta smoke, secret scan, validation, dependency audit, and npm pack inspection.
- Remaining release risks: npm scope ownership must be confirmed before first publish, and VS Code marketplace publisher ownership is separate from npm package ownership.

### Release Lint Cleanup Update - 2026-07-04

- Release-facing lint warnings were cleared across core and VS Code client surfaces without changing package names, versions, publish settings, tags, remotes, or registry state.
- VS Code client request/response handling now uses local typed interfaces instead of `any` at LSP/editor feature boundaries.
- Verification passed after cleanup: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test`.

### Pre-CR Hook Ownership Update - 2026-07-04

- `@pre-cr/server` now owns command-only git hook management for native hooks, Husky, Lefthook, and the Python pre-commit framework.
- Hook execution ports deterministic AIOS-style commit checks into TypeScript, requires `.pre-cr.json` for staged source commits, and then runs the existing staged Pre-CR readiness gate.
- `.pre-cr.json` now carries shared hook policy for default hook, per-rule `block`/`warn`/`off`, and optional local JSONL audit output.

### NPM Publish Wizard Update - 2026-07-04

- Added an interactive `scripts/npm-pre-cr-publish-wizard.sh` for the agreed publish path: create/verify the `pre-cr` npm org, publish `@pre-cr/core`, publish `@pre-cr/server`, and skip npm publishing `pre-cr-suite`.
- The wizard uses explicit human confirmation before irreversible publish steps and uses `--no-git-checks` so the intentionally ignored untracked `.quality-runner/` directory does not block publishing.
- The wizard now resumes cleanly after completed preflight work: it skips browser org creation when `pre-cr` is already visible, treats the completed local gates and package dry-runs as acknowledged, and uses the supported `pnpm pack/publish --filter ...` command shape.
- Package-local MIT license files were added for `@pre-cr/core` and `@pre-cr/server`; the wizard now uses project-pinned Corepack pnpm to pack into a temp directory, verify `LICENSE`, and inspect contents because pnpm 9 does not support `pack --dry-run`.

### NPM Publish Update - 2026-07-04

- `@pre-cr/core@0.1.0` was published by the user under the `pre-cr` npm org.
- `@pre-cr/server@0.1.0` was published from this workspace with `corepack pnpm publish --filter @pre-cr/server --access public --no-git-checks`.
- `npm access get status` reports both `@pre-cr/core` and `@pre-cr/server` as public; raw `npm view` registry metadata still returned 404 immediately after publish, consistent with first-publish propagation/index lag.
- `pre-cr-suite` remains intentionally unpublished to npm and should stay on the VS Code Marketplace/VSIX path.

### VS Code Marketplace Prep Update - 2026-07-04

- Production VSIX packaging now excludes source maps and clears stale map artifacts before bundling, reducing `pre-cr-suite-0.1.0.vsix` from 9 files / 8.85 MB to 7 files / 2.79 MB.
- Verified the candidate VSIX archive contains only `extension.js`, `server.js`, `README.md`, `package.json`, and license payload files.

### VS Code Marketplace Publish Wizard Update - 2026-07-04

- Added `scripts/vscode-marketplace-publish-wizard.sh` for the remaining first-publish path after the `jakye` Marketplace publisher was created.
- The wizard guides PAT creation with Marketplace Manage scope, runs `vsce login`/`verify-pat`, optionally reruns VS Code build/typecheck/test/package gates, inspects the exact `pre-cr-suite-0.1.0.vsix`, and requires an exact typed confirmation before `vsce publish`.
- The wizard publishes the existing VSIX artifact and intentionally avoids `vsce publish patch|minor|major` so package metadata is not auto-mutated and no version commit/tag is created.
