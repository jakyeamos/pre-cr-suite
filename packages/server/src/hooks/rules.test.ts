import { describe, expect, it } from 'vitest';

import { DEFAULT_HOOK_RULE_POLICY, evaluateHookRules, hasSourceFiles } from './rules';

// quality-gate: allow static-ui-test: this file intentionally exercises the static UI test detector.

describe('evaluateHookRules', () => {
  it('flags deterministic AIOS-style blocking rules in staged source text', () => {
    const conflictMarker = '<<<<' + '<<< HEAD';
    const fakeToken = 'ghp_' + 'TESTING_PURPOSES_ONLY_NOT_A_REAL_TOKEN';
    const packageManagerCommand = 'Run npm ' + 'install before starting.\n';
    const messageHandler = 'window.addEventListener("mess' + 'age", () => undefined);';
    const secretLiteral = ['const tok', 'en = "', fakeToken, '";'].join('');
    const findings = evaluateHookRules([
      {
        path: 'src/app.ts',
        text: [
          conflictMarker,
          secretLiteral,
          'const value: any = 1;',
          messageHandler,
          'worker.postMessage({ ok: true });'
        ].join('\n')
      },
      {
        path: 'README.md',
        text: packageManagerCommand
      }
    ], DEFAULT_HOOK_RULE_POLICY);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/app.ts', line: 1, rule: 'conflict-marker', severity: 'block' }),
      expect.objectContaining({ path: 'src/app.ts', line: 2, rule: 'secret-literal', severity: 'block' }),
      expect.objectContaining({ path: 'src/app.ts', line: 3, rule: 'typescript-any', severity: 'block' }),
      expect.objectContaining({ path: 'src/app.ts', line: 4, rule: 'handler-before-send', severity: 'block' }),
      expect.objectContaining({ path: 'README.md', line: 1, rule: 'package-manager', severity: 'block' })
    ]));
  });

  it('warns for oversized source files by default', () => {
    const text = Array.from({ length: 506 }, (_, index) => `export const value${index} = ${index};`).join('\n');

    const findings = evaluateHookRules([{ path: 'src/large.ts', text }], DEFAULT_HOOK_RULE_POLICY);

    expect(findings).toEqual([
      expect.objectContaining({
        path: 'src/large.ts',
        line: 1,
        rule: 'oversized-source',
        severity: 'warn'
      })
    ]);
  });

  it('recognizes Rust as staged source and applies the source-size rule', () => {
    const text = Array.from(
      { length: 506 },
      (_, index) => `fn value${index}() -> usize { ${index} }`
    ).join('\n');

    expect(hasSourceFiles(['src/large.rs'])).toBe(true);
    expect(evaluateHookRules([{ path: 'src/large.rs', text }], DEFAULT_HOOK_RULE_POLICY)).toEqual([
      expect.objectContaining({
        path: 'src/large.rs',
        line: 1,
        rule: 'oversized-source',
        severity: 'warn'
      })
    ]);
  });

  it('detects weak Python tests and low-value static UI tests', () => {
    const findings = evaluateHookRules([
      {
        path: 'tests/test_smoke.py',
        text: 'def test_smoke():\n    run_app()\n'
      },
      {
        path: 'src/__tests__/component.test.tsx',
        text: [
          'import { renderToStaticMarkup } from "react-dom/server";',
          'it("renders copy", () => {',
          '  expect(renderToStaticMarkup(<div>Hello</div>)).toContain("Hello");',
          '});'
        ].join('\n')
      }
    ], DEFAULT_HOOK_RULE_POLICY);

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'tests/test_smoke.py', rule: 'weak-test', severity: 'block' }),
      expect.objectContaining({ path: 'src/__tests__/component.test.tsx', rule: 'low-value-static-ui-test', severity: 'block' })
    ]));
  });

  it('does not classify executable Python fixture sources as weak tests', () => {
    const findings = evaluateHookRules([
      {
        path: 'tests/fixtures/debug-executable/routes.py',
        text: 'def normalize_route(value):\n    return value.lower()\n'
      }
    ], DEFAULT_HOOK_RULE_POLICY);

    expect(findings).toEqual([]);
  });

  it('honors configured rule policy overrides', () => {
    const findings = evaluateHookRules([
      { path: 'src/app.ts', text: 'const value: any = 1;\n' }
    ], {
      ...DEFAULT_HOOK_RULE_POLICY,
      'typescript-any': 'off'
    });

    expect(findings).toEqual([]);
  });

  it('honors a documented package-manager exception for non-executable example text', () => {
    const allowedLine = '"good_example": "Run npm ' + 'test -- --runInBand" # quality-gate: allow package-manager: non-executable';
    const executableLine = 'subprocess.run("npm ' + 'test") # quality-gate: allow package-manager: non-executable';

    const findings = evaluateHookRules([
      { path: 'src/catalog.py', text: [allowedLine, executableLine].join('\n') }
    ], DEFAULT_HOOK_RULE_POLICY);

    expect(findings).toEqual([
      expect.objectContaining({ path: 'src/catalog.py', line: 2, rule: 'package-manager', severity: 'block' })
    ]);
  });
});
