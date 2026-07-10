# Pre-CR Suite Modernization Execution Plan

## Chosen strategy: parallel v2 with progressive migration

Use a parallel v2 implementation inside the existing monorepo, then migrate one
complete workflow slice at a time. This is preferred over a deep in-place refactor
because the current stable beta promise is narrow but the shipped legacy surface is
broad and entangled. It is preferred over a clean-cut rewrite because public
packages, commands, config, and editor integrations need a controlled transition.

Every milestone ends in a runnable repository and a releasable vertical slice.
There is no persistent database migration, but public contract and config migration
must be explicit and tested.

## Non-negotiable invariants

- Do not execute repository config commands before the relevant trust boundary is
  satisfied.
- Do not report a passing readiness decision when changed production code has no
  attributable coverage.
- Do not maintain two independent coverage calculations or diagnostic publishers.
- Do not ship a new client path that uses a different server artifact from the
  published CLI/server.
- Do not leave the old experimental surface active by default after the beta v2
  workflow becomes authoritative.
- Preserve a runnable, testable release path at each milestone boundary.

## Milestone map

| Milestone | Objective | Depends on |
| --- | --- | --- |
| M0 | Make installs and delivery proof reproducible | — |
| M1 | Make changed-line decisions correct and trust-aware | M0 |
| M2 | Introduce the v2 contract and multi-workspace engine | M1 |
| M3 | Migrate CLI, hooks, and server packaging to the engine | M2 |
| M4 | Rebuild VS Code around Pre-CR Readiness | M3 |
| M5 | Rebuild Neovim around the same readiness result | M3 |
| M6 | Remove or explicitly isolate legacy experimental features | M4, M5 |
| M7 | Cut over, harden, document, and release | M6 |

## M0 — Reproducible foundation

**Objective:** A fresh external clone can install, build, test, package, and run
the release checks without developer-local paths or version drift.

- **Affected systems:** root `package.json`, lockfile/workspace configuration,
  `.github/workflows`, package build scripts, release documentation.
- **Preserve:** pnpm/Turbo workflow, package names, current passing beta fixtures.
- **Intentionally change:** replace the absolute local anti-slop dependency with a
  reproducible package/version or vendor strategy; use Corepack and the declared
  pnpm version in CI; expand CI to run the actual release matrix.
- **Verification:** fresh temporary clone/install with no symlinks; `pnpm build`,
  `lint`, `typecheck`, `test`, `test:headless-beta`, `test:beta-parity`, `package`,
  secret scan, dependency scan; assert package artifacts contain no workspace-only
  paths.
- **Rollback:** retain the current release branch and lockfile tag; dependency
  replacement is reversible before package publication.
- **Delete:** the local absolute path dependency and any CI-specific package
  manager pin that conflicts with `packageManager`.
- **Likely failures:** unavailable registry/package publication, native build
  approvals, CI cache assumptions.
- **Completion criteria:** a clean machine can reproduce the entire release proof
  without `/Users/jakyeamos/...` or a manually created symlink.

## M1 — Correct, bounded, trust-aware gate

**Objective:** Produce one correct readiness decision before migrating UI or
protocols.

- **Affected systems:** coverage parsing/checking, config loading, path validation,
  process runner, changed-file collection, unit fixtures.
- **Preserve:** v1 `.pre-cr.json` behavior where it is safe, coverage formats,
  branch-aware gate policy, explicit hook installation.
- **Intentionally change:** fail closed for missing coverage on modified files and
  missing executable changed lines; classify only proven blank/comment lines as
  non-executable; parse Git paths with NUL-safe commands; reject realpath escapes;
  apply time/output/cancellation bounds to every repository process.
- **Verification:** focused tests for modified files, line attribution, renames,
  spaces/newlines in filenames, duplicate basenames, symlink escapes, absolute
  paths, adapter timeout/output cap, and process-tree cancellation. Run the whole
  baseline suite after each vertical slice.
- **Migration/rollback:** v1 config receives warnings for invalid/unsafe fields;
  explicit config migration preview precedes rewriting. Gate behavior can roll back
  by pinning the previous released server package while the v2 branch is fixed.
- **Delete:** duplicate ad-hoc path validators and unsafe command parsing once all
  consumers use the shared boundary.
- **Likely failures:** legitimate repositories depending on external coverage paths
  or permissive missing-line behavior. Address with explicit, documented config
  migration—not silent compatibility.
- **Completion criteria:** adversarial fixtures cannot yield a pass for missing
  changed-source coverage or escaped paths; every executed command has bounded
  lifecycle behavior.

## M2 — Versioned contract and workspace-session engine

**Objective:** Establish one authoritative domain, contract, and workspace owner.

- **Affected systems:** new `contracts` and `engine` boundaries, `@pre-cr/core`
  compatibility surface, LSP method registry, config/result schemas, server state.
- **Preserve:** documented beta method intent and existing CLI/server entrypoints
  through a temporary adapter.
- **Intentionally change:** model `ready`, `warning`, `blocked`, and
  `setup-needed`; introduce a per-workspace session map and canonical URI identity;
  create one coverage index; validate config and method payloads at runtime.
- **Verification:** schema fixture suite shared by all adapters; in-process LSP
  multi-root tests; coverage identity tests; public-export/package-boundary tests;
  compatibility tests for v1 config and documented beta methods.
- **Migration/rollback:** maintain a small, measured adapter for documented beta
  wire methods only; record adapter usage in tests and delete it at M7. No adapter
  is created for undocumented experimental methods.
- **Delete:** cyclic protocol/runner type imports, direct client method strings,
  basename coverage lookup, and global single-workspace server state.
- **Likely failures:** contract over-generalization and accidental new public APIs.
  Counter this with an explicit `exports` map and only five stable beta methods.
- **Completion criteria:** server, CLI, and both clients compile against the same
  registry and cannot independently reinterpret coverage or readiness state.

## M3 — One server artifact, CLI, and hooks

**Objective:** Make the engine observable and portable through the public server
package.

- **Affected systems:** `@pre-cr/server`, CLI output, hook runner/audit paths,
  package build, VSIX server-artifact staging.
- **Preserve:** `pre-cr`, `pre-cr-server`, JSON stdout discipline, explicit hook
  management, non-blocking audit output.
- **Intentionally change:** CLI adds explicit scope and state; user-facing text
  reflects warning versus block accurately; hooks invoke the same engine result;
  VS Code consumes the exact compiled server artifact that the package publishes.
- **Verification:** executable CLI matrix for both scopes and every decision;
  package contents inspection; hook install/status/run/uninstall fixture; bundled
  artifact hash/behavior test against the published server artifact.
- **Migration/rollback:** retain legacy command aliases only if a documented beta
  command needs them; reject hidden shell aliases. Revert by releasing the prior
  server package if external integrations need time to migrate.
- **Delete:** VS Code's source-level server bundling and duplicated CLI decision
  formatting.
- **Likely failures:** server artifact packaging path mistakes and changed exit
  semantics in CI. Mitigate with a published-fixture test before release.
- **Completion criteria:** CLI, hooks, published server, and VSIX all invoke the
  same engine implementation and produce the same contract fixture output.

## M4 — VS Code Pre-CR Readiness

**Objective:** Deliver the complete v2 loop in the primary editor client.

- **Affected systems:** extension activation/trust flow, commands, readiness view,
  diagnostics, status bar, coverage rendering, configuration UI, webview helper,
  VS Code tests.
- **Preserve:** the three beta command intents, basic coverage overlays, keyboard
  accessibility, and editor-native navigation.
- **Intentionally change:** replace the broad dashboard/activity-bar default with
  Pre-CR Readiness; merge Run/Refresh/Fix actions through the contract; make
  recovery durable; route all diagnostics through the server; remove settings that
  cannot affect policy.
- **Verification:** extension-host tests for untrusted workspace, first-run setup,
  ready/warning/blocked/setup-needed states, refresh updating overlays/status/tree,
  diagnostics ownership, stale-notification regression, keyboard focus, and mobile
  equivalent is not applicable to an editor extension.
- **Migration/rollback:** keep a short-lived legacy command alias where telemetry
  or documented help needs it; do not keep a parallel legacy dashboard. Revert by
  releasing the prior VSIX.
- **Delete:** legacy load/check path duplication, local second diagnostics
  collection, experimental activity-bar defaults, and timeout-driven critical
  actions.
- **Likely failures:** VS Code API lifecycle race conditions and extension-host
  test flakiness. Address with real lifecycle tests, not more mocked state tests.
- **Completion criteria:** a user can complete Setup → Run → Diagnose → Fix → Rerun
  without entering an experimental feature or seeing a stale result.

## M5 — Neovim readiness parity

**Objective:** Deliver the same complete loop in the second first-class client.

- **Affected systems:** Lua setup, LSP client routing, commands/mappings, results
  buffer/quickfix renderer, Neovim docs and headless tests.
- **Preserve:** `:PreCrCheck`, `:PreCrRefresh`, `:PreCrFixSetup`, supported server
  installation path, coverage highlights.
- **Intentionally change:** no-options `setup()` installs the documented defaults;
  durable result output replaces multiline-notification-only recovery; all client
  calls use the typed v2 contract.
- **Verification:** headless Neovim tests for default setup, mappings, every
  readiness state, quickfix/result contents, refresh behavior, and config
  remediation; shared contract fixtures must match the CLI and VS Code.
- **Migration/rollback:** preserve existing command names; keep old mappings only
  where they do not conflict. Revert via the prior server/client release.
- **Delete:** feature paths that call legacy experimental methods and duplicated
  presentation-only policy settings.
- **Likely failures:** differences across supported Neovim versions. Define and
  test an explicit minimum version before implementation.
- **Completion criteria:** headless acceptance tests prove the supported Neovim
  user journey rather than only raw LSP responses.

## M6 — Retire the hidden second product

**Objective:** Make the release surface match the documented beta scope.

- **Affected systems:** experimental core modules, server request handlers, VS
  Code features/commands/views/settings, docs, package exports, tests.
- **Preserve:** only features that have been intentionally promoted through the
  v2 contract and acceptance suite.
- **Intentionally change:** remove unpromoted checklist, docs, review, context,
  and debug capability from the default package and server. If a feature has
  genuine continuing value, move it into a separately versioned experimental
  package with an explicit opt-in.
- **Verification:** contract inventory reports only stable beta methods; package
  exports and VS Code contribution snapshots contain no stale feature; dead-code
  and dependency checks pass.
- **Migration/rollback:** publish a concise removal guide and a compatibility
  release window only for documented users. Do not retain hidden server handlers.
- **Delete:** all obsolete request modules, feature folders, commands, settings,
  snapshots, docs, and dependencies together with their legacy tests.
- **Likely failures:** internal consumers of undocumented methods. Detect them by
  repository search and a release-candidate feedback period rather than permanent
  shims.
- **Completion criteria:** the shipped product has one navigation model, one
  contract, and one user promise.

## M7 — Cutover and release hardening

**Objective:** Ship v2 with verified migration, operational evidence, and no
legacy implementation left underneath it.

- **Affected systems:** config migration, release docs, architecture docs, CI,
  package metadata/versioning, fixtures, changelog, rollout instructions.
- **Preserve:** reproducible install and all v2 contract fixtures.
- **Intentionally change:** activate v2 by default, remove the final adapters,
  update package versions according to the public contract impact, and replace
  stale architecture/audit documents.
- **Verification:** clean-clone release rehearsal; full CI matrix; packaged VSIX
  extension-host check; Neovim headless check; CLI/hook workflow; security and
  performance boundary tests; diff/dependency/export/command inventory; manual
  accessibility review of the readiness view.
- **Migration/rollback:** config migration runs as preview + explicit write and
  leaves a backup; retain the previous server/VSIX versions and document downgrade
  steps. No destructive config or hook action occurs automatically.
- **Delete:** temporary adapters, migration feature flags, stale audit claims,
  legacy docs, unused dependencies, and release-only workarounds.
- **Likely failures:** overlooked external config syntax or editor version
  compatibility. Mitigate with release-candidate fixtures and explicitly documented
  supported versions.
- **Completion criteria:** no confirmed P0/P1 and every P2 is fixed or explicitly
  accepted with an owner; all current docs describe the shipped architecture.

## Cutover checklist

1. Publish a release candidate with v1-config migration preview and stable v2
   contract documentation.
2. Run representative repositories through CLI, VS Code, and Neovim acceptance
   fixtures, including trusted/untrusted, missing coverage, warning, block, and
   config remediation cases.
3. Inspect the complete diff and package contents for legacy server source,
   duplicate diagnostics, direct untyped RPC, stale settings, local paths, and
   experimental commands.
4. Publish the server package and VSIX from the same verified commit.
5. Keep the previous versions available for rollback; do not auto-rewrite a
   user's config or hooks.

