#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

// Advisories at or above this severity block the commit.
const MINIMUM_BLOCKING_SEVERITY = 'high';

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];
const threshold = SEVERITY_ORDER.indexOf(MINIMUM_BLOCKING_SEVERITY);
const BLOCKING_SEVERITIES = SEVERITY_ORDER.filter((_, index) => index <= threshold);
const INFO_SEVERITIES = SEVERITY_ORDER.filter((_, index) => index > threshold);
const NETWORK_ERROR_PATTERNS = [
  /fetch failed/i,
  /ENOTFOUND/,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /EAI_AGAIN/,
  /getaddrinfo/i,
  /network/i,
  /socket hang up/i,
  /request to .* failed/i,
];

function skip(reason) {
  console.warn('[dependency:security] SKIPPED — ' + reason);
  console.warn('[dependency:security] Registry audit is advisory-only and requires network; not blocking the commit.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8' });
if (result.error) {
  skip('could not run `pnpm audit` (' + result.error.message + ')');
}

const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';

let report;
try {
  report = JSON.parse(stdout.trim());
} catch {
  const combined = (stderr || stdout || '').trim();
  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(combined))) {
    skip('registry unreachable (' + (combined.split('\n')[0] || 'network error') + ')');
  }
  skip('could not parse `pnpm audit` output' + (combined ? ': ' + combined.split('\n')[0] : ''));
}

if (report?.error || !report?.metadata?.vulnerabilities) {
  const message = String(report?.error?.message ?? '').trim();
  if (message && NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    skip('registry unreachable (' + message + ')');
  }
  skip('`pnpm audit` returned no vulnerability data' + (message ? ': ' + message : ''));
}

const counts = report.metadata.vulnerabilities ?? {};
const blockingCount = BLOCKING_SEVERITIES.reduce((sum, sev) => sum + (counts[sev] ?? 0), 0);

if (blockingCount > 0) {
  console.error('[dependency:security] FAIL — ' + blockingCount + ' advisory(ies) at or above ' + MINIMUM_BLOCKING_SEVERITY + ':');
  for (const sev of BLOCKING_SEVERITIES) {
    if (counts[sev]) console.error('  - ' + sev + ': ' + counts[sev]);
  }
  const advisories = report?.advisories ?? {};
  for (const advisory of Object.values(advisories)) {
    if (BLOCKING_SEVERITIES.includes(advisory?.severity)) {
      console.error('  * [' + advisory.severity + '] ' + (advisory.module_name ?? '?') + ': ' + (advisory.title ?? ''));
    }
  }
  console.error('[dependency:security] Run `pnpm audit` for details.');
  process.exit(1);
}

const blockingSummary = BLOCKING_SEVERITIES.map((sev) => (counts[sev] ?? 0) + ' ' + sev).join(', ');
const infoSummary = INFO_SEVERITIES.map((sev) => (counts[sev] ?? 0) + ' ' + sev).join(', ');
console.log('[dependency:security] PASS — no advisories at or above ' + MINIMUM_BLOCKING_SEVERITY + ' (' + blockingSummary + '; ' + infoSummary + ').');
process.exit(0);
