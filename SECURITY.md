# Security and release boundaries

- Never commit credentials, tokens, private keys, `.env` files, transcripts,
  raw prompts, or private repository paths.
- Provider and registry credentials belong in the environment or the operating
  system credential store, never in repo configuration or artifacts.
- Treat `.pre-cr.json`, CI, hooks, package metadata, and LSP command handlers as
  approval-gated surfaces. Review changes to them manually.
- Run `corepack pnpm secret:scan` and `corepack pnpm dependency:security` before
  accepting a change that affects dependencies or release behavior.
- Publishing npm packages or VSIX artifacts is human-approved and must use the
  repository's explicit release wizards. No agent may publish, deploy, tag, or
  push as a side effect of tests.
- AIOS-compatible `.aios/audit/` output is non-authoritative compatibility
  evidence. It must not be used to grant permissions or bypass a gate.
