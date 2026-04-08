/**
 * Workspace Utilities
 * 
 * Centralized workspace operations for file scanning and management
 */

import * as vscode from 'vscode';

export interface WorkspaceFile {
  uri: vscode.Uri;
  path: string;
  relativePath: string;
  content?: string;
  languageId?: string;
}

/** Default patterns to exclude when scanning */
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.git/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.bundle.js'
];

/** Code file extensions */
const CODE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'java', 'rb', 'php',
  'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt'
];

/**
 * Get workspace root URI
 */
export function getWorkspaceRoot(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * Check if workspace is open
 */
export function hasWorkspace(): boolean {
  return vscode.workspace.workspaceFolders !== undefined && 
         vscode.workspace.workspaceFolders.length > 0;
}

/**
 * Find all code files in workspace
 */
export async function findCodeFiles(options?: {
  maxFiles?: number;
  excludePatterns?: string[];
  includeExtensions?: string[];
}): Promise<WorkspaceFile[]> {
  const maxFiles = options?.maxFiles ?? 500;
  const excludePatterns = options?.excludePatterns ?? [];
  const extensions = options?.includeExtensions ?? CODE_EXTENSIONS;

  const pattern = `**/*.{${extensions.join(',')}}`;
  const excludePattern = `{${[...DEFAULT_EXCLUDE_PATTERNS, ...excludePatterns].join(',')}}`;

  const files = await vscode.workspace.findFiles(pattern, excludePattern, maxFiles);

  return files.map(uri => ({
    uri,
    path: uri.fsPath,
    relativePath: vscode.workspace.asRelativePath(uri)
  }));
}

/**
 * Find all code files with content
 */
export async function findCodeFilesWithContent(options?: {
  maxFiles?: number;
  excludePatterns?: string[];
  includeExtensions?: string[];
}): Promise<WorkspaceFile[]> {
  const files = await findCodeFiles(options);
  const result: WorkspaceFile[] = [];

  for (const file of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(file.uri);
      result.push({
        ...file,
        content: doc.getText(),
        languageId: doc.languageId
      });
    } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
      // Skip files that can't be opened
    }
  }

  return result;
}

/**
 * Get active editor file info
 */
export function getActiveFile(): WorkspaceFile | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  return {
    uri: editor.document.uri,
    path: editor.document.uri.fsPath,
    relativePath: vscode.workspace.asRelativePath(editor.document.uri),
    content: editor.document.getText(),
    languageId: editor.document.languageId
  };
}

/**
 * Get file content by URI
 */
export async function getFileContent(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return undefined;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    console.debug('Pre-CR: Operation failed:', error);
    return false;
  }
}

/**
 * Find files matching a pattern
 */
export async function findFiles(
  pattern: string,
  exclude?: string,
  maxResults?: number
): Promise<vscode.Uri[]> {
  return vscode.workspace.findFiles(
    pattern,
    exclude ?? `{${DEFAULT_EXCLUDE_PATTERNS.join(',')}}`,
    maxResults
  );
}

/**
 * Get configuration value with workspace scope
 */
export function getWorkspaceConfig<T>(
  section: string,
  key: string,
  defaultValue: T
): T {
  const config = vscode.workspace.getConfiguration(section);
  return config.get<T>(key, defaultValue);
}
