#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const nvim = spawnSync('nvim', ['--version'], { encoding: 'utf8' });
if (nvim.error && nvim.error.code === 'ENOENT') {
  console.log('Neovim not installed; skipping readiness smoke test.');
  process.exit(0);
}
if (nvim.status !== 0) {
  console.error(nvim.stderr || nvim.stdout);
  process.exit(nvim.status ?? 1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-cr-nvim-readiness-'));
const stateHome = path.join(tempRoot, 'state');
const luaPath = path.join(tempRoot, 'readiness-smoke.lua');
const lua = `
vim.env.XDG_STATE_HOME = ${JSON.stringify(stateHome)}
vim.opt.rtp:prepend(${JSON.stringify(repoRoot + '/packages/neovim-client')})
local precr = require('pre-cr')
precr.setup()
assert(vim.fn.exists(':PreCrReadiness') == 2, 'readiness command was not registered')
assert(vim.fn.maparg('<leader>cd', 'n') ~= '', 'readiness keymap was not registered')
vim.cmd('PreCrReadiness')
vim.cmd('PreCrReadiness')
assert(vim.fn.bufnr('Pre-CR Readiness') > 0, 'readiness buffer was not created')
print('Neovim readiness smoke passed')
vim.cmd('qa!')
`;
fs.writeFileSync(luaPath, lua);

const result = spawnSync('nvim', [
  '--headless',
  '-n',
  '-i', 'NONE',
  '-u', 'NONE',
  '-c', `luafile ${luaPath}`
], {
  cwd: repoRoot,
  env: { ...process.env, XDG_STATE_HOME: stateHome },
  timeout: 10000,
  encoding: 'utf8'
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
