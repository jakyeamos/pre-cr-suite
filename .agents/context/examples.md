---
id: pre-cr-suite-lsp.examples
last_reviewed: 2026-07-28
---

# Good implementation examples

- Shared coverage and gate logic belongs in `packages/core` and is consumed by
  both clients.
- A server command should expose one typed core result and preserve stable JSON
  output for headless automation.
- A client command should render the server result without changing pass,
  warn, or block semantics.
- A behavior change should include a focused package regression and a
  cross-client fixture when parity is part of the contract.
- A release change should be validated by package dry-run inspection and the
  repository's explicit smoke tests.
