# Pre-CR Suite Modernization Audit

Date: 2026-07-10
Baseline: `459e09f` (`codex/beta-parity-fixture`)

## Executive conclusion

Pre-CR Suite has a credible product core: one repository-configured, changed-line
coverage workflow shared by VS Code, Neovim, and the headless CLI. That core is
already protected by build, typecheck, unit, package, headless, and server-artifact
parity checks.

The repository should not receive an indiscriminate stylistic refactor. It should
be rebuilt around the narrow public-beta promise. The recommended path is a
parallel v2 implementation with progressive vertical migration:

1. make the gate correct, reproducible, and safe for untrusted workspaces;
2. make one typed, versioned workflow contract authoritative;
3. rebuild the VS Code, Neovim, and CLI experiences around that contract; and
4. remove the legacy all-in-one suite rather than shipping it as an implicit
   second product.

There is no persistent service data or database to migrate. The material migration
constraints are repository configuration, public packages and executables, editor
commands, LSP methods, hook behavior, and users' CI integrations.

## Baseline evidence

### Repository and product shape

The repository is a pnpm/Turbo monorepo with three packages:

| Package | Current responsibility | Evidence |
| --- | --- | --- |
| `@pre-cr/core` | coverage parsing, config, gate execution, plus legacy checklist/docs/review/context/debug features | `packages/core/src/index.ts` |
| `@pre-cr/server` | LSP server, CLI, hooks, and audit output | `packages/server/src/server.ts`, `packages/server/src/cli.ts` |
| `pre-cr-suite` | VS Code extension and bundled LSP server | `packages/vscode-client/package.json` |

Neovim consumes the published server through a Lua client in
`packages/neovim-client/lua/pre-cr.lua`. The documented beta promise is limited
to Pre-CR Check, Refresh Coverage, Fix Setup, the headless JSON gate, and parity
between VS Code and Neovim (`README.md`, `docs/ROADMAP.md`).

### Commands run

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Blocked on a clean worktree | The root dependency `file:/Users/jakyeamos/projects/eslint-plugin-anti-slop` resolved to a nonexistent local path. A temporary symlink was used only to continue this isolated audit. |
| `pnpm build` | Pass | Builds core, server, and the VS Code extension. |
| `pnpm lint` | Pass | All three packages complete without lint errors. |
| `pnpm typecheck` | Pass | All three packages complete. |
| `pnpm test` | Pass | 376 tests: core 217, server 26, VS Code 133. |
| `pnpm test:headless-beta` | Pass | Headless beta fixture completed. |
| `pnpm test:beta-parity` | Pass | Bundled and published server artifacts matched against the parity fixture. |
| `pnpm package` | Pass | A VSIX was created at `packages/vscode-client/pre-cr-suite-0.1.0.vsix`. |
| `pnpm format:check`, `pnpm validation`, `pnpm dead-code` | Pass | Repository adoption gates complete. |
| `pnpm complexity:check`, `pnpm thermo-nuclear-simplification` | Pass | No source file exceeds the current gate; several files remain 500–874 lines. |
| `pnpm secret:scan`, `pnpm dependency:security` | Pass | No high-confidence secret or high/critical advisory found. |

The passing baseline is valuable, but it does not prove the first-class editor
workflows. There is no extension-host end-to-end suite, no Neovim integration
suite, and the parity smoke exercises raw LSP server artifacts rather than users'
commands, overlays, recovery actions, or setup experience.

## What is worth retaining

- The narrow beta positioning in `README.md` and `docs/ROADMAP.md`.
- A shared `.pre-cr.json` as the source of repository behavior.
- Structured project-health results and concrete recovery hints in
  `packages/core/src/beta/precheck.ts`.
- Machine-readable CLI JSON with progress on stderr in `packages/server/src/cli.ts`.
- The separation of server request modules from `packages/server/src/server.ts`.
- The existing fixture strategy for headless and bundled-versus-published server
  parity.
- Explicit hook installation rather than installation-time Git mutation.

## Findings

### P1 — correctness, safety, and release blockers

#### The gate can falsely pass changed production code without coverage

`packages/core/src/runner/coverageChecker.ts` only fails missing coverage for a
new file. A modified existing file with no coverage entry can be omitted, and a
changed line missing from the report is treated as skipped without reading source
to prove that it is blank or comment-only. This can produce a passing result for
uncovered production changes. The current test coverage protects the new-file case
but not the modified-file or missing-line cases.

**Target:** fail closed for missing or ambiguous source coverage; only skip a line
after a shared source classifier proves it is non-executable.

#### Workspace configuration has unbounded filesystem and process authority

`resolveProjectPath` in `packages/core/src/beta/config.ts` accepts absolute and
parent-directory paths. Configured coverage, audit, and request paths can escape
the workspace, and `testCommand`, coverage adapters, and quality adapters execute
repository-supplied commands. VS Code activates without checking
`workspace.isTrusted`.

**Target:** treat repository config as executable, untrusted input until a user
trusts the workspace; canonicalize with `realpath`, reject paths outside the
workspace, and use one validated process runner with cancellation, limits, and
process-tree cleanup.

#### A clean external install is not reproducible

The root `package.json` depends on a machine-local `file:` dependency at
`/Users/jakyeamos/projects/eslint-plugin-anti-slop`. A clean clone or external CI
machine cannot install without recreating that path.

**Target:** publish or package the required plugin normally, or replace it with a
reproducibly resolved dependency. The release gate must install in a fresh
environment with no developer-local links.

#### The primary VS Code workflow is not internally coherent

The beta walkthrough invokes `preCr.quickCoverageCheck`, but that action only
updates partial state and displays a notification. Legacy `preCr.loadCoverage`
performs overlay, status-bar, context, and tree refresh work. The default activity
bar and dashboard still foreground Checklist, Security, Debug, Docs, Context, and
Flaky Tests even though they are declared experimental.

**Target:** one visible readiness loop—Setup → Run → Diagnose → Fix → Rerun—with
Run Check, Refresh Coverage, and Fix Setup as the primary surface. Experimental
features must not compete with, or silently alter, the beta workflow.

#### Neovim does not meet its advertised first-class onboarding

The Neovim README says `require('pre-cr').setup()` supplies default mappings, but
the implementation only installs mappings when passed an options table. A clean
headless check found `:PreCrCheck` but not the documented `<leader>cc` mapping.

**Target:** one tested default `setup()` path, durable result output, the same
decision vocabulary as VS Code, and supported remediation actions.

#### UI recovery actions may become inert

The notification helper intentionally races action selection against a timeout.
Native notifications can remain visible after the function stops awaiting their
result, so a visible “Fix Setup” action can no longer trigger recovery.

**Target:** do not use expiring notifications for indispensable actions; route
recovery through durable commands, a readiness view, or a result buffer.

### P2 — architecture, contracts, and product debt

#### The public core is a catch-all implementation package

`@pre-cr/core` exports parsing, config, runner, protocol, checklist, docs, review,
context, and debug features from one public entrypoint. It has no explicit
`exports` map. Domain, LSP-shaped, and runner implementation types import each
other, making the public boundary unclear and easy to break.

**Target:** separate dependency-free domain types, versioned contracts, and
workspace/process orchestration. Publish an explicit, intentionally small API.

#### The stable beta contract is not the server's actual contract

`packages/core/src/protocol.ts` types six beta methods, while the server registers
roughly 49 custom methods unconditionally. VS Code maintains a separate partial
method union and also makes untyped calls; feature-specific response types are
duplicated.

**Target:** one versioned registry with runtime validation, generated/typed client
calls, and distinct stable and experimental namespaces.

#### Coverage semantics and diagnostics have more than one owner

The server, gate, and VS Code client each resolve coverage paths differently. The
server publishes coverage diagnostics and VS Code adds its own after a gate run.
The VS Code “Check Changes Coverage” action calculates whole-file rates rather
than calling the changed-line gate.

**Target:** a workspace-scoped coverage index and path resolver; the engine owns
gate semantics and the server owns diagnostics; clients only render returned
state.

#### LSP is presented as generic but implemented as one global workspace

The server selects the first workspace folder, stores global coverage state, and
only logs workspace-folder changes. Basename fallback can attribute coverage to a
different same-named file.

**Target:** a per-workspace session map, canonical URI/path identity, and explicit
multi-root behavior before generic-LSP support is claimed.

#### VS Code builds a second server artifact

The extension bundles `../server/src/server.ts` directly instead of packaging the
published server artifact. The parity smoke detects divergence but does not remove
the cause.

**Target:** the server package owns one portable artifact; VS Code packages that
exact artifact.

#### Configuration and docs create false guarantees

`checks.coverage`, `checks.security`, and `checks.checklist` are parsed and
documented but have no gate consumer. VS Code presents a threshold setting despite
the gate taking that value from `.pre-cr.json`. `docs/LSP_ARCHITECTURE.md` describes
nonexistent paths and unsupported capabilities, while `docs/CODE_AUDIT.md` has
conflicting historical test counts.

**Target:** remove unsupported settings and stale evidence; derive contract and
configuration reference documentation from the runtime schema and tested fixtures.

#### Execution and parsing are not bounded enough for a workspace tool

Coverage parsing reads whole files synchronously; coverage and quality adapters do
not have time or output limits; test execution captures unbounded output and stops
only its direct child.

**Target:** bounded streaming parsers, cancellable process groups, output limits,
and deterministic cleanup.

#### Verification is incomplete and CI does not reproduce local policy

CI omits headless beta parity, secret scanning, dependency audit, and editor-host
integration. It pins pnpm 9 while the repository declares pnpm 11.7.0.

**Target:** a fresh-install release job that uses the declared package manager,
then proves CLI, packaged VSIX, and Neovim workflows in addition to unit tests.

## External contracts and migration constraints

| Contract | Required treatment |
| --- | --- |
| `.pre-cr.json` version 1 | Parse compatibly during a documented transition; validate and offer a deterministic version-2 migration. |
| `pre-cr` CLI / `--json` | Preserve executable discovery and machine-readable output or ship an explicit major-version migration guide. |
| `pre-cr-server` | Preserve stdio startup and document any protocol-version negotiation. |
| VS Code commands and settings | Retain the three beta commands, migrate legacy command IDs temporarily only where useful, and remove settings that do not affect behavior. |
| Neovim commands and mappings | Preserve the beta commands and make setup/mapping behavior explicit and testable. |
| LSP requests | Version wire methods and provide a short-lived adapter only for publicly documented beta methods. |
| Git hooks | Never mutate a repository without an explicit user command; keep uninstallation reversible. |
| AIOS audit output | Keep it non-blocking and workspace-contained, or explicitly remove it from the product contract. |

## Scorecard

Scores are 1 (weak) to 5 (strong), based on the evidence above.

| Dimension | Current | Target | Evidence and rationale |
| --- | ---: | ---: | --- |
| Product coherence | 2 | 5 | A clear beta promise exists, but the default UI ships a competing legacy suite. |
| Correctness and data integrity | 2 | 5 | Gate false-pass paths and inconsistent scope semantics affect the core promise. |
| Architectural coherence | 2 | 5 | Direction is sensible, but core/contract/transport ownership is entangled. |
| Maintainability | 2 | 4 | Large mixed-responsibility files and broad exports obscure safe changes. |
| Testability | 3 | 5 | 376 tests pass, but first-class editor workflows and boundary failures lack end-to-end coverage. |
| Security and privacy | 2 | 5 | Workspace escape and arbitrary config execution lack a trust boundary. |
| UI quality and accessibility | 2 | 5 | Recovery and primary workflow are inconsistent; durable accessible result surfaces are needed. |
| Performance | 3 | 4 | Streaming work exists, but the active paths still use synchronous/unbounded operations. |
| Operability | 2 | 5 | Strong local commands but weak clean-install and release proof. |
| Developer experience | 2 | 5 | The local dependency and pnpm-version split prevent reliable onboarding. |
