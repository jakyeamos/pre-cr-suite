---
id: pre-cr-suite-lsp.deployment
last_reviewed: 2026-07-28
---

# Deployment and rollback

The npm packages and VSIX are separate release surfaces. Build and inspect
artifacts locally before any human-approved publish. Do not tag, publish, or
deploy from an automated test. Roll back an npm or marketplace release by
publishing a reviewed patch or restoring the prior known-good artifact through
the provider's supported process; never rewrite Git history. If a server or
client release regresses parity, stop publication, retain the failing evidence,
and restore the previous artifact while the fix is reviewed.
