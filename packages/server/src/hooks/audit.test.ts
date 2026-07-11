import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { appendHookAuditEvents } from './audit';
import type { HookFinding } from './types';

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function warningFinding(): HookFinding {
  return {
    path: 'src/example.ts',
    line: 3,
    rule: 'typescript-any',
    message: 'Avoid any',
    severity: 'warn'
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('appendHookAuditEvents', () => {
  it('writes audit events under the workspace', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-audit-workspace-');

    const result = await appendHookAuditEvents(
      workspaceRoot,
      { enabled: true, path: '.pre-cr/audit.jsonl' },
      [warningFinding()]
    );

    const auditPath = path.join(workspaceRoot, '.pre-cr', 'audit.jsonl');
    expect(result).toEqual({ written: true, path: auditPath, eventCount: 1 });
    expect(JSON.parse(fs.readFileSync(auditPath, 'utf-8'))).toMatchObject({
      gate: 'Pre-CR',
      rule_id: 'typescript-any'
    });
  });

  it('rejects audit paths that traverse outside the workspace', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-audit-workspace-');
    const externalRoot = makeTemporaryDirectory('pre-cr-audit-external-');
    const externalAuditPath = path.join(externalRoot, 'audit.jsonl');

    const result = await appendHookAuditEvents(
      workspaceRoot,
      { enabled: true, path: path.relative(workspaceRoot, externalAuditPath) },
      [warningFinding()]
    );

    expect(result).toMatchObject({ written: false, reason: 'rejected-path' });
    expect(fs.existsSync(externalAuditPath)).toBe(false);
  });

  it('rejects audit paths that escape through a symlink', async () => {
    const workspaceRoot = makeTemporaryDirectory('pre-cr-audit-workspace-');
    const externalRoot = makeTemporaryDirectory('pre-cr-audit-external-');
    const externalAuditPath = path.join(externalRoot, 'audit.jsonl');
    fs.symlinkSync(externalRoot, path.join(workspaceRoot, 'audit-link'), 'dir');

    const result = await appendHookAuditEvents(
      workspaceRoot,
      { enabled: true, path: 'audit-link/audit.jsonl' },
      [warningFinding()]
    );

    expect(result).toMatchObject({ written: false, reason: 'rejected-path' });
    expect(fs.existsSync(externalAuditPath)).toBe(false);
  });
});
