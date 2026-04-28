/**
 * useAutoLock — Aegis Vault Android
 * Extracted from Dashboard.tsx.
 * Handles AppState-based auto-lock, timer reset and lock callback.
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SecurityModule } from '../SecurityModule';
import { AutofillService } from '../AutofillService';

interface UseAutoLockOptions {
  unlocked: boolean;
  autoLockSeconds: number;
  onLock: (reason: 'manual' | 'auto') => void;
}

export const useAutoLock = ({ unlocked, autoLockSeconds, onLock }: UseAutoLockOptions) => {
  const backgroundTimeRef = useRef<number | null>(null);
  const unlockedRef = useRef(unlocked);
  const autoLockSecondsRef = useRef(autoLockSeconds);

  useEffect(() => { unlockedRef.current = unlocked; }, [unlocked]);
  useEffect(() => { autoLockSecondsRef.current = autoLockSeconds; }, [autoLockSeconds]);

  const lockVault = useCallback((reason: 'manual' | 'auto') => {
    SecurityModule.lockVault();
    onLock(reason);
  }, [onLock]);

  // AppState listener — handles background/foreground transitions
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (SecurityModule.isPickingFileFlag) return;
      if (!unlockedRef.current) return;

      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimeRef.current = Date.now();
        if (autoLockSecondsRef.current === 0) return;
        SecurityModule.startAutoLockTimer(autoLockSecondsRef.current, () => lockVault('auto'));
      } else if (nextState === 'active') {
        if (backgroundTimeRef.current !== null) {
          const elapsed = (Date.now() - backgroundTimeRef.current) / 1000;
          backgroundTimeRef.current = null;
          const lockSecs = autoLockSecondsRef.current;
          if (lockSecs > 0 && elapsed >= lockSecs) {
            lockVault('auto');
          } else if (lockSecs > 0) {
            SecurityModule.resetAutoLockTimer(lockSecs, () => lockVault('auto'));
          }
        }
        AutofillService.setUnlocked(true);
      }
    });
    return () => sub.remove();
  }, [lockVault]);

  // Timer-based auto-lock when unlocked
  useEffect(() => {
    if (unlocked && autoLockSeconds > 0) {
      SecurityModule.startAutoLockTimer(autoLockSeconds, () => lockVault('auto'));
    }
    return () => { SecurityModule.clearAutoLockTimer(); };
  }, [unlocked, autoLockSeconds, lockVault]);

  // Reset the timer on user interaction
  const resetTimer = useCallback(() => {
    if (unlockedRef.current && autoLockSecondsRef.current > 0) {
      SecurityModule.resetAutoLockTimer(autoLockSecondsRef.current, () => lockVault('auto'));
    }
  }, [lockVault]);

  return { resetTimer, lockVault };
};
