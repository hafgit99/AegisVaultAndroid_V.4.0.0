/**
 * security/BruteForceService.test.ts
 * Unit tests for BruteForceService — backoff schedule, decay, normalization.
 */

import {
  getLockoutDuration,
  decayBruteForceCounter,
  normalizeBruteForceState,
  recordFailedAttempt,
  getRemainingSeconds,
  BruteForceState,
} from '../../src/security/BruteForceService';

describe('BruteForceService — getLockoutDuration', () => {
  it('returns 0 for 1-4 failures', () => {
    expect(getLockoutDuration(0)).toBe(0);
    expect(getLockoutDuration(1)).toBe(0);
    expect(getLockoutDuration(4)).toBe(0);
  });

  it('returns 15 minutes for 5 failures', () => {
    expect(getLockoutDuration(5)).toBe(15 * 60 * 1000);
  });

  it('returns 60 minutes for 6 failures', () => {
    expect(getLockoutDuration(6)).toBe(60 * 60 * 1000);
  });

  it('caps at 7 days for 10+ failures', () => {
    expect(getLockoutDuration(10)).toBe(7 * 24 * 60 * 60 * 1000);
    expect(getLockoutDuration(100)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('BruteForceService — decayBruteForceCounter', () => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('does not decay if under the window', () => {
    const state: BruteForceState = { failCount: 5, lockUntil: 0, lastAttempt: now - 1000 };
    const result = decayBruteForceCounter(state, now);
    expect(result.failCount).toBe(5);
  });

  it('decays by 1 after 24 hours', () => {
    const state: BruteForceState = { failCount: 5, lockUntil: 0, lastAttempt: now - DAY_MS - 1000 };
    const result = decayBruteForceCounter(state, now);
    expect(result.failCount).toBe(4);
  });

  it('decays to 0 after many days', () => {
    const state: BruteForceState = { failCount: 10, lockUntil: 0, lastAttempt: now - 11 * DAY_MS };
    const result = decayBruteForceCounter(state, now);
    expect(result.failCount).toBe(0);
  });

  it('clears lockUntil if failCount drops below 5', () => {
    const state: BruteForceState = { failCount: 5, lockUntil: now + 1000, lastAttempt: now - DAY_MS };
    const result = decayBruteForceCounter(state, now);
    expect(result.failCount).toBe(4);
    expect(result.lockUntil).toBe(0);
  });
});

describe('BruteForceService — normalizeBruteForceState', () => {
  it('returns defaults for invalid input', () => {
    expect(normalizeBruteForceState(null)).toEqual({ failCount: 0, lockUntil: 0, lastAttempt: 0 });
    expect(normalizeBruteForceState({})).toEqual({ failCount: 0, lockUntil: 0, lastAttempt: 0 });
    expect(normalizeBruteForceState({ failCount: 'abc' })).toEqual({ failCount: 0, lockUntil: 0, lastAttempt: 0 });
  });

  it('keeps valid numeric values', () => {
    const valid = { failCount: 3, lockUntil: 1234567, lastAttempt: 1234000 };
    expect(normalizeBruteForceState(valid)).toEqual(valid);
  });

  it('floors failCount', () => {
    expect(normalizeBruteForceState({ failCount: 3.8 }).failCount).toBe(3);
  });

  it('ensures non-negative values', () => {
    expect(normalizeBruteForceState({ failCount: -5 }).failCount).toBe(0);
  });
});

describe('BruteForceService — recordFailedAttempt', () => {
  it('increments failCount and sets lastAttempt', () => {
    const now = Date.now();
    const state: BruteForceState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    const result = recordFailedAttempt(state, now);
    expect(result.failCount).toBe(1);
    expect(result.lastAttempt).toBe(now);
  });

  it('sets lockUntil on 5th failure', () => {
    const now = Date.now();
    const state: BruteForceState = { failCount: 4, lockUntil: 0, lastAttempt: now - 1000 };
    const result = recordFailedAttempt(state, now);
    expect(result.failCount).toBe(5);
    expect(result.lockUntil).toBe(now + 15 * 60 * 1000);
  });
});

describe('BruteForceService — getRemainingSeconds', () => {
  it('returns 0 if not locked', () => {
    expect(getRemainingSeconds({ failCount: 0, lockUntil: 0, lastAttempt: 0 }, Date.now())).toBe(0);
  });

  it('returns rounded up seconds if locked', () => {
    const now = 1000000;
    const lockUntil = 1005500; // 5.5 seconds
    expect(getRemainingSeconds({ failCount: 5, lockUntil, lastAttempt: 0 }, now)).toBe(6);
  });
});
