# Pre-CR Suite for Neovim

The Neovim client is a first-class public-beta target for the shared coverage workflow.

## Install

Install the server:

```bash
pnpm add -g @pre-cr/server
```

Then install the Lua client.

### `lazy.nvim`

```lua
{
  "jakyeamos/pre-cr-suite",
  config = function()
    require("pre-cr").setup()
  end,
}
```

## Beta Commands

| Command | Purpose |
| --- | --- |
| `:PreCrCheck` | Run the full pre-check workflow |
| `:PreCrRefresh` | Refresh coverage from configured reports |
| `:PreCrSummary` | Show the current coverage summary |
| `:PreCrFixSetup` | Show repo setup issues and hints |
| `:PreCrReadiness` | Open the persisted readiness result and remediation steps |
| `:PreCrShow` | Show overlay highlights |
| `:PreCrHide` | Hide overlay highlights |

Default keymaps:

- `<leader>cc` runs `:PreCrCheck`
- `<leader>cr` runs `:PreCrRefresh`
- `<leader>ci` runs `:PreCrSummary`
- `<leader>cf` runs `:PreCrFixSetup`
- `<leader>cd` opens `:PreCrReadiness`

## Repo Configuration

Project behavior should live in `.pre-cr.json`:

```json
{
  "version": 1,
  "testCommand": "pnpm test -- --coverage",
  "coveragePaths": [
    "coverage/lcov.info"
  ],
  "coverageFormat": "auto",
  "threshold": 80,
  "excludePatterns": [
    "**/*.test.*",
    "**/*.spec.*"
  ],
  "checks": {
    "coverage": true,
    "security": true,
    "checklist": true
  }
}
```

### Trusting a repository

The default setup loads coverage information but does not execute commands from
the repository. After reviewing a workspace’s `.pre-cr.json`, explicitly opt
in with `require("pre-cr").setup({ trustedExecution = true })`. The shared
[configuration guide](../../docs/CONFIGURATION.md#trusting-repository-commands)
explains why this distinction exists across clients.

The Neovim client should match the VS Code beta flow when both point at the same repo config. Readiness state is stored under Neovim's state directory per workspace, so `:PreCrReadiness` remains available after notifications are dismissed or Neovim is restarted.
