/**
 * BruteForceService — Aegis Vault Android
 * Extracted from SecurityModule.ts.
 * Manages exponential backoff lockout state to prevent brute-force attacks.
 */

export interface BruteForceState {
  failCount: number;
  lockUntil: number; // timestamp
  lastAttempt: number;
}

const BRUTE_FORCE_DECAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const BRUTE_FORCE_HARD_LOCK_SECONDS = [
  15 * 60, // 5 failures
  60 * 60, // 6 failures
  6 * 60 * 60, // 7 failures
  24 * 60 * 60, // 8 failures
  3 * 24 * 60 * 60, // 9 failures
  7 * 24 * 60 * 60, // 10+ failures
];

/**
 * Exponential backoff schedule:
 * 1-4 fails:  no delay
 * 5 fails:    15 min lockout
 * 6 fails:    60 min lockout
 * 7 fails:    6 hour lockout
 * 8 fails:    24 hour lockout
 * 9 fails:    72 hour lockout
 * 10+ fails:  7 day lockout
 */
export const getLockoutDuration = (failCount: number): number => {
  if (failCount < 5) return 0;
  const idx = Math.min(
    failCount - 5,
    BRUTE_FORCE_HARD_LOCK_SECONDS.length - 1,
  );
  return BRUTE_FORCE_HARD_LOCK_SECONDS[idx] * 1000;
};

/**
 * Decays the brute force counter based on elapsed time.
 * One failure is forgiven every 24 hours (decay window).
 */
export const decayBruteForceCounter = (state: BruteForceState, now: number): BruteForceState => {
  if (!state.lastAttempt) return state;
  const elapsed = now - state.lastAttempt;
  if (elapsed < BRUTE_FORCE_DECAY_WINDOW_MS) return state;

  const decaySteps = Math.floor(elapsed / BRUTE_FORCE_DECAY_WINDOW_MS);
  const newFailCount = Math.max(0, state.failCount - decaySteps);
  let newLockUntil = state.lockUntil;

  if (newFailCount < 5) {
    newLockUntil = 0;
  }

  return {
    ...state,
    failCount: newFailCount,
    lockUntil: newLockUntil,
  };
};

/**
 * Validates and normalizes brute force state from untrusted storage.
 */
export const normalizeBruteForceState = (value: any): BruteForceState => {
  const failCount = Number.isFinite(Number(value?.failCount))
    ? Math.max(0, Math.floor(Number(value.failCount)))
    : 0;
  const lockUntil = Number.isFinite(Number(value?.lockUntil))
    ? Math.max(0, Number(value.lockUntil))
    : 0;
  const lastAttempt = Number.isFinite(Number(value?.lastAttempt))
    ? Math.max(0, Number(value.lastAttempt))
    : 0;
  return { failCount, lockUntil, lastAttempt };
};

/**
 * Records a failed attempt and calculates the new lockout.
 */
export const recordFailedAttempt = (state: BruteForceState, now: number): BruteForceState => {
  const decayed = decayBruteForceCounter(state, now);
  const newFailCount = decayed.failCount + 1;
  const lockDuration = getLockoutDuration(newFailCount);

  return {
    failCount: newFailCount,
    lastAttempt: now,
    lockUntil: lockDuration > 0 ? now + lockDuration : 0,
  };
};

/**
 * Calculates remaining lockout seconds.
 */
export const getRemainingSeconds = (state: BruteForceState, now: number): number => {
  if (state.lockUntil <= now) return 0;
  return Math.ceil((state.lockUntil - now) / 1000);
};
