import { mkdir, appendFile } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

import { resolveWorkspacePath } from '@pre-cr/core';

import type { HookAuditConfig, HookFinding } from './types';

interface HookAuditEvent {
  schema_version: '1.0';
  event_id: string;
  timestamp: string;
  gate: 'Pre-CR';
  rule_id: string;
  severity: 'warning' | 'error';
  decision: 'warn' | 'block';
  summary: string;
  evidence: Array<{
    file: string;
    line_start: number;
    line_end: number;
    reason: string;
  }>;
}

export type HookAuditAppendResult =
  | { written: true; path: string; eventCount: number }
  | { written: false; reason: 'disabled' | 'no-findings' | 'rejected-path'; error?: string };

type AuditPathResolution =
  | { valid: true; path: string }
  | { valid: false; error: string };

export async function appendHookAuditEvents(
  workspaceRoot: string,
  config: HookAuditConfig,
  findings: HookFinding[]
): Promise<HookAuditAppendResult> {
  if (!config.enabled) {
    return { written: false, reason: 'disabled' };
  }

  if (findings.length === 0) {
    return { written: false, reason: 'no-findings' };
  }

  const initialPath = resolveAuditPath(workspaceRoot, config.path);
  if (!initialPath.valid) {
    return { written: false, reason: 'rejected-path', error: initialPath.error };
  }

  const auditPath = initialPath.path;
  await mkdir(path.dirname(auditPath), { recursive: true });

  // Re-resolve after directory creation so a symlink inserted into a missing
  // directory hierarchy cannot redirect the subsequent append outside the
  // workspace.
  const resolvedAuditPath = resolveAuditPath(workspaceRoot, config.path);
  if (!resolvedAuditPath.valid) {
    return { written: false, reason: 'rejected-path', error: resolvedAuditPath.error };
  }

  const events = findings.map(toAuditEvent).map((event) => `${JSON.stringify(event)}\n`).join('');
  await appendFile(resolvedAuditPath.path, events);
  return {
    written: true,
    path: resolvedAuditPath.path,
    eventCount: findings.length
  };
}

function resolveAuditPath(
  workspaceRoot: string,
  requestedPath: unknown
): AuditPathResolution {
  if (typeof requestedPath !== 'string') {
    return {
      valid: false,
      error: 'Rejected audit path: path must be a string'
    };
  }

  const result = resolveWorkspacePath(workspaceRoot, requestedPath, { access: 'write' });
  if (!result.valid) {
    return {
      valid: false,
      error: `Rejected audit path: ${result.error}`
    };
  }

  return { valid: true, path: result.realPath ?? result.resolvedPath };
}

function toAuditEvent(finding: HookFinding): HookAuditEvent {
  return {
    schema_version: '1.0',
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    gate: 'Pre-CR',
    rule_id: finding.rule,
    severity: finding.severity === 'block' ? 'error' : 'warning',
    decision: finding.severity,
    summary: `Pre-CR ${finding.severity}: ${finding.message}`,
    evidence: [
      {
        file: finding.path,
        line_start: finding.line,
        line_end: finding.line,
        reason: finding.message
      }
    ]
  };
}
