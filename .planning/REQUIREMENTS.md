# Requirements: pre-cr-suite-lsp

**Defined:** 2026-04-10
**Core Value:** A developer should be able to run the same pre-CR workflow with reliable parity in both VS Code and Neovim.

## v1 Requirements

### Public Beta

- [ ] **PCR-01**: Developer can run the core pre-CR check workflow in VS Code.
- [ ] **PCR-02**: Developer can run the same workflow with matching intent in Neovim.
- [ ] **PCR-03**: Coverage refresh and setup-fix flows remain stable while config logic evolves.
- [ ] **PCR-04**: Public-beta release gates pass from a clean clone.

## v2 Requirements

### Post-Beta Expansion

- **PCR-05**: Additional workflows can be added without eroding editor parity.
- **PCR-06**: Parity verification becomes more automated over time.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Broad expansion beyond the current beta workflow | The current value comes from doing a narrow workflow well. |
| Client-specific drift that weakens parity | The product promise depends on comparable behavior across editors. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PCR-01 | Phase 1 | Pending |
| PCR-02 | Phase 1 | Pending |
| PCR-03 | Phase 2 | Pending |
| PCR-04 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial GSD bootstrap*
