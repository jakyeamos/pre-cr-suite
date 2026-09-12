# Package-manager contract in commit hooks

The hook defaults to pnpm. A repository with an existing explicit npm contract
may retain it: the staged root package manifest must have the same exact npm
version as HEAD, and a regular staged npm lockfile (version 2 or 3) must match
its root package name and version. A conflicting pnpm or Yarn lockfile rejects
this specialization. Missing, malformed, unmerged, symlinked or unreadable
contract inputs retain the pnpm default. An initial commit or package-manager
migration requires separate policy reconciliation; staging a new declaration
does not grant itself an exception.

Contract selection reads the target Git index and HEAD, never an unstaged
manifest or an ancestor repository. Both documentation-only and source commit
routes use the result. Other package-manager commands and lockfiles remain
blocked according to the existing rule severity. Coverage, required adapters,
source policy, branch behavior and workspace trust are unchanged.

`pnpm run test:hook-package-contract` rebuilds core before running the tests.
The Compass proof binds the exact core source/configuration and hook import
closure so stale build output cannot certify changed source.

`packages/server/src/hooks/package-manager.test.ts` exercises real temporary Git
indexes and both hook routes, including mismatched locks, conflicting managers,
unstaged changes, symlinks, missing history and source-readiness failure. These
fixtures do not establish installed editor parity or authorize package changes.
The public CLI and bundled server must be rebuilt from reviewed source before a
consumer can rely on this repair; no package publication is implied.
