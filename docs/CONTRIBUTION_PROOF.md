# Contribution Proof

Contribution Proof is an experimental, read-only CLI workflow for turning a
change claim into a commit-bound evidence envelope before review. It does not
run tests, edit files, open a pull request, or authorize a merge. It checks that
the supplied evidence is complete enough for the declared risk and that the
manifest describes a clean, non-empty descendant diff.

Run it with a JSON manifest:

```bash
pre-cr proof --manifest contribution-proof.json --json --workspace /path/to/repo
```

Use `--manifest -` to read JSON from stdin. The command exits `0` for `pass` or
`warn`, `1` for `block`, and `2` for invalid CLI syntax. JSON output uses
`pre-cr-contribution-proof/v1` and includes `state`, `gateDecision`, Git binding,
per-claim coverage, unknowns, reviewer handoff, and explicit gaps.

## Manifest

```json
{
  "schemaVersion": 1,
  "risk": "high",
  "baseCommit": "0123456789abcdef0123456789abcdef01234567",
  "claims": [
    {"id": "proof-cli", "statement": "The CLI emits a commit-bound proof envelope."}
  ],
  "directObservations": [
    {
      "claimIds": ["proof-cli"],
      "procedure": "Run pre-cr proof against a clean committed branch.",
      "observed": "The output names the resolved base, HEAD, and changed files."
    }
  ],
  "automatedTests": [
    {"claimIds": ["proof-cli"], "command": "pnpm test", "result": "passed"}
  ],
  "negativeControls": [
    {
      "claimIds": ["proof-cli"],
      "method": "mutation",
      "change": "Remove the required automated evidence.",
      "expectedFailure": "The proof blocks.",
      "observedFailure": "The proof reported missing-automated-test."
    }
  ],
  "edgeCases": [
    {
      "claimIds": ["proof-cli"],
      "case": "The worktree is dirty.",
      "expected": "Commit binding blocks.",
      "observed": "The proof reported dirty-worktree."
    }
  ],
  "unknowns": [],
  "reviewerHandoff": {
    "summary": "Review the risk classification and evidence-to-claim mapping.",
    "focusAreas": ["Git binding", "negative control"],
    "reproductionSteps": ["pnpm test", "pre-cr proof --manifest contribution-proof.json --json"]
  }
}
```

Every evidence item names one or more claim IDs. Failed automated tests remain
visible but do not satisfy coverage. Evidence cannot refer to undeclared claims.
An unknown with `disposition: "blocking"` blocks; `accepted` produces a warning.

## Risk policy

| Risk | Required per claim | Additional behavior |
| --- | --- | --- |
| Low | A passed automated test or direct observation | Missing negative controls and edge cases warn |
| Medium | A direct observation and passed automated test | Blocking unknowns still block |
| High | Direct observation, passed automated test, negative control, and edge case | Every class is required |

The policy grades rigor instead of pretending all changes deserve the same
ceremony. It also keeps reviewer judgment explicit: the command verifies the
shape and Git binding of supplied evidence, not whether prose is truthful.

## Git binding

The manifest's full 40-character `baseCommit` must resolve to the same commit
reported in the envelope, be an ancestor of `HEAD`, and produce at least one
changed file. The worktree must be clean. This prevents a proof from silently
describing a different or still-changing diff.

Contribution Proof is CLI-only and exported from `@pre-cr/core/experimental`.
It does not imply VS Code, Neovim, or LSP parity and is not part of the public
beta support promise.
