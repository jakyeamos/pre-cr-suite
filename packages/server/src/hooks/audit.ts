import { mkdir, appendFile } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

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

export async function appendHookAuditEvents(
  workspaceRoot: string,
  config: HookAuditConfig,
  findings: HookFinding[]
): Promise<void> {
  if (!config.enabled || findings.length === 0) {
    return;
  }

  const auditPath = path.resolve(workspaceRoot, config.path);
  await mkdir(path.dirname(auditPath), { recursive: true });
  const events = findings.map(toAuditEvent).map((event) => `${JSON.stringify(event)}\n`).join('');
  await appendFile(auditPath, events);
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
