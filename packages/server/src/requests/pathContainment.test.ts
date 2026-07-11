import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { FileChange } from '@pre-cr/core';
import type { Connection } from 'vscode-languageserver/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings } from '../serverSettings';
import type { ServerRequestState } from '../serverSettings';
import { registerChecklistRequests } from './checklistRequests';
import { registerReviewRequests } from './reviewRequests';

type RequestHandler = (params: unknown) => unknown;

interface TestConnection {
  connection: Connection;
  request<Response>(method: string, params: unknown): Promise<Response>;
}

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createConnection(): TestConnection {
  const handlers = new Map<string, RequestHandler>();
  const connection = {
    onRequest(method: string, handler: unknown): void {
      handlers.set(method, handler as RequestHandler);
    },
    console: {
      warn: vi.fn(),
      error: vi.fn()
    }
  } as unknown as Connection;

  return {
    connection,
    async request<Response>(method: string, params: unknown): Promise<Response> {
      const handler = handlers.get(method);
      if (!handler) {
        throw new Error(`No handler registered for ${method}`);
      }
      return await Promise.resolve(handler(params)) as Response;
    }
  };
}

function createState(workspaceRoot: string): ServerRequestState {
  return {
    workspaceRoot,
    globalSettings: defaultSettings,
    coverage: null,
    trustedExecution: true
  };
}

function change(filePath: string): FileChange {
  return {
    path: filePath,
    additions: 1,
    deletions: 0,
    isNew: false,
    isDeleted: false,
    isRenamed: false
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('workspace path containment for request handlers', () => {
  it('runs checklist analysis for a normal workspace file', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-request-workspace-');
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'example.ts'), 'export const value = 1;\n');
    const testConnection = createConnection();
    registerChecklistRequests(testConnection.connection, createState(workspaceRoot));

    const result = await testConnection.request<{ result: unknown; error?: string }>(
      '$/preCr/runChecklist',
      { changes: [change('src/example.ts')] }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).not.toBeNull();
  });

  it('rejects checklist file and coverage paths outside the workspace', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-request-workspace-');
    const externalRoot = makeTemporaryDirectory('pre-cr-request-external-');
    const externalSourcePath = path.join(externalRoot, 'secret.ts');
    const externalCoveragePath = path.join(externalRoot, 'coverage.lcov');
    fs.writeFileSync(externalSourcePath, 'export const secret = true;\n');
    fs.writeFileSync(externalCoveragePath, 'TN:\n');
    const testConnection = createConnection();
    registerChecklistRequests(testConnection.connection, createState(workspaceRoot));

    const fileResult = await testConnection.request<{ result: null; error?: string }>(
      '$/preCr/runChecklist',
      { changes: [change(path.relative(workspaceRoot, externalSourcePath))] }
    );
    const coverageResult = await testConnection.request<{ result: null; error?: string }>(
      '$/preCr/runChecklist',
      { changes: [], baseCoveragePath: path.relative(workspaceRoot, externalCoveragePath) }
    );

    expect(fileResult.result).toBeNull();
    expect(fileResult.error).toContain('Rejected workspace path');
    expect(coverageResult.result).toBeNull();
    expect(coverageResult.error).toContain('Rejected workspace path');
  });

  it('rejects checklist file paths that escape through a symlink', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-request-workspace-');
    const externalRoot = makeTemporaryDirectory('pre-cr-request-external-');
    fs.writeFileSync(path.join(externalRoot, 'secret.ts'), 'export const secret = true;\n');
    fs.symlinkSync(externalRoot, path.join(workspaceRoot, 'linked'), 'dir');
    const testConnection = createConnection();
    registerChecklistRequests(testConnection.connection, createState(workspaceRoot));

    const result = await testConnection.request<{ result: null; error?: string }>(
      '$/preCr/runChecklist',
      { changes: [change('linked/secret.ts')] }
    );

    expect(result.result).toBeNull();
    expect(result.error).toContain('Rejected workspace path');
  });

  it('runs review estimation for normal workspace files and rejects paths outside the workspace', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-request-workspace-');
    const externalRoot = makeTemporaryDirectory('pre-cr-request-external-');
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'example.ts'), 'export const value = 1;\n');
    fs.writeFileSync(path.join(externalRoot, 'secret.ts'), 'export const secret = true;\n');
    fs.symlinkSync(externalRoot, path.join(workspaceRoot, 'linked'), 'dir');
    const testConnection = createConnection();
    registerReviewRequests(testConnection.connection, createState(workspaceRoot));

    const safeResult = await testConnection.request<{ estimate: unknown; error?: string }>(
      '$/preCr/estimateReviewTime',
      { changes: [change('src/example.ts')] }
    );
    const traversalResult = await testConnection.request<{ estimate: null; error?: string }>(
      '$/preCr/estimateReviewTime',
      { changes: [change(path.relative(workspaceRoot, path.join(externalRoot, 'secret.ts')))] }
    );
    const rejectedResult = await testConnection.request<{ estimate: null; error?: string }>(
      '$/preCr/estimateReviewTime',
      { changes: [change('linked/secret.ts')] }
    );

    expect(safeResult.error).toBeUndefined();
    expect(safeResult.estimate).not.toBeNull();
    expect(traversalResult.estimate).toBeNull();
    expect(traversalResult.error).toContain('Rejected workspace path');
    expect(rejectedResult.estimate).toBeNull();
    expect(rejectedResult.error).toContain('Rejected workspace path');
  });
});
