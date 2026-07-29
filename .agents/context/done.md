---
id: pre-cr-suite-lsp.done
last_reviewed: 2026-07-28
---

# Definition of done

A change is complete when its owning package tests pass, strict typechecking
passes, lint/security checks pass, and the environment contract is green.
Changes to the pre-CR workflow also require coverage output, headless beta
smoke, and cross-client beta parity. Release or package changes additionally
require a clean dry-run artifact inspection. Document any intentionally
unsupported surface and retain the exact commands used as evidence.
