---
id: pre-cr-suite-lsp.security
last_reviewed: 2026-07-28
---

# Security constraints

Keep secrets out of Git, logs, coverage, fixtures, and generated packages.
Review `.pre-cr.json`, hook settings, CI, package overrides, server command
execution, and publish scripts as approval-gated surfaces. Use the repository
secret scan and dependency security command. Network access belongs to package
installation, approved registries, and explicit release workflows; tests must
not publish, deploy, or push.

The current offline dependency audit reports one high transitive
`brace-expansion` advisory on legacy CommonJS `minimatch` consumers. Do not
apply a blanket override to `brace-expansion` 5.x: its module export shape is
not compatible with every older consumer. Track a parent-package upgrade or
compatibility patch, keep `dependency:security` required, and fail closed on
confirmed high advisories.
