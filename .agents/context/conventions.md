---
id: pre-cr-suite-lsp.conventions
last_reviewed: 2026-07-28
---

# Coding and review conventions

- Keep TypeScript strict and make nullability explicit.
- Prefer typed protocol boundaries over `any`, casts, or duplicated client
  behavior.
- Keep gate decisions deterministic and explainable from loaded config and
  recorded checks.
- Add regression tests at the owning package and parity fixtures when a
  client-visible contract changes.
- Use existing naming, module boundaries, and formatting; do not introduce a
  framework or abstraction without a concrete consumer.
- Treat warnings as remediation work, not a reason to lower lint severity.
