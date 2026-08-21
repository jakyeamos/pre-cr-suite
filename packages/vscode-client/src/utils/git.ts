/**
 * Git Utilities
 *
 * Centralized git operations using VS Code Git extension API
 * with command-line fallback
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { resolveWorkspacePath, runProcess } from '@pre-cr/core';

const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  content?: string;
}

interface GitChange {
  uri: vscode.Uri;
  status: number;
}

interface GitRepositoryState {
  HEAD?: {
    name?: string;
    commit?: string;
  };
  indexChanges: GitChange[];
  workingTreeChanges: GitChange[];
}

interface GitRepository {
  state: GitRepositoryState;
}

interface GitApi {
  repositories: GitRepository[];
}

interface GitExtensionExports {
  getAPI(version: number): GitApi;
}

function isGitExtensionExports(value: unknown): value is GitExtensionExports {
  return typeof value === 'object'
    && value !== null
    && 'getAPI' in value
    && typeof (value as { getAPI?: unknown }).getAPI === 'function';
}

async function runGitCommand(
  workspaceRoot: string,
  args: readonly string[]
): Promise<Awaited<ReturnType<typeof runProcess>> | null> {
  const result = await runProcess({
    command: 'git',
    args,
    cwd: workspaceRoot,
    env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' },
    maxStdoutBytes: MAX_GIT_OUTPUT_BYTES,
    maxStderrBytes: MAX_GIT_OUTPUT_BYTES
  });

  return result.success && !result.stdout.truncated && !result.stderr.truncated
    ? result
    : null;
}

function parseNameStatus(
  output: string,
  workspaceRoot: string
): Array<{ path: string; status: ChangedFile['status'] }> {
  const fields = output.split('\0');
  const entries: Array<{ path: string; status: ChangedFile['status'] }> = [];

  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) {
      continue;
    }

    const statusCode = status[0];
    const isRename = statusCode === 'R' || statusCode === 'C';
    if (isRename) {
      index += 1;
    }
    const filePath = fields[index++];
    if (!filePath || !resolveWorkspacePath(workspaceRoot, filePath, {
      access: 'read',
      allowMissing: true
    }).valid) {
      continue;
    }

    const fileStatus: ChangedFile['status'] = statusCode === 'A' || statusCode === 'C'
      ? 'added'
      : statusCode === 'D'
        ? 'deleted'
        : statusCode === 'R'
          ? 'renamed'
          : 'modified';
    entries.push({ path: filePath, status: fileStatus });
  }

  return entries;
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
  const portablePath = filePath.replace(/\\/g, '/');
  const hasWindowsAbsolutePrefix = /^[A-Za-z]:\//.test(portablePath);
  const hasTraversalSegment = portablePath.split('/').some(segment => segment === '..');

  // Validate the original path before sanitization. Sanitizing `..` or a
  // leading slash first can turn an escape attempt into a different path that
  // appears to be inside the workspace.
  if (path.isAbsolute(filePath) || hasWindowsAbsolutePrefix || hasTraversalSegment) {
    console.warn('Pre-CR: Path traversal attempt blocked:', filePath);
    return null;
  }

  const sanitized = sanitizePath(filePath);
  const resolved = path.resolve(workspaceRoot, sanitized);
  const normalizedRoot = path.normalize(workspaceRoot);
  const relative = path.relative(normalizedRoot, resolved);

  // Ensure resolved path is actually contained; a string prefix would treat
  // `/workspace-other` as a child of `/workspace`.
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
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
async function getGitAPI(): Promise<GitApi | null> {
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return null;

    const exports = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();

    if (!isGitExtensionExports(exports)) {
      return null;
    }

    const git = exports.getAPI(1);

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
    const result = await runGitCommand(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return result?.stdout.text.trim() ?? null;
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
    const stagedResult = await runGitCommand(workspaceRoot, ['diff', '--cached', '--name-status', '-z']);
    const unstagedResult = await runGitCommand(workspaceRoot, ['diff', '--name-status', '-z']);
    if (!stagedResult || !unstagedResult) {
      return [];
    }

    const files = new Map<string, ChangedFile>();

    const parseOutput = (output: string): void => {
      for (const entry of parseNameStatus(output, workspaceRoot)) {
        files.set(entry.path, { path: entry.path, status: entry.status });
      }
    };

    parseOutput(stagedResult.stdout.text);
    parseOutput(unstagedResult.stdout.text);

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
    return git.repositories[0].state.workingTreeChanges.map((c: GitChange) =>
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
    return git.repositories[0].state.indexChanges.map((c: GitChange) =>
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
    const result = await runGitCommand(workspaceRoot, ['rev-parse', 'HEAD']);
    return result?.stdout.text.trim() ?? '';
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
    const result = await runGitCommand(workspaceRoot, ['rev-parse', '--is-inside-work-tree']);
    return result?.success === true && result.stdout.text.trim() === 'true';
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
    const result = await runGitCommand(workspaceRoot, ['remote', 'get-url', 'origin']);
    return result?.stdout.text.trim() ?? null;
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
