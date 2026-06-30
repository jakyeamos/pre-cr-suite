import * as fs from 'fs';
import * as path from 'path';

export interface ParsedCommand {
  command: string;
  args: string[];
}

export interface WorkspacePackageMetadata {
  packageManager?: unknown;
}

export function parseCommandString(commandLine: string): ParsedCommand | null {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of commandLine.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping || quote) {
    return null;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return null;
  }

  return {
    command: tokens[0],
    args: tokens.slice(1)
  };
}

export function resolveWorkspaceCommand(
  workspaceRoot: string,
  parsed: ParsedCommand,
  packageMetadata: WorkspacePackageMetadata = readWorkspacePackageMetadata(workspaceRoot)
): ParsedCommand {
  if (parsed.command !== 'pnpm') {
    return parsed;
  }

  if (typeof packageMetadata.packageManager !== 'string') {
    return parsed;
  }

  if (!packageMetadata.packageManager.startsWith('pnpm@')) {
    return parsed;
  }

  return {
    command: 'corepack',
    args: ['pnpm', ...parsed.args]
  };
}

function readWorkspacePackageMetadata(workspaceRoot: string): WorkspacePackageMetadata {
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    const metadata = parsed as Record<string, unknown>;
    return {
      packageManager: metadata.packageManager
    };
  } catch {
    return {};
  }
}
