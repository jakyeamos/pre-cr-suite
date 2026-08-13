# Owner-question ledger — Upgrading to 5.6

This ledger contains only decisions that materially require Jakye. Mechanical implementation choices are not owner questions.

| ID | Decision | Current recommendation | Why owner input is required | Status |
| --- | --- | --- | --- | --- |
| OQ-01 | Marketplace identity and publishing | Keep `publisher: jakye` and package locally; do not publish in this task. Confirm the Marketplace publisher/account and release owner before any publish or update channel is enabled. | Publisher identity and external release authority cannot be inferred from the repository URL. | **Blocking only for external publish; runtime/package proof unblocked.** |
| OQ-02 | Product boundary | Treat continuity, setup health, coverage presentation/navigation, checklist, and recovery as first-class VS Code IDE workflows while the LSP/CLI remains the enforcement authority. | This is a product positioning decision, not a mechanical refactor. | **Resolved by the current request.** |
| OQ-03 | Privacy default | Keep telemetry/network collection absent; persist only local path/cursor metadata needed for workspace recovery. | Changing this would require an explicit privacy and release decision. | **Resolved conservatively; no external data path added.** |

No other owner decision is required to complete the local implementation, tests, documentation, or packaged installed proof.
