import { describe, expect, it } from 'vitest';
import { policy } from './policy';

describe('policy defaults', () => {
  it('keeps the tuned passage thresholds so changes are deliberate', () => {
    expect(policy.relevantMin).toBe(0.45);
    expect(policy.usableMin).toBe(0.55);
    expect(policy.injectionMax).toBe(0.7);
  });

  it('keeps the router confidence minimum', () => {
    expect(policy.routerMinConfidence).toBe(0.7);
  });

  it('keeps the retrieval bounds', () => {
    expect(policy.kbTopK).toBe(8);
    expect(policy.webMaxResults).toBe(5);
  });

  it('holds only the documented keys', () => {
    expect(Object.keys(policy).sort()).toEqual([
      'injectionMax',
      'kbTopK',
      'relevantMin',
      'rewriteMaxLength',
      'rewriteTimeoutMs',
      'routerMinConfidence',
      'usableMin',
      'webMaxResults',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(policy)).toBe(true);
  });
});
