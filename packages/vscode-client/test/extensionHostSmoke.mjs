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

  const scenario = process.env.PRE_CR_EXTENSION_HOST_SCENARIO;
  assert.ok(['pass', 'warning', 'blocked'].includes(scenario), `Unknown host smoke scenario: ${scenario}`);

  const showReadiness = () => vscode.commands.executeCommand('preCr.showReadiness');
  await showReadiness();
  if (scenario === 'warning') {
    await vscode.commands.executeCommand('preCr.fixSetup');
    await vscode.commands.executeCommand('preCr.runPreCrCheck');
    const readiness = await showReadiness();
    assert.equal(readiness.state, 'warning', 'No staged changes must produce warning readiness.');
  } else if (scenario === 'blocked') {
    await vscode.commands.executeCommand('preCr.runPreCrCheck');
    const readiness = await showReadiness();
    assert.equal(readiness.state, 'blocked', 'A failing test command must block readiness.');
  } else {
    await vscode.commands.executeCommand('preCr.fixSetup');
    await vscode.commands.executeCommand('preCr.runPreCrCheck');
    const firstReadiness = await showReadiness();
    assert.equal(firstReadiness.state, 'ready', 'A passing staged change must produce ready readiness.');
    await vscode.commands.executeCommand('preCr.quickCoverageCheck');
    await vscode.commands.executeCommand('preCr.runPreCrCheck');
    const finalReadiness = await showReadiness();
    assert.equal(finalReadiness.state, 'ready', 'Rerunning after coverage refresh must remain ready.');
  }
  await assert.rejects(
    vscode.commands.executeCommand('preCr.showDashboard'),
    /command .*preCr\.showDashboard.*not found/i,
    'Experimental commands must not be registered when the setting is disabled.'
  );
}
