# `@pre-cr/rust-coverage-adapter`

Run a Rust test command with `-C instrument-coverage`, merge the generated
LLVM raw profiles with the matching `llvm-profdata`, and emit an LCOV report
for Pre-CR changed-line coverage.

The package uses the LLVM tools shipped by the selected Rust toolchain. It
does not install toolchains or coverage components automatically. Install the
matching tools once when needed:

```bash
rustup component add llvm-tools-preview --toolchain stable
```

Install the adapter in a Rust repository:

```bash
pnpm add --save-dev @pre-cr/rust-coverage-adapter
```

Then configure `.pre-cr.json`:

```json
{
  "version": 1,
  "testCommand": "pnpm exec pre-cr-rust-coverage --output coverage/lcov.info -- cargo test --workspace",
  "coveragePaths": ["coverage/lcov.info"],
  "coverageFormat": "lcov",
  "threshold": 80,
  "checks": {
    "coverage": true,
    "security": true,
    "checklist": true
  }
}
```

The command after `--` is executed without a shell. The adapter sets
`RUSTFLAGS` to include `-C instrument-coverage`, sets a unique
`LLVM_PROFILE_FILE` pattern using process and binary identifiers, disables
Cargo incremental compilation, merges all raw profiles, discovers executable
test objects under Cargo's target directory, and writes the requested LCOV
file.

Useful options:

- `--toolchain nightly` selects another rustup toolchain.
- `--target-dir PATH` handles a non-standard Cargo target directory.
- `--object PATH` explicitly selects an instrumented object; repeat it for
  multiple test binaries.
- `--ignore-filename-regex REGEX` excludes dependency or generated sources.
- `--keep-profiles` preserves raw profiles and merged profile data for
  diagnosis.

The adapter is intentionally a command-line package rather than a new Pre-CR
configuration schema. It can therefore be used as a repo's `testCommand` and
remain compatible with the existing editor and headless pipelines.
