import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('VS Code package contract', () => {
  it('exposes the 5.6 IDE entry points', () => {
    const commands = packageJson.contributes.commands.map(command => command.command);
    const views = packageJson.contributes.views.preCrSuite.map(view => view.id);
    const paletteCommands = packageJson.contributes.menus.commandPalette.map(item => item.command);
    const keybindings = packageJson.contributes.keybindings.map(binding => binding.command);

    expect(packageJson.version).toBe('0.2.0');
    expect(packageJson.repository.url).toBe('https://github.com/jakyeamos/pre-cr-suite');
    expect(views).toContain('preCr.context');
    expect(commands).toEqual(expect.arrayContaining([
      'preCr.showQuickActions',
      'preCr.whereWasI',
      'preCr.captureContext',
      'preCr.restoreContext',
      'preCr.fixSetup',
      'preCr.toggleCoverageOverlay'
    ]));
    expect(paletteCommands).toEqual(expect.arrayContaining([
      'preCr.showQuickActions',
      'preCr.whereWasI',
      'preCr.restoreContext',
      'preCr.fixSetup'
    ]));
    expect(keybindings).toEqual(expect.arrayContaining([
      'preCr.showQuickActions',
      'preCr.whereWasI',
      'preCr.restoreContext',
      'preCr.nextIssue',
      'preCr.prevIssue'
    ]));
  });

  it('keeps the walkthrough honest about the enforcement boundary and local state', () => {
    const walkthrough = packageJson.contributes.walkthroughs[0];
    const text = JSON.stringify(walkthrough);

    expect(text).toContain('enforcement');
    expect(text).toContain('local');
    expect(text).toContain('document contents');
    expect(text).not.toContain('Experimental');
  });
});
