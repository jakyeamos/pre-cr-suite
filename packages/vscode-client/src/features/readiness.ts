import * as vscode from 'vscode';

import { state } from '../utils/state';
import { formatReadinessLabel } from './readinessModel';

export { formatReadinessLabel } from './readinessModel';

export function registerReadinessFeature(context: vscode.ExtensionContext): void {
  const provider = new ReadinessTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('preCr.readiness', provider),
    vscode.commands.registerCommand('preCr.showReadiness', () => {
      void vscode.commands.executeCommand('workbench.view.extension.preCrSuite');
    }),
    state.subscribe('readiness', () => provider.refresh())
  );
}

class ReadinessTreeProvider implements vscode.TreeDataProvider<ReadinessTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ReadinessTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: ReadinessTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ReadinessTreeItem[] {
    const readiness = state.get('readiness');
    const items = [
      new ReadinessTreeItem(formatReadinessLabel(readiness), readiness.summary ?? 'Run Pre-CR to evaluate this workspace.')
    ];

    if (readiness.scope) {
      items.push(new ReadinessTreeItem('Scope', readiness.scope));
    }

    for (const remediation of readiness.remediation.slice(0, 8)) {
      items.push(new ReadinessTreeItem(`$(warning) ${remediation.code}`, remediation.message));
    }

    items.push(
      new ReadinessTreeItem('$(play) Run Pre-CR Check', 'Evaluate staged changes', 'preCr.runPreCrCheck'),
      new ReadinessTreeItem('$(check) Refresh Coverage', 'Load the configured report', 'preCr.quickCoverageCheck'),
      new ReadinessTreeItem('$(tools) Fix Setup', 'Inspect project health and remediation', 'preCr.fixSetup')
    );

    return items;
  }
}

class ReadinessTreeItem extends vscode.TreeItem {
  constructor(label: string, description: string, commandId?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    if (commandId) {
      this.command = {
        command: commandId,
        title: label
      };
    }
  }
}
