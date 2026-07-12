import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run() {
  const extension = vscode.extensions.getExtension('jakye.pre-cr-suite');
  assert.ok(extension, 'The development extension must be discoverable by the host.');

  await extension.activate();

  assert.equal(extension.isActive, true, 'The extension must activate in the development host.');
  assert.equal(
    process.env.PRE_CR_EXTENSION_HOST_MODE,
    'trusted',
    'The smoke runner must identify the trust mode it is proving.'
  );
  assert.equal(vscode.workspace.isTrusted, true, 'The smoke host must run in a trusted workspace.');

  const experimentalEnabled = vscode.workspace
    .getConfiguration('preCr')
    .get('experimental.enabled', false);
  assert.equal(experimentalEnabled, false, 'Experimental tools must remain disabled by default.');

  const commands = await vscode.commands.getCommands(true);
  for (const command of ['preCr.showReadiness', 'preCr.runPreCrCheck', 'preCr.fixSetup']) {
    assert.ok(commands.includes(command), `Stable command ${command} must be contributed.`);
  }

  await vscode.commands.executeCommand('preCr.showReadiness');
  await vscode.commands.executeCommand('preCr.runPreCrCheck');
  await assert.rejects(
    vscode.commands.executeCommand('preCr.showDashboard'),
    /command .*preCr\.showDashboard.*not found/i,
    'Experimental commands must not be registered when the setting is disabled.'
  );
}
