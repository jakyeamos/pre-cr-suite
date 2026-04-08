-- ============================================================================
-- Pre-CR Suite Neovim Client
-- ============================================================================
--
-- Installation:
-- 1. Install the Pre-CR server: npm install -g @pre-cr/server
-- 2. Copy this file to ~/.config/nvim/lua/pre-cr.lua
-- 3. Add to your init.lua: require('pre-cr').setup()
--
-- Requirements:
-- - Neovim 0.8+
-- - nvim-lspconfig (optional, for easier setup)
-- ============================================================================

local M = {}

-- Default configuration
M.config = {
  -- Path to the server executable
  cmd = { 'pre-cr-server', '--stdio' },
  
  -- Filetypes to activate on (empty = all files)
  filetypes = {},
  
  -- Server settings
  settings = {
    preCr = {
      coverage = {
        lcovPath = 'coverage/lcov.info',
        istanbulJsonPath = 'coverage/coverage-final.json',
        preferredFormat = 'auto',
        showDiagnostics = true,
        showCodeLens = true
      }
    }
  },
  
  -- Highlight groups
  highlights = {
    covered = { bg = '#22c55e', blend = 12 },
    uncovered = { bg = '#ef4444', blend = 25 },
    partial = { bg = '#f59e0b', blend = 20 }
  }
}

-- Namespace for extmarks
local ns = vim.api.nvim_create_namespace('pre-cr-coverage')

-- ============================================================================
-- Highlight Setup
-- ============================================================================

local function setup_highlights()
  vim.api.nvim_set_hl(0, 'PreCrCovered', M.config.highlights.covered)
  vim.api.nvim_set_hl(0, 'PreCrUncovered', M.config.highlights.uncovered)
  vim.api.nvim_set_hl(0, 'PreCrPartial', M.config.highlights.partial)
end

-- ============================================================================
-- Coverage Decorations
-- ============================================================================

local function apply_decorations(bufnr, decorations)
  -- Clear existing decorations
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  
  for _, dec in ipairs(decorations) do
    local hl_group = ({
      covered = 'PreCrCovered',
      uncovered = 'PreCrUncovered',
      partial = 'PreCrPartial'
    })[dec.status]
    
    if hl_group then
      vim.api.nvim_buf_add_highlight(
        bufnr,
        ns,
        hl_group,
        dec.range.start.line,
        dec.range.start.character,
        dec.range['end'].character
      )
    end
  end
end

-- ============================================================================
-- LSP Client Setup (Manual)
-- ============================================================================

local function setup_lsp_manual()
  local client_id = nil
  
  vim.api.nvim_create_autocmd('FileType', {
    pattern = '*',
    callback = function(args)
      -- Skip if already attached
      if client_id and vim.lsp.buf_is_attached(args.buf, client_id) then
        return
      end
      
      -- Start the client if not running
      if not client_id then
        client_id = vim.lsp.start({
          name = 'pre-cr',
          cmd = M.config.cmd,
          root_dir = vim.fn.getcwd(),
          settings = M.config.settings,
          on_attach = function(client, bufnr)
            -- Request coverage decorations
            local params = {
              textDocument = {
                uri = vim.uri_from_bufnr(bufnr)
              }
            }
            
            client.request('$/preCr/getCoverageDecorations', params, function(err, result)
              if not err and result and result.decorations then
                apply_decorations(bufnr, result.decorations)
              end
            end, bufnr)
          end
        })
      else
        -- Attach to new buffer
        vim.lsp.buf_attach_client(args.buf, client_id)
      end
    end
  })
end

-- ============================================================================
-- LSP Client Setup (nvim-lspconfig)
-- ============================================================================

local function setup_lsp_lspconfig()
  local lspconfig = require('lspconfig')
  local configs = require('lspconfig.configs')
  
  -- Register Pre-CR as a new LSP server
  if not configs.precr then
    configs.precr = {
      default_config = {
        cmd = M.config.cmd,
        filetypes = M.config.filetypes,
        root_dir = lspconfig.util.root_pattern('package.json', '.git', 'coverage'),
        settings = M.config.settings,
        on_attach = function(client, bufnr)
          -- Request coverage decorations when buffer is opened
          vim.api.nvim_create_autocmd('BufEnter', {
            buffer = bufnr,
            callback = function()
              local params = {
                textDocument = {
                  uri = vim.uri_from_bufnr(bufnr)
                }
              }
              
              client.request('$/preCr/getCoverageDecorations', params, function(err, result)
                if not err and result and result.decorations then
                  apply_decorations(bufnr, result.decorations)
                end
              end, bufnr)
            end
          })
        end
      }
    }
  end
  
  -- Start the server
  lspconfig.precr.setup({})
end

-- ============================================================================
-- Commands
-- ============================================================================

local function setup_commands()
  vim.api.nvim_create_user_command('PreCrCheck', function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({ name = 'pre-cr', bufnr = bufnr })

    if #clients == 0 then
      vim.notify('Pre-CR server not running', vim.log.levels.WARN)
      return
    end

    clients[1].request('$/preCr/runPreCrCheck', {}, function(err, result)
      if err then
        vim.notify('Pre-CR check failed: ' .. err.message, vim.log.levels.ERROR)
        return
      end

      if not result or not result.result then
        vim.notify('Pre-CR check returned no result', vim.log.levels.WARN)
        return
      end

      local check = result.result
      if check.coverageCheck then
        local summary = string.format(
          'Coverage %.1f%% (%d/%d changed lines covered)',
          check.coverageCheck.coveragePercent,
          check.coverageCheck.summary.coveredLines,
          check.coverageCheck.summary.totalChangedLines
        )
        vim.notify(summary, check.coverageCheck.passed and vim.log.levels.INFO or vim.log.levels.WARN)
      else
        vim.notify('Pre-CR check completed without a coverage result. Run :PreCrFixSetup for details.', vim.log.levels.WARN)
      end
    end, bufnr)
  end, { desc = 'Run Pre-CR check' })

  vim.api.nvim_create_user_command('PreCrFixSetup', function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({ name = 'pre-cr', bufnr = bufnr })

    if #clients == 0 then
      vim.notify('Pre-CR server not running', vim.log.levels.WARN)
      return
    end

    clients[1].request('$/preCr/getProjectHealth', {}, function(err, result)
      if err then
        vim.notify('Failed to inspect Pre-CR setup: ' .. err.message, vim.log.levels.ERROR)
        return
      end

      if not result or not result.health then
        vim.notify('Project health is unavailable', vim.log.levels.WARN)
        return
      end

      local health = result.health
      if not health.issues or #health.issues == 0 then
        vim.notify('Pre-CR setup looks good', vim.log.levels.INFO)
        return
      end

      local lines = { 'Pre-CR Setup Health:' }
      for _, issue in ipairs(health.issues) do
        table.insert(lines, '- ' .. issue.message)
        if issue.hint then
          table.insert(lines, '  ' .. issue.hint)
        end
      end

      vim.notify(table.concat(lines, '\n'), vim.log.levels.WARN)
    end, bufnr)
  end, { desc = 'Show Pre-CR setup guidance' })

  -- Show coverage overlay
  vim.api.nvim_create_user_command('PreCrShow', function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({ name = 'pre-cr', bufnr = bufnr })
    
    if #clients == 0 then
      vim.notify('Pre-CR server not running', vim.log.levels.WARN)
      return
    end
    
    local params = {
      textDocument = {
        uri = vim.uri_from_bufnr(bufnr)
      }
    }
    
    clients[1].request('$/preCr/getCoverageDecorations', params, function(err, result)
      if err then
        vim.notify('Failed to get coverage: ' .. err.message, vim.log.levels.ERROR)
      elseif result and result.decorations then
        apply_decorations(bufnr, result.decorations)
        vim.notify('Coverage applied: ' .. #result.decorations .. ' lines', vim.log.levels.INFO)
      end
    end, bufnr)
  end, { desc = 'Show coverage overlay' })
  
  -- Hide coverage overlay
  vim.api.nvim_create_user_command('PreCrHide', function()
    local bufnr = vim.api.nvim_get_current_buf()
    vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
    vim.notify('Coverage hidden', vim.log.levels.INFO)
  end, { desc = 'Hide coverage overlay' })
  
  -- Refresh coverage data
  vim.api.nvim_create_user_command('PreCrRefresh', function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({ name = 'pre-cr', bufnr = bufnr })
    
    if #clients == 0 then
      vim.notify('Pre-CR server not running', vim.log.levels.WARN)
      return
    end
    
    clients[1].request('$/preCr/refreshCoverage', {}, function(err, result)
      if err then
        vim.notify('Failed to refresh: ' .. err.message, vim.log.levels.ERROR)
      elseif result and result.success then
        vim.notify('Coverage refreshed', vim.log.levels.INFO)
        -- Re-apply decorations
        vim.cmd('PreCrShow')
      else
        vim.notify('Failed to refresh coverage', vim.log.levels.WARN)
      end
    end, bufnr)
  end, { desc = 'Refresh coverage data' })
  
  -- Show coverage summary
  vim.api.nvim_create_user_command('PreCrSummary', function()
    local bufnr = vim.api.nvim_get_current_buf()
    local clients = vim.lsp.get_active_clients({ name = 'pre-cr', bufnr = bufnr })
    
    if #clients == 0 then
      vim.notify('Pre-CR server not running', vim.log.levels.WARN)
      return
    end
    
    clients[1].request('$/preCr/getCoverageSummary', {}, function(err, result)
      if err then
        vim.notify('Failed to get summary: ' .. err.message, vim.log.levels.ERROR)
      elseif result and result.summary then
        local s = result.summary
        local msg = string.format(
          'Coverage Summary:\n  Lines: %d%% (%d/%d)\n  Branches: %d%% (%d/%d)\n  Functions: %d%% (%d/%d)',
          s.linePercentage, s.coveredLines, s.totalLines,
          s.branchPercentage, s.coveredBranches, s.totalBranches,
          s.functionPercentage, s.coveredFunctions, s.totalFunctions
        )
        vim.notify(msg, vim.log.levels.INFO)
      else
        vim.notify('No coverage data available', vim.log.levels.WARN)
      end
    end, bufnr)
  end, { desc = 'Show coverage summary' })
end

-- ============================================================================
-- Keymaps
-- ============================================================================

local function setup_keymaps()
  vim.keymap.set('n', '<leader>cc', ':PreCrCheck<CR>', { desc = 'Run Pre-CR check' })
  vim.keymap.set('n', '<leader>cs', ':PreCrShow<CR>', { desc = 'Show coverage' })
  vim.keymap.set('n', '<leader>ch', ':PreCrHide<CR>', { desc = 'Hide coverage' })
  vim.keymap.set('n', '<leader>cr', ':PreCrRefresh<CR>', { desc = 'Refresh coverage' })
  vim.keymap.set('n', '<leader>ci', ':PreCrSummary<CR>', { desc = 'Coverage summary' })
  vim.keymap.set('n', '<leader>cf', ':PreCrFixSetup<CR>', { desc = 'Fix Pre-CR setup' })
end

-- ============================================================================
-- Main Setup
-- ============================================================================

function M.setup(opts)
  -- Merge user options
  if opts then
    M.config = vim.tbl_deep_extend('force', M.config, opts)
  end
  
  -- Set up highlights
  setup_highlights()
  
  -- Set up commands
  setup_commands()
  
  -- Set up keymaps (optional)
  if opts and opts.keymaps ~= false then
    setup_keymaps()
  end
  
  -- Set up LSP
  local has_lspconfig = pcall(require, 'lspconfig')
  if has_lspconfig then
    setup_lsp_lspconfig()
  else
    setup_lsp_manual()
  end
  
  vim.notify('Pre-CR Suite loaded', vim.log.levels.INFO)
end

return M
