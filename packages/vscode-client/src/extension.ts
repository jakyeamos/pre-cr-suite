/**
 * Pre-CR Suite VS Code Extension
 * 
 * Main entry point that:
 * - Starts the LSP server
 * - Registers commands
 * - Sets up views and decorations
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';

import { registerCoverageFeatures } from './features/coverage';
import { registerChecklistFeatures } from './features/checklist';
import { registerDocgenFeatures } from './features/docgen';
import { registerReviewFeatures } from './features/review';
import { registerContextFeatures } from './features/context';
import { registerDebugFeatures, isDebugCapturing } from './features/debug';
import { registerDashboardFeature } from './features/dashboard';
import { registerPreCrCheckFeature } from './features/preCrCheck';
import * as notify from './utils/notifications';
import * as statusBar from './utils/statusBar';
import { initState, state } from './utils/state';

let client: LanguageClient;

// Output channel for logs
let outputChannel: vscode.OutputChannel;

/**
 * Log a message to the Pre-CR output channel
 */
export function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
  outputChannel.appendLine(`${timestamp} ${prefix} ${message}`);
}

export async function activate(context: vscode.ExtensionContext) {
  // Create output channel first
  outputChannel = vscode.window.createOutputChannel('Pre-CR Suite');
  context.subscriptions.push(outputChannel);
  
  // Log to both output channel and console for debugging
  console.log('[Pre-CR Suite] ========================================');
  console.log('[Pre-CR Suite] Extension activating...');
  console.log('[Pre-CR Suite] Extension path:', context.extensionPath);
  log('Pre-CR Suite is activating...');

  // Initialize centralized state management
  try {
    initState(context);
    console.log('[Pre-CR Suite] State initialized');
  } catch (error) {
    console.error('[Pre-CR Suite] State init failed:', error);
    log(`State init failed: ${error}`);
  }

  // Set up consolidated status bar (subscribes to state changes)
  let statusBarItem: vscode.StatusBarItem | undefined;
  try {
    statusBarItem = statusBar.initStatusBar(context);
    console.log('[Pre-CR Suite] Status bar created:', statusBarItem ? 'success' : 'failed');
    log('Status bar initialized');
  } catch (error) {
    console.error('[Pre-CR Suite] Status bar init failed:', error);
    log(`Status bar init failed: ${error}`);
    
    // Fallback: create a simple status bar item manually
    try {
      statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      statusBarItem.text = '$(check) Pre-CR';
      statusBarItem.tooltip = 'Pre-CR Suite (fallback mode)';
      statusBarItem.command = 'preCr.showQuickActions';
      statusBarItem.show();
      context.subscriptions.push(statusBarItem);
      console.log('[Pre-CR Suite] Fallback status bar created');
    } catch (fbError) {
      console.error('[Pre-CR Suite] Fallback status bar failed:', fbError);
    }
  }

  // Register quick actions command (works without LSP)
  try {
    registerQuickActions(context);
    console.log('[Pre-CR Suite] Quick actions registered');
  } catch (error) {
    console.error('[Pre-CR Suite] Quick actions registration failed:', error);
  }
  
  // Register utility commands
  try {
    registerUtilityCommands(context);
    console.log('[Pre-CR Suite] Utility commands registered');
  } catch (error) {
    console.error('[Pre-CR Suite] Utility commands registration failed:', error);
  }

  // Path to server module
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));
  console.log('[Pre-CR Suite] Server module path:', serverModule);
  
  // Check if server exists
  if (!fs.existsSync(serverModule)) {
    console.error('[Pre-CR Suite] Server module NOT FOUND at:', serverModule);
    log(`Server not found: ${serverModule}`);
    
    // Try alternative path (in case running from different location)
    const altServerModule = path.join(context.extensionPath, '..', 'server', 'dist', 'server.js');
    console.log('[Pre-CR Suite] Trying alternative path:', altServerModule);
  } else {
    console.log('[Pre-CR Suite] Server module found');
  }

  // Server options - run in Node with debugging support
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ['--nolazy', '--inspect=6009']
      }
    }
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'python' },
      { scheme: 'file', language: 'go' },
      { scheme: 'file', language: 'rust' }
    ],
    synchronize: {
      fileEvents: [
        vscode.workspace.createFileSystemWatcher('**/.pre-cr.json'),
        vscode.workspace.createFileSystemWatcher('**/coverage/**'),
        vscode.workspace.createFileSystemWatcher('**/.nyc_output/**')
      ]
    },
    initializationOptions: getConfiguration()
  };

  // Create and start the client
  client = new LanguageClient(
    'preCrSuite',
    'Pre-CR Suite',
    serverOptions,
    clientOptions
  );

  try {
    // Start the client (also starts the server)
    await client.start();
    console.log('Pre-CR Suite LSP client started');

    // Register features that require LSP
    registerCoverageFeatures(context, client);
    registerChecklistFeatures(context, client);
    registerDocgenFeatures(context, client);
    registerReviewFeatures(context, client);
    registerContextFeatures(context, client);
    registerDebugFeatures(context, client);
    registerDashboardFeature(context, client);
    registerPreCrCheckFeature(context, client);
    
    // Mark LSP as connected
    state.setLspConnected(true);

    // Watch for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('preCr')) {
          client.sendNotification('workspace/didChangeConfiguration', {
            settings: getConfiguration()
          });
        }
      })
    );

    // Watch for branch changes (git)
    watchBranchChanges(context, client);

  } catch (error) {
    console.error('Failed to start Pre-CR LSP server:', error);
    
    // Show a non-blocking notification
    notify.showWarning('Pre-CR server failed to start. Build with: npm run build');
  }

  console.log('[Pre-CR Suite] Activation complete!');
  log('Pre-CR Suite activated successfully');
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

/**
 * Get extension configuration
 */
function getConfiguration(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration('preCr');
  return {
    coverage: {
      autoLoad: config.get('coverage.autoLoad'),
      searchPaths: config.get('coverage.searchPaths'),
      decorations: {
        covered: config.get('coverage.decorations.covered'),
        uncovered: config.get('coverage.decorations.uncovered'),
        partial: config.get('coverage.decorations.partial')
      }
    },
    checklist: {
      autoRun: config.get('checklist.autoRun'),
      maxFileSize: config.get('checklist.maxFileSize'),
      maxPrSize: config.get('checklist.maxPrSize')
    },
    security: {
      enabled: config.get('security.enabled'),
      excludePatterns: config.get('security.excludePatterns')
    },
    docs: {
      style: config.get('docs.style'),
      includeExamples: config.get('docs.includeExamples')
    },
    flakyTests: {
      enabled: config.get('flakyTests.enabled'),
      threshold: config.get('flakyTests.threshold'),
      minRuns: config.get('flakyTests.minRuns')
    },
    context: {
      autoCaptureOnBranchSwitch: config.get('context.autoCaptureOnBranchSwitch'),
      autoRestoreOnBranchReturn: config.get('context.autoRestoreOnBranchReturn')
    },
    debug: {
      captureConsole: config.get('debug.captureConsole'),
      maxBreakpointHits: config.get('debug.maxBreakpointHits')
    }
  };
}

/**
 * Get keyboard shortcut display string for a command
 */
function getShortcut(command: string): string {
  const isMac = process.platform === 'darwin';
  const shortcuts: Record<string, { mac: string; win: string }> = {
    'preCr.showQuickActions': { mac: '⌘⇧R', win: 'Ctrl+Shift+P ×2' },
    'preCr.quickSecurityScan': { mac: '⌘⇧S', win: 'Ctrl+Shift+S' },
    'preCr.generateDocAtCursor': { mac: '⌘⇧D', win: 'Ctrl+Shift+D' },
    'preCr.runChecklist': { mac: '⌘⇧C', win: 'Ctrl+Shift+C' },
    'preCr.whereWasI': { mac: '⌘⇧W', win: 'Ctrl+Shift+W' },
  };
  
  const shortcut = shortcuts[command];
  if (!shortcut) return '';
  return isMac ? shortcut.mac : shortcut.win;
}

/**
 * Create a quick pick item with optional shortcut
 */
function quickItem(
  label: string, 
  description: string, 
  command: string
): vscode.QuickPickItem & { command: string } {
  const shortcut = getShortcut(command);
  return {
    label,
    description: shortcut ? `${description}  [${shortcut}]` : description,
    command
  };
}

// Maximum recent actions to show
const MAX_RECENT_ACTIONS = 3;

// Command labels for display
const COMMAND_LABELS: Record<string, string> = {
  'preCr.runPreCrCheck': '$(play) Pre-CR Check',
  'preCr.quickCoverageCheck': '$(check) Refresh Coverage',
  'preCr.fixSetup': '$(tools) Fix Setup',
  'preCr.showDashboard': '$(dashboard) Dashboard',
  'preCr.quickSecurityScan': '$(shield) Security Scan (File)',
  'preCr.securityScanWorkspace': '$(shield) Security Scan (Workspace)',
  'preCr.securityScanChanges': '$(shield) Security Scan (Changes)',
  'preCr.generateDocAtCursor': '$(book) Generate Doc at Cursor',
  'preCr.generateDocs': '$(file-text) Generate All Docs',
  'preCr.checkDocHealth': '$(pulse) Check Doc Health',
  'preCr.checkDocHealthWorkspace': '$(pulse) Check Doc Health (Workspace)',
  'preCr.showFileCoverage': '$(dashboard) Show Coverage (File)',
  'preCr.showCoverageSummary': '$(dashboard) Coverage Summary',
  'preCr.loadCoverage': '$(folder-library) Load Coverage',
  'preCr.checkChangesCoverage': '$(dashboard) Check Coverage (Changes)',
  'preCr.runChecklist': '$(checklist) PR Checklist',
  'preCr.runChecklistWorkspace': '$(checklist) Full Audit',
  'preCr.estimateReviewTime': '$(clock) Review Time',
  'preCr.showFlakyTests': '$(beaker) Flaky Tests',
  'preCr.whereWasI': '$(history) Where Was I?',
  'preCr.captureContext': '$(save) Save Snapshot',
  'preCr.restoreContext': '$(folder-opened) Restore Snapshot',
  'preCr.startDebugCapture': '$(record) Start Capture',
  'preCr.stopDebugCapture': '$(debug-stop) Stop Capture',
  'preCr.analyzeDebugSession': '$(graph) Analyze Session',
};

/**
 * Track a recently used command (uses state manager)
 */
function trackRecentAction(command: string) {
  state.addRecentAction(command);
}

/**
 * Get recent actions as quick pick items
 */
function getRecentActionsItems(): (vscode.QuickPickItem & { command?: string })[] {
  const recent = state.getRecentActions().slice(0, MAX_RECENT_ACTIONS);
  
  if (recent.length === 0) return [];

  const items: (vscode.QuickPickItem & { command?: string })[] = [
    { label: 'Recent', kind: vscode.QuickPickItemKind.Separator }
  ];

  for (const command of recent) {
    const label = COMMAND_LABELS[command] || command.replace('preCr.', '');
    items.push({
      label: `$(history) ${label.replace(/^\$\([^)]+\)\s*/, '')}`,
      description: 'Recently used',
      command
    });
  }

  return items;
}

/**
 * Register the quick actions command
 */
function registerQuickActions(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('preCr.showQuickActions', async () => {
      // Get recent actions
      const recentItems = getRecentActionsItems();
      
      // First, ask for scope (or pick from recent)
      const scopeItems: (vscode.QuickPickItem & { value?: string; command?: string })[] = [
        ...recentItems,
        { label: 'Scopes', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(file) Current File', description: 'Analyze the active file', value: 'file' },
        { label: '$(folder) Workspace', description: 'Analyze entire project', value: 'workspace' },
        { label: '$(git-pull-request) Git Changes', description: 'Analyze staged/modified files', value: 'changes' },
        { label: '$(tools) Other Tools', description: 'Context, Debug, Settings', value: 'other' }
      ];

      const scope = await vscode.window.showQuickPick(scopeItems, {
        placeHolder: recentItems.length > 0 ? 'Recent actions or select scope' : 'What do you want to analyze?'
      });

      if (!scope) return;

      // If user picked a recent action, execute it directly
      if ('command' in scope && scope.command) {
        trackRecentAction(scope.command);
        vscode.commands.executeCommand(scope.command);
        return;
      }

      let items: (vscode.QuickPickItem & { command?: string })[] = [];

      if (scope.value === 'file') {
        items = [
          { label: 'Beta Workflow', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(play) Run Pre-CR Check', 'Run tests and verify changed-line coverage', 'preCr.runPreCrCheck'),
          quickItem('$(check) Refresh Coverage', 'Load the configured coverage report', 'preCr.quickCoverageCheck'),
          quickItem('$(tools) Fix Setup', 'Inspect repo config and coverage paths', 'preCr.fixSetup'),
          quickItem('$(dashboard) Show File Coverage', 'View line coverage for this file', 'preCr.showFileCoverage'),
          
          { label: 'Experimental', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(shield) Security Scan', 'Check for vulnerabilities', 'preCr.quickSecurityScan'),
          quickItem('$(book) Generate Doc at Cursor', 'Add JSDoc to function', 'preCr.generateDocAtCursor'),
          quickItem('$(file-text) Generate All Docs', 'Document all functions', 'preCr.generateDocs'),
          quickItem('$(pulse) Check Doc Health', 'Find missing docs', 'preCr.checkDocHealth'),
        ];
      } else if (scope.value === 'workspace') {
        items = [
          { label: 'Beta Workflow', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(play) Run Pre-CR Check', 'Run tests and verify changed-line coverage', 'preCr.runPreCrCheck'),
          quickItem('$(check) Refresh Coverage', 'Load the configured coverage report', 'preCr.quickCoverageCheck'),
          quickItem('$(tools) Fix Setup', 'Inspect repo config and coverage paths', 'preCr.fixSetup'),
          quickItem('$(dashboard) Coverage Summary', 'View overall coverage stats', 'preCr.showCoverageSummary'),
          
          { label: 'Experimental', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(shield) Security Scan', 'Audit all files for vulnerabilities', 'preCr.securityScanWorkspace'),
          quickItem('$(pulse) Check Doc Health', 'Documentation coverage report', 'preCr.checkDocHealthWorkspace'),
          quickItem('$(checklist) Run Full Audit', 'Security + Docs + Size checks', 'preCr.runChecklistWorkspace'),
          quickItem('$(beaker) Flaky Test Report', 'View unreliable tests', 'preCr.showFlakyTests'),
        ];
      } else if (scope.value === 'changes') {
        items = [
          { label: 'Beta Workflow', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(play) Run Pre-CR Check', 'Run tests and verify changed-line coverage', 'preCr.runPreCrCheck'),
          quickItem('$(check) Refresh Coverage', 'Load the configured coverage report', 'preCr.quickCoverageCheck'),
          quickItem('$(tools) Fix Setup', 'Inspect repo config and coverage paths', 'preCr.fixSetup'),
          quickItem('$(dashboard) Check Changes Coverage', 'Are changes covered by tests?', 'preCr.checkChangesCoverage'),
          
          { label: 'Experimental', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(checklist) Run PR Checklist', 'Security + Docs + Size checks', 'preCr.runChecklist'),
          quickItem('$(shield) Security Scan', 'Scan changed files only', 'preCr.securityScanChanges'),
          quickItem('$(clock) Estimate Review Time', 'How long will this PR take?', 'preCr.estimateReviewTime'),
        ];
      } else if (scope.value === 'other') {
        const debugItems = isDebugCapturing()
          ? [quickItem('$(debug-stop) Stop Capture', 'End recording', 'preCr.stopDebugCapture')]
          : [quickItem('$(record) Start Capture', 'Record debug session', 'preCr.startDebugCapture')];

        items = [
          { label: 'Beta Workflow', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(tools) Fix Setup', 'Inspect repo config and coverage paths', 'preCr.fixSetup'),
          quickItem('$(dashboard) Open Dashboard', 'View coverage and setup status', 'preCr.showDashboard'),
          
          { label: 'Experimental', kind: vscode.QuickPickItemKind.Separator },
          quickItem('$(history) Where Was I?', 'Resume from saved state', 'preCr.whereWasI'),
          quickItem('$(save) Save Snapshot', 'Save current editor state', 'preCr.captureContext'),
          quickItem('$(folder-opened) Restore Snapshot', 'Load a saved state', 'preCr.restoreContext'),
          ...debugItems,
          quickItem('$(graph) Analyze Session', 'View patterns & insights', 'preCr.analyzeDebugSession'),
          quickItem('$(gear) Open Settings', 'Configure Pre-CR Suite', 'preCr.openSettings'),
          quickItem('$(output) Show Logs', 'View output channel', 'preCr.showLogs'),
        ];
      }

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select action for ${scope.label}`,
        matchOnDescription: true
      });

      if (selected && selected.command) {
        trackRecentAction(selected.command);
        vscode.commands.executeCommand(selected.command);
      }
    })
  );
}

/**
 * Watch for git branch changes
 */
function watchBranchChanges(
  context: vscode.ExtensionContext,
  client: LanguageClient
) {
  // Delay git extension access to avoid activation issues
  setTimeout(async () => {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        console.log('Git extension not available');
        return;
      }

      // Wait for git extension to activate
      const git = gitExtension.isActive 
        ? gitExtension.exports.getAPI(1)
        : (await gitExtension.activate()).getAPI(1);
      
      if (!git) {
        console.log('Git API not available');
        return;
      }

      let currentBranch: string | undefined;

      // Check for branch changes periodically
      const checkBranch = () => {
        const repo = git.repositories[0];
        if (!repo) return;

        const branch = repo.state.HEAD?.name;
        if (branch && branch !== currentBranch) {
          const previousBranch = currentBranch;
          currentBranch = branch;

          if (previousBranch) {
            // Notify server of branch switch
            client.sendRequest('$/preCr/onBranchSwitch', {
              fromBranch: previousBranch,
              toBranch: branch,
              currentContext: getCurrentContext()
            }).then((result: any) => {
              if (result.toRestore) {
                // Ask user if they want to restore context
                notify.showInfo(
                  `Restore context from ${branch}?`,
                  undefined,
                  'Restore'
                ).then(selection => {
                  if (selection === 'Restore') {
                    vscode.commands.executeCommand('preCr.restoreContext', result.toRestore);
                  }
                });
              }
            });
          }
        }
      };

      // Check every 2 seconds
      const interval = setInterval(checkBranch, 2000);
      context.subscriptions.push({ dispose: () => clearInterval(interval) });
      
    } catch (error) {
      console.log('Git integration not available:', error);
    }
  }, 2000); // Wait 2 seconds for git extension to be ready
}

/**
 * Register utility commands (settings, show all commands, show logs)
 */
function registerUtilityCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    // Open Pre-CR settings
    vscode.commands.registerCommand('preCr.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'preCr');
    }),
    
    // Show all Pre-CR commands
    vscode.commands.registerCommand('preCr.showAllCommands', async () => {
      const commands = await vscode.commands.getCommands(true);
      const preCrCommands = commands
        .filter(c => c.startsWith('preCr.'))
        .sort();
      
      const items = preCrCommands.map(cmd => ({
        label: cmd.replace('preCr.', ''),
        description: cmd,
        command: cmd
      }));
      
      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Pre-CR command to run',
        matchOnDescription: true
      });
      
      if (selected) {
        vscode.commands.executeCommand(selected.command);
      }
    }),
    
    // Show output channel
    vscode.commands.registerCommand('preCr.showLogs', () => {
      outputChannel.show();
    }),
    
    // Show getting started walkthrough
    vscode.commands.registerCommand('preCr.gettingStarted', () => {
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'pre-cr-suite.preCr.gettingStarted',
        false
      );
    })
  );
  
  // Show getting started on first run
  const hasShownWalkthrough = context.globalState.get<boolean>('preCr.hasShownWalkthrough', false);
  if (!hasShownWalkthrough) {
    // Delay slightly to let the extension activate fully
    setTimeout(() => {
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'pre-cr-suite.preCr.gettingStarted',
        false
      );
      context.globalState.update('preCr.hasShownWalkthrough', true);
    }, 2000);
  }
}

/**
 * Get current editor context for snapshots
 */
function getCurrentContext() {
  const editors = vscode.window.visibleTextEditors;
  const activeEditor = vscode.window.activeTextEditor;

  return {
    files: editors.map(editor => ({
      path: vscode.workspace.asRelativePath(editor.document.uri),
      cursor: {
        line: editor.selection.active.line,
        character: editor.selection.active.character
      },
      scrollTop: editor.visibleRanges[0]?.start.line || 0,
      isDirty: editor.document.isDirty,
      isActive: editor === activeEditor
    })),
    git: {
      modifiedFiles: [],
      stagedFiles: [],
      headCommit: ''
    }
  };
}

/**
 * Export client for use in feature modules
 */
export function getClient(): LanguageClient {
  return client;
}

/**
 * Export output channel for use in feature modules
 */
export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}
