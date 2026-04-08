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
| `:PreCrShow` | Show overlay highlights |
| `:PreCrHide` | Hide overlay highlights |

Default keymaps:

- `<leader>cc` runs `:PreCrCheck`
- `<leader>cr` runs `:PreCrRefresh`
- `<leader>ci` runs `:PreCrSummary`
- `<leader>cf` runs `:PreCrFixSetup`

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
    "security": false,
    "checklist": false
  }
}
```

The Neovim client should match the VS Code beta flow when both point at the same repo config.
