/**
 * Git Utilities
 * 
 * Centralized git operations using VS Code Git extension API
 * with command-line fallback
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  content?: string;
}

// ============================================================================
// Security: Path Sanitization
// ============================================================================

/**
 * Sanitize a file path to prevent path traversal attacks
 * Removes: .., shell metacharacters, null bytes
 */
export function sanitizePath(filePath: string): string {
  if (!filePath) return '';
  
  return filePath
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove path traversal attempts
    .replace(/\.\./g, '')
    // Remove shell metacharacters that could be dangerous in commands
    .replace(/[`$|;&<>]/g, '')
    // Normalize path separators
    .replace(/\\/g, '/')
    // Collapse multiple slashes into one
    .replace(/\/+/g, '/')
    // Remove leading slashes to prevent absolute path injection
    .replace(/^\/+/, '');
}

/**
 * Validate that a path is within the workspace root
 * Returns null if path escapes workspace
 */
export function validatePathInWorkspace(
  filePath: string, 
  workspaceRoot: string
): string | null {
  const sanitized = sanitizePath(filePath);
  const resolved = path.resolve(workspaceRoot, sanitized);
  const normalizedRoot = path.normalize(workspaceRoot);
  
  // Ensure resolved path starts with workspace root
  if (!resolved.startsWith(normalizedRoot)) {
    console.warn('Pre-CR: Path traversal attempt blocked:', filePath);
    return null;
  }
  
  return resolved;
}

/**
 * Escape a string for safe use in shell commands
 */
export function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes in the string
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ============================================================================
// Git API
// ============================================================================

/**
 * Get the VS Code Git extension API
 */
async function getGitAPI(): Promise<any | null> {
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return null;
    
    const git = gitExtension.isActive 
      ? gitExtension.exports.getAPI(1)
      : (await gitExtension.activate()).getAPI(1);
    
    return git;
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return null;
  }
}

/**
 * Get the current git branch name
 */
export async function getCurrentBranch(): Promise<string | null> {
  // Try VS Code Git API first
  const git = await getGitAPI();
  if (git && git.repositories.length > 0) {
    return git.repositories[0].state.HEAD?.name || null;
  }

  // Fallback to command line
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return null;

  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: workspaceRoot
    });
    return stdout.trim();
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return null;
  }
}

/**
 * Get list of changed files (staged + unstaged)
 */
export async function getChangedFiles(): Promise<ChangedFile[]> {
  // Try VS Code Git API first
  const git = await getGitAPI();
  if (git && git.repositories.length > 0) {
    const repo = git.repositories[0];
    const files = new Map<string, ChangedFile>();
    
    // Process both staged and working tree changes
    for (const change of [...repo.state.indexChanges, ...repo.state.workingTreeChanges]) {
      const filePath = vscode.workspace.asRelativePath(change.uri);
      
      // Map Git status codes to our status enum
      let status: ChangedFile['status'] = 'modified';
      // GitStatus: INDEX_ADDED = 1, MODIFIED = 5, DELETED = 6, INDEX_ADDED = 7
      if (change.status === 1 || change.status === 7) status = 'added';
      else if (change.status === 6) status = 'deleted';
      else if (change.status === 3) status = 'renamed';
      
      files.set(filePath, { path: filePath, status });
    }
    
    return Array.from(files.values());
  }

  // Fallback to command line
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return [];

  try {
    // Get both staged and unstaged changes
    const { stdout: stagedOutput } = await execAsync(
      'git diff --cached --name-status',
      { cwd: workspaceRoot }
    );
    const { stdout: unstagedOutput } = await execAsync(
      'git diff --name-status',
      { cwd: workspaceRoot }
    );

    const files = new Map<string, ChangedFile>();

    // Parse output
    const parseOutput = (output: string) => {
      for (const line of output.split('\n').filter(Boolean)) {
        const [status, ...pathParts] = line.split('\t');
        const filePath = pathParts.join('\t'); // Handle paths with tabs
        
        if (!filePath) continue;

        let fileStatus: ChangedFile['status'] = 'modified';
        if (status.startsWith('A')) fileStatus = 'added';
        else if (status.startsWith('D')) fileStatus = 'deleted';
        else if (status.startsWith('R')) fileStatus = 'renamed';

        files.set(filePath, { path: filePath, status: fileStatus });
      }
    };

    parseOutput(stagedOutput);
    parseOutput(unstagedOutput);

    return Array.from(files.values());
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return [];
  }
}

/**
 * Get changed files with their content
 */
export async function getChangedFilesWithContent(): Promise<(ChangedFile & { 
  content: string;
  additions?: number;
  deletions?: number;
  isNew?: boolean;
  isDeleted?: boolean;
})[]> {
  const files = await getChangedFiles();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  
  if (!workspaceRoot) return files.map(f => ({ ...f, content: '' }));

  const result: (ChangedFile & { content: string; isNew?: boolean; isDeleted?: boolean })[] = [];

  for (const file of files) {
    if (file.status === 'deleted') {
      result.push({ ...file, content: '', isDeleted: true });
      continue;
    }

    try {
      const fileUri = vscode.Uri.joinPath(workspaceRoot, file.path);
      const doc = await vscode.workspace.openTextDocument(fileUri);
      result.push({
        ...file,
        content: doc.getText(),
        isNew: file.status === 'added',
        isDeleted: false
      });
    } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
      result.push({ ...file, content: '' });
    }
  }

  return result;
}

/**
 * Get modified (unstaged) files only
 */
export async function getModifiedFiles(): Promise<string[]> {
  const git = await getGitAPI();
  if (git && git.repositories.length > 0) {
    return git.repositories[0].state.workingTreeChanges.map((c: any) => 
      vscode.workspace.asRelativePath(c.uri)
    );
  }
  
  // Fallback
  const files = await getChangedFiles();
  return files.filter(f => f.status === 'modified').map(f => f.path);
}

/**
 * Get staged files only
 */
export async function getStagedFiles(): Promise<string[]> {
  const git = await getGitAPI();
  if (git && git.repositories.length > 0) {
    return git.repositories[0].state.indexChanges.map((c: any) => 
      vscode.workspace.asRelativePath(c.uri)
    );
  }
  
  // No good CLI fallback for this without parsing git status --porcelain
  return [];
}

/**
 * Get the current HEAD commit hash
 */
export async function getHeadCommit(): Promise<string> {
  const git = await getGitAPI();
  if (git && git.repositories.length > 0) {
    return git.repositories[0].state.HEAD?.commit || '';
  }
  
  // Fallback to command line
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return '';

  try {
    const { stdout } = await execAsync('git rev-parse HEAD', {
      cwd: workspaceRoot
    });
    return stdout.trim();
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return '';
  }
}

/**
 * Check if current directory is a git repository
 */
export async function isGitRepository(): Promise<boolean> {
  const git = await getGitAPI();
  if (git && git.repositories.length > 0) {
    return true;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return false;

  try {
    await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: workspaceRoot
    });
    return true;
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return false;
  }
}

/**
 * Get the git remote URL (for repo identification)
 */
export async function getRemoteUrl(): Promise<string | null> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return null;

  try {
    const { stdout } = await execAsync('git remote get-url origin', {
      cwd: workspaceRoot
    });
    return stdout.trim();
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return null;
  }
}

/**
 * Watch for branch changes
 */
export function watchBranchChanges(
  context: vscode.ExtensionContext,
  callback: (newBranch: string, oldBranch: string | null) => void
): void {
  let currentBranch: string | null = null;

  // Check branch periodically
  const checkBranch = async () => {
    const branch = await getCurrentBranch();
    if (branch && branch !== currentBranch) {
      const oldBranch = currentBranch;
      currentBranch = branch;
      if (oldBranch !== null) {
        callback(branch, oldBranch);
      }
    }
  };

  // Initial check
  checkBranch();

  // Watch .git/HEAD for changes
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (workspaceRoot) {
    const gitHeadPattern = new vscode.RelativePattern(workspaceRoot, '.git/HEAD');
    const watcher = vscode.workspace.createFileSystemWatcher(gitHeadPattern);
    
    watcher.onDidChange(() => checkBranch());
    context.subscriptions.push(watcher);
  }

  // Also poll every 5 seconds as backup
  const interval = setInterval(checkBranch, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}
