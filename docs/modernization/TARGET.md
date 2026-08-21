# Pre-CR Suite Target System

## Product definition

Pre-CR Suite v2 is a trust-aware pre-PR readiness loop for a repository:

> **Set up coverage once, run one check, understand the decision, fix the right
> issue, and rerun with the same outcome in VS Code, Neovim, and automation.**

The product is not a general developer-productivity toolbox. Checklist, docs,
review estimation, context snapshots, and debug capture are not part of v2 unless
each later earns a separate typed contract, owner, parity plan, and release gate.

## Product principles

1. **One workflow, three clients.** The CLI is the automation surface; VS Code and
   Neovim are first-class interactive renderers of the same decision.
2. **Correctness before convenience.** Missing, ambiguous, or untrusted coverage
   cannot silently become a passing check.
3. **A repository controls policy, a user controls trust.** `.pre-cr.json` owns
   project policy only after the user has explicitly trusted executable config.
4. **One source of truth per concern.** One config schema, one coverage index, one
   decision engine, one protocol registry, and one packaged server artifact.
5. **Durable recovery beats ephemeral messaging.** A user can always return to the
   last decision, its scope, evidence, and next action.
6. **Experimental means isolated.** Unsupported features are neither activated nor
   promoted in the default beta experience.

## Target user journeys

### First use: Setup

1. The client detects a missing or invalid config without running repository
   commands.
2. It explains that the config can execute local commands and asks the user to
   trust the workspace before enabling execution.
3. A guided, workspace-root config action creates or repairs `.pre-cr.json` using
   a validated template.
4. The same health result is available in the CLI, a VS Code readiness view, and a
   Neovim result buffer/quickfix list.

### Daily use: Run

1. The user runs **Pre-CR Check** and selects or sees the explicit scope:
   `worktree` or `staged`.
2. The engine reports one of four states: `ready`, `warning`, `blocked`, or
   `setup-needed`. Every result includes scope, affected files, coverage evidence,
   policy failures, and exact next actions.
3. The CLI maps that result to a documented exit decision and emits a versioned
   JSON result. Editors show the same state without interpreting raw coverage on
   their own.

### Recovery: Diagnose, fix, rerun

1. A durable result surface links each issue to a specific remediation: create or
   open config, trust workspace, generate/read coverage, classify a surface, or
   inspect the failed command output.
2. **Refresh Coverage** refreshes the authoritative workspace state and every
   client surface that displays it.
3. After a fix, rerun updates the same result surface rather than leaving stale
   notifications or duplicate diagnostics behind.

## Interaction direction

### VS Code

The default product surface becomes **Pre-CR Readiness**:

```text
┌─────────────────────────────────────────────┐
│ Pre-CR Readiness                             │
│ [Ready / Warning / Blocked / Setup needed]   │
│ Scope: Worktree                              │
│                                             │
│ [Run Pre-CR Check] [Refresh Coverage]        │
│ [Fix Setup]                                  │
│                                             │
│ What changed / coverage / policy results     │
│ Next action with durable links               │
└─────────────────────────────────────────────┘
```

- The primary commands are Run Pre-CR Check, Refresh Coverage, and Fix Setup.
- The result view owns status, loading, empty, warning, error, and success states.
- Diagnostics come from the server only; the extension does not add a second
  competing diagnostic collection.
- Interactive fixes are commands or view actions, never actions that vanish with
  a notification timeout.
- Existing experimental views move behind an explicit experimental entrypoint or
  are removed at cutover.

### Neovim

- `require('pre-cr').setup()` works with no options and installs the documented
  commands/mappings deterministically.
- `:PreCrCheck`, `:PreCrRefresh`, and `:PreCrFixSetup` return the same status,
  scope, and next actions as the CLI.
- Results are durable in a buffer and/or quickfix list; notifications are concise
  status signals rather than the only recovery surface.

### CLI

- `pre-cr run --scope staged|worktree --json` is the automation contract.
- Human output says both the visible result and gate decision, avoiding “failed”
  wording for a warning-only feature branch.
- JSON is schema-versioned, bounded, and emitted only on stdout; progress and
  command output are structured or safely truncated on stderr.

## Target architecture

### Layering and ownership

```text
VS Code client ─┐
Neovim client ─┼─> versioned contract ─> workspace session engine ─> domain
CLI / hooks   ─┘                              │                       │
                                               └─> trusted process I/O ┘
```

| Layer | Responsibility | Must not own |
| --- | --- | --- |
| Domain | coverage model, source classification, changed-line evaluation, decision vocabulary | LSP, editor APIs, filesystem/process access |
| Contract | versioned config/result schemas, stable method registry, CLI JSON schema | editor-local state or domain implementation imports |
| Workspace session engine | canonical paths, config loading, coverage index, trust, process execution, per-root state | presentation formatting or client UI state |
| Server | LSP transport, diagnostics, workspace-session routing, CLI and hook adapters | alternate coverage calculation or local client state |
| Clients | render results, initiate explicit actions, editor-native navigation | policy calculation, path matching, duplicate diagnostics |

The implementation should introduce explicit `contracts` and `engine` package
boundaries. `@pre-cr/core` becomes a deliberately limited compatibility package
during migration, then is removed or renamed in the first appropriate major
release. The server package produces the only portable server artifact; the VS
Code package copies that artifact instead of bundling the server source again.

### Config, trust, and data ownership

- `.pre-cr.json` version 2 is parsed by a runtime schema and is the only policy
  source. Version 1 is read through a deterministic migration adapter during the
  transition.
- Editor settings are limited to presentation preferences. Any existing setting
  that appears to change the gate either becomes real policy in config or is
  removed.
- Every configured path is resolved with `realpath` and must remain inside the
  workspace root after symlink resolution. Client-supplied request paths receive
  the same validation.
- The engine tracks one session per workspace root. URI/path identity is canonical;
  basename matching is forbidden.
- A session exposes a single coverage index and a single current readiness result.

### Process and resource policy

- Repository commands do not run until the client establishes workspace trust; the
  CLI requires an explicit non-interactive acknowledgement when appropriate for
  automation.
- One process runner handles test commands, coverage adapters, quality adapters,
  hooks, timeout, cancellation, output caps, process-group teardown, and redacted
  diagnostics.
- Coverage parsing is streaming/bounded and validates format, size, and workspace
  ownership before use.

### Stable contracts

- Stable RPC and JSON types live in one versioned registry. Server handlers and
  clients consume generated or directly inferred types from that registry.
- Request and result payloads have runtime validation. Add one schema dependency
  (Zod) because TypeScript alone cannot validate config, CLI, or LSP data at the
  trust boundary; avoid additional validation libraries.
- Stable methods cover only health, run, refresh, summary, and file coverage.
  Experimental methods are a separately versioned, opt-in boundary or deleted.
- The CLI includes a `schemaVersion`, `state`, `gateDecision`, `scope`, and
  structured remediation payload rather than relying on text parsing.

### Security, observability, and errors

- Fail closed on missing coverage, path escape, invalid config, untrusted command
  execution, and unclassifiable changed source lines.
- Keep audit writes non-blocking and workspace-contained; do not let them alter a
  correctness decision.
- Emit structured, bounded events for command start/end/cancellation, config
  migration, and result state. Never put secrets or unlimited raw output in them.
- Webviews use a single secure renderer with CSP, nonce, escaping, no inline event
  handlers, keyboard navigation, and visible focus states.

## Testing and delivery strategy

| Level | Required proof |
| --- | --- |
| Domain | Missing-coverage, comments/blanks, rename, unusual filename, duplicate basename, surface classification, and decision truth tables. |
| Engine | Trust boundary, `realpath` escape, cancellation, output cap, timeout, config migration, and multi-root isolation. |
| Contract | Schema fixtures shared by CLI, LSP, VS Code, and Neovim. |
| Server/CLI | In-process LSP plus executable CLI tests for scope, JSON schema, and exit decisions. |
| VS Code | Extension-host test for setup, run, refresh, diagnostics, durable recovery, and packaged server artifact. |
| Neovim | Headless test for default setup, commands/mappings, results buffer, and response rendering. |
| Release | Fresh external install, build, package, headless gate, cross-client workflow fixtures, secret/dependency checks, and docs validation. |

CI uses Corepack and the package-manager version declared by the repository. It
runs the full release matrix rather than a smaller subset of local checks.

## Dependency direction

| Retain | Add | Remove at cutover |
| --- | --- | --- |
| TypeScript strict mode, pnpm, Turbo, Vitest, `vscode-languageserver`, esbuild | Zod for runtime schemas at config/contract boundaries | local absolute `file:` dependency; unowned/stale settings; duplicated server bundle; untyped legacy RPC; legacy experimental feature code unless explicitly graduated |

## Explicit non-goals

- Rebuilding every experimental feature before public beta.
- Adding a web application, database, telemetry service, or cloud account system.
- Supporting arbitrary editors beyond VS Code and Neovim before the two supported
  clients satisfy the workflow acceptance tests.
- Preserving undocumented internal APIs solely to reduce the diff.
