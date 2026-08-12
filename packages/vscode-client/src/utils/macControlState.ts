import * as vscode from 'vscode';

const TOKEN_PATTERN = /^[A-Za-z0-9._-]+$/;

export function formatMacControlState(taskId: string, taskState: string): string {
  if (!TOKEN_PATTERN.test(taskId) || !TOKEN_PATTERN.test(taskState)) {
    throw new Error('Mac Control task identifiers and states must be stable tokens');
  }
  return `[mac-control task=${taskId} state=${taskState}]`;
}

export async function publishMacControlState(
  taskId: string,
  taskState: string,
  outputChannel?: vscode.OutputChannel
): Promise<void> {
  const readback = formatMacControlState(taskId, taskState);
  await vscode.commands.executeCommand('setContext', `preCr.macControl.${taskId}`, taskState);
  outputChannel?.appendLine(readback);
}
