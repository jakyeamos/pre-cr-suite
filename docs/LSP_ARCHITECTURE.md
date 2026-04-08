# Pre-CR Suite: LSP Architecture

## Overview

This document describes the Language Server Protocol (LSP) architecture for Pre-CR Suite, enabling cross-IDE support for coverage visualization, documentation generation, and pre-review checklists.

---

## What is LSP?

The Language Server Protocol is a JSON-RPC based protocol that standardizes communication between code editors and language tooling. Instead of building N plugins for N editors, you build:

- **1 Language Server** (the brains)
- **N thin clients** (editor-specific wrappers)

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDITORS (Clients)                        │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤
│ VS Code  │  Neovim  │ JetBrains│ Sublime  │  Emacs   │   Zed   │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬────┘
     │          │          │          │          │          │
     │    JSON-RPC over stdio/TCP/WebSocket      │          │
     │          │          │          │          │          │
┌────▼──────────▼──────────▼──────────▼──────────▼──────────▼────┐
│                    PRE-CR LANGUAGE SERVER                       │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Coverage  │  │     Doc     │  │    Pre-Review           │ │
│  │   Provider  │  │  Generator  │  │    Checklist            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     @pre-cr/core                         │   │
│  │   • lcovParser  • istanbulParser  • validation  • types │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure (Monorepo)

```
pre-cr-suite/
├── packages/
│   ├── core/                    # Shared parsing & types
│   │   ├── src/
│   │   │   ├── parsers/
│   │   │   │   ├── lcov.ts
│   │   │   │   └── istanbul.ts
│   │   │   ├── validation/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   ├── package.json         # @pre-cr/core
│   │   └── tsconfig.json
│   │
│   ├── server/                  # LSP Server
│   │   ├── src/
│   │   │   ├── server.ts        # Entry point
│   │   │   ├── capabilities.ts  # What we support
│   │   │   ├── providers/
│   │   │   │   ├── coverage.ts
│   │   │   │   ├── documentation.ts
│   │   │   │   └── checklist.ts
│   │   │   └── handlers/
│   │   │       ├── initialize.ts
│   │   │       ├── textDocument.ts
│   │   │       └── custom.ts    # Our custom methods
│   │   ├── package.json         # @pre-cr/server
│   │   └── tsconfig.json
│   │
│   ├── vscode-client/           # VS Code extension (thin client)
│   │   ├── src/
│   │   │   └── extension.ts
│   │   ├── package.json         # pre-cr-suite (marketplace)
│   │   └── tsconfig.json
│   │
│   ├── neovim-client/           # Neovim configuration
│   │   ├── lua/
│   │   │   └── pre-cr.lua
│   │   └── README.md
│   │
│   └── jetbrains-client/        # JetBrains plugin (future)
│       └── README.md
│
├── package.json                 # Workspace root
├── pnpm-workspace.yaml          # Monorepo config
└── turbo.json                   # Build orchestration
```

---

## LSP Capabilities

### Standard LSP Features We'll Use

| Feature | Use Case |
|---------|----------|
| `textDocument/didOpen` | Load coverage for opened file |
| `textDocument/didSave` | Refresh coverage after save |
| `textDocument/didClose` | Cleanup resources |
| `textDocument/publishDiagnostics` | Show uncovered lines as warnings |
| `textDocument/hover` | Show execution count on hover |
| `textDocument/codeLens` | Show coverage % above functions |
| `textDocument/codeAction` | "Generate documentation" action |

### Custom Methods (Pre-CR Specific)

LSP allows custom methods prefixed with `$/`. We'll define:

```typescript
// Request: Get coverage decorations for a file
interface CoverageDecorationsParams {
  textDocument: TextDocumentIdentifier;
}

interface CoverageDecorationsResponse {
  decorations: CoverageDecoration[];
}

interface CoverageDecoration {
  range: Range;
  status: 'covered' | 'uncovered' | 'partial';
  executionCount: number;
  branches?: BranchInfo[];
}

// Notification: Coverage data changed
interface CoverageChangedParams {
  uri: string;
  summary: CoverageSummary;
}

// Request: Generate documentation
interface GenerateDocParams {
  textDocument: TextDocumentIdentifier;
  range: Range;  // Selected function
  style: 'jsdoc' | 'tsdoc' | 'google' | 'numpy';
}

interface GenerateDocResponse {
  documentation: string;
  insertPosition: Position;
}

// Request: Get pre-review checklist
interface ChecklistParams {
  textDocument: TextDocumentIdentifier;
}

interface ChecklistResponse {
  items: ChecklistItem[];
}
```

---

## Communication Flow

### Initialization

```
Client                                    Server
  │                                         │
  │──── initialize ────────────────────────►│
  │     {capabilities: {...}}               │
  │                                         │
  │◄─── initialize response ────────────────│
  │     {capabilities: {                    │
  │       hoverProvider: true,              │
  │       codeLensProvider: true,           │
  │       codeActionProvider: true,         │
  │       experimental: {                   │
  │         coverageProvider: true          │
  │       }                                 │
  │     }}                                  │
  │                                         │
  │──── initialized ───────────────────────►│
  │                                         │
```

### Coverage Flow

```
Client                                    Server
  │                                         │
  │──── textDocument/didOpen ──────────────►│
  │     {uri: "file:///src/index.ts"}       │
  │                                         │
  │                    ┌────────────────────┤
  │                    │ Parse coverage     │
  │                    │ for this file      │
  │                    └────────────────────┤
  │                                         │
  │◄─── $/preCr/coverageDecorations ────────│
  │     {decorations: [...]}                │
  │                                         │
  │◄─── textDocument/publishDiagnostics ────│
  │     {diagnostics: [uncovered lines]}    │
  │                                         │
```

### File Watcher Flow

```
Client                                    Server
  │                                         │
  │         [coverage/lcov.info changes]    │
  │                                         │
  │◄─── $/preCr/coverageChanged ────────────│
  │     {uri: "...", summary: {...}}        │
  │                                         │
  │──── $/preCr/getCoverageDecorations ────►│
  │                                         │
  │◄─── response ───────────────────────────│
  │                                         │
```

---

## Implementation Details

### @pre-cr/core

The core package is pure TypeScript with zero editor dependencies:

```typescript
// packages/core/src/index.ts
export { parseLcovFile, parseLcovContent } from './parsers/lcov';
export { parseIstanbulFile, parseIstanbulContent } from './parsers/istanbul';
export { validateCoverageFile, validateSourcePath } from './validation';
export * from './types';

// No vscode imports!
// No LSP imports!
// Just pure parsing logic
```

### @pre-cr/server

The server uses `vscode-languageserver` (works with any LSP client, not just VS Code):

```typescript
// packages/server/src/server.ts
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CoverageProvider } from './providers/coverage';

// Create connection (stdio, TCP, or WebSocket)
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Our providers
let coverageProvider: CoverageProvider;

connection.onInitialize((params: InitializeParams) => {
  const workspaceRoot = params.workspaceFolders?.[0]?.uri;
  coverageProvider = new CoverageProvider(workspaceRoot);
  
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      codeLensProvider: { resolveProvider: true },
      codeActionProvider: true,
      // Custom capability
      experimental: {
        coverageProvider: true
      }
    }
  };
});

// Handle custom coverage request
connection.onRequest('$/preCr/getCoverageDecorations', async (params) => {
  return coverageProvider.getDecorations(params.textDocument.uri);
});

// Standard LSP: Hover shows execution count
connection.onHover((params) => {
  const coverage = coverageProvider.getLineCoverage(
    params.textDocument.uri,
    params.position.line
  );
  
  if (!coverage) return null;
  
  return {
    contents: {
      kind: 'markdown',
      value: `**Coverage:** ${coverage.executionCount} executions`
    }
  };
});

documents.listen(connection);
connection.listen();
```

### VS Code Client (Thin)

```typescript
// packages/vscode-client/src/extension.ts
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  // Path to server module
  const serverModule = context.asAbsolutePath(
    'node_modules/@pre-cr/server/out/server.js'
  );
  
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc }
  };
  
  const clientOptions: LanguageClientOptions = {
    // Activate for all files (coverage applies to any language)
    documentSelector: [{ scheme: 'file' }],
    synchronize: {
      // Watch coverage files
      fileEvents: vscode.workspace.createFileSystemWatcher(
        '**/coverage/**'
      )
    }
  };
  
  client = new LanguageClient(
    'preCrSuite',
    'Pre-CR Suite',
    serverOptions,
    clientOptions
  );
  
  // Handle custom coverage decorations
  client.onReady().then(() => {
    client.onNotification('$/preCr/coverageChanged', (params) => {
      // Update decorations in VS Code
      applyCoverageDecorations(params);
    });
  });
  
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
```

### Neovim Client

```lua
-- packages/neovim-client/lua/pre-cr.lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- Register the Pre-CR server
configs.precr = {
  default_config = {
    cmd = { 'node', vim.fn.expand('~/.local/share/pre-cr/server.js'), '--stdio' },
    filetypes = { '*' },
    root_dir = lspconfig.util.root_pattern('package.json', '.git'),
    settings = {
      preCr = {
        coverage = {
          lcovPath = 'coverage/lcov.info'
        }
      }
    }
  }
}

-- Setup
lspconfig.precr.setup({
  on_attach = function(client, bufnr)
    -- Handle coverage decorations via extmarks
    if client.server_capabilities.experimental and
       client.server_capabilities.experimental.coverageProvider then
      
      vim.api.nvim_create_autocmd('BufEnter', {
        buffer = bufnr,
        callback = function()
          -- Request coverage decorations
          client.request('$/preCr/getCoverageDecorations', {
            textDocument = { uri = vim.uri_from_bufnr(bufnr) }
          }, function(err, result)
            if result then
              apply_coverage_extmarks(bufnr, result.decorations)
            end
          end)
        end
      })
    end
  end
})

-- Apply coverage as Neovim extmarks (virtual text, highlights)
local function apply_coverage_extmarks(bufnr, decorations)
  local ns = vim.api.nvim_create_namespace('pre-cr-coverage')
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  
  for _, dec in ipairs(decorations) do
    local hl_group = ({
      covered = 'PreCrCovered',
      uncovered = 'PreCrUncovered',
      partial = 'PreCrPartial'
    })[dec.status]
    
    vim.api.nvim_buf_add_highlight(
      bufnr, ns, hl_group,
      dec.range.start.line,
      dec.range.start.character,
      dec.range['end'].character
    )
  end
end

-- Define highlight groups
vim.api.nvim_set_hl(0, 'PreCrCovered', { bg = '#22c55e', blend = 15 })
vim.api.nvim_set_hl(0, 'PreCrUncovered', { bg = '#ef4444', blend = 25 })
vim.api.nvim_set_hl(0, 'PreCrPartial', { bg = '#f59e0b', blend = 20 })
```

---

## Diagnostics Strategy

LSP has built-in support for diagnostics (errors, warnings, info). We can use this for uncovered lines:

```typescript
// Server sends diagnostics for uncovered lines
connection.sendDiagnostics({
  uri: document.uri,
  diagnostics: uncoveredLines.map(line => ({
    range: {
      start: { line: line.number, character: 0 },
      end: { line: line.number, character: Number.MAX_VALUE }
    },
    severity: DiagnosticSeverity.Information,  // Not an error!
    source: 'pre-cr',
    message: `Line not covered by tests (0 executions)`,
    code: 'uncovered-line',
    tags: [DiagnosticTag.Unnecessary]  // Shows as faded
  }))
});
```

This automatically works in all editors - they already know how to display diagnostics!

---

## Build & Distribution

### Monorepo Setup (pnpm + Turbo)

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["out/**"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### Distribution Channels

| Package | Distribution |
|---------|--------------|
| `@pre-cr/core` | npm registry |
| `@pre-cr/server` | npm registry + standalone binary |
| VS Code client | VS Code Marketplace |
| Neovim client | GitHub (copy lua file) |
| JetBrains | JetBrains Marketplace |

### Standalone Server Binary

For users who don't use Node.js:

```bash
# Using pkg to create standalone binaries
npx pkg packages/server/out/server.js \
  --targets node18-linux-x64,node18-macos-x64,node18-win-x64 \
  --output dist/pre-cr-server
```

---

## Migration Plan

### Phase 1: Extract Core (Week 1)
1. Create monorepo structure
2. Move parsers, types, validation to `@pre-cr/core`
3. Ensure existing VS Code extension still works

### Phase 2: Build Server (Weeks 2-3)
1. Implement basic LSP server
2. Coverage decorations via custom method
3. Diagnostics for uncovered lines
4. Hover support

### Phase 3: Refactor VS Code Client (Week 4)
1. Convert to thin LSP client
2. Test all existing functionality works

### Phase 4: Neovim Support (Week 5)
1. Create Lua configuration
2. Test with common Neovim setups
3. Document installation

### Phase 5: Polish & Document (Week 6)
1. JetBrains plugin (basic)
2. Comprehensive docs
3. Installation scripts

---

## Testing Strategy

### Core Tests
- Unit tests for parsers (existing)
- No mocking needed (pure functions)

### Server Tests
- Integration tests with mock LSP client
- Use `vscode-languageserver-protocol` for test client

### End-to-End Tests
- VS Code: Use `@vscode/test-electron`
- Neovim: Headless Neovim with plenary.nvim
- JetBrains: Gradle test framework

---

## Success Metrics

| Metric | Target |
|--------|--------|
| VS Code feature parity | 100% |
| Neovim basic support | Coverage + hover |
| Server startup time | < 500ms |
| Memory usage | < 50MB |
| Response latency | < 100ms |

---

## References

- [LSP Specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig)
- [LSP4J (JetBrains)](https://github.com/eclipse/lsp4j)
