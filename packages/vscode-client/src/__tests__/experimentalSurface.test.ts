import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
) as {
  contributes: {
    commands: Array<{ command: string; enablement?: string }>;
    configuration: { properties: Record<string, { default?: unknown }> };
    views: { preCrSuite: Array<{ id: string; when?: string }> };
  }
};

describe('experimental surface manifest', () => {
  it('keeps experimental tools disabled by default', () => {
    expect(manifest.contributes.configuration.properties['preCr.experimental.enabled'].default).toBe(false);
  });

  it('gates experimental commands on the opt-in context', () => {
    const experimentalCommands = manifest.contributes.commands.filter(({ command }) => (
      command.startsWith('preCr.') && [
        'showDashboard',
        'runChecklist',
        'quickSecurityScan',
        'generateDocs',
        'captureContext',
        'startDebugCapture'
      ].some((suffix) => command === `preCr.${suffix}`)
    ));

    expect(experimentalCommands.length).toBeGreaterThan(0);
    expect(experimentalCommands.every(({ enablement }) => enablement === 'preCr.experimentalEnabled')).toBe(true);
  });

  it('hides experimental views until the opt-in context is enabled', () => {
    const experimentalViews = manifest.contributes.views.preCrSuite.filter(({ id }) => (
      ['preCr.checklist', 'preCr.flakyTests', 'preCr.debugSessions'].includes(id)
    ));

    expect(experimentalViews).toHaveLength(3);
    expect(experimentalViews.every(({ when }) => when === 'preCr.experimentalEnabled')).toBe(true);
  });
});
