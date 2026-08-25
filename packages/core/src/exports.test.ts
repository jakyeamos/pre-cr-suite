import { describe, expect, it } from 'vitest';

import * as experimental from './experimental';
import * as stable from './index';

describe('core package entrypoints', () => {
  it('keeps legacy tools out of the stable beta entrypoint', () => {
    expect(stable).not.toHaveProperty('runChecklist');
    expect(stable).not.toHaveProperty('generateDocs');
    expect(stable).not.toHaveProperty('ContextManager');
    expect(stable).not.toHaveProperty('DebugSessionManager');
  });

  it('exposes legacy tools only through the explicit experimental entrypoint', () => {
    expect(experimental).toHaveProperty('runChecklist');
    expect(experimental).toHaveProperty('generateDocs');
    expect(experimental).toHaveProperty('ContextManager');
    expect(experimental).toHaveProperty('DebugSessionManager');
    expect(experimental).toHaveProperty('evaluateContributionProof');
  });
});
