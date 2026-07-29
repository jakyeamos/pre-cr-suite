---
id: pre-cr-suite-lsp.commands
last_reviewed: 2026-07-28
---

# Commands

Use `corepack pnpm` so `packageManager` controls the runtime.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm run coverage
corepack pnpm build
corepack pnpm package
corepack pnpm test:headless-beta
corepack pnpm test:beta-parity
node scripts/check_environment_contract.mjs
corepack pnpm secret:scan
corepack pnpm dependency:security
```

The full `pre-pr` script is the integration sequence. Run focused package
tests while iterating, then rerun the full sequence before handoff.
