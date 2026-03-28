/**
 * SecureAppSettings.test.ts — Aegis Vault Android v4.02
 * Tests for the centralized settings management module.
 */
import { SecureAppSettings } from '../src/SecureAppSettings';

// Mock database
const createMockDb = () => {
  const store: Record<string, string> = {};
  return {
    execute: jest.fn((sql: string, params?: any[]) => {
      if (sql.includes('CREATE TABLE')) return;
      if (sql.includes('INSERT OR REPLACE')) {
        store[params![0]] = params![1];
        return;
      }
      if (sql.includes('SELECT')) {
        const key = params![0];
        if (store[key]) {
          return { rows: { length: 1, item: () => ({ value: store[key] }) } };
        }
        return { rows: { length: 0 } };
      }
    }),
    _store: store,
  };
};

const createAsyncArrayRowsDb = () => {
  const store: Record<string, string> = {};
  return {
    execute: jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT OR REPLACE')) {
        store[params![0]] = params![1];
        return { rows: [] };
      }
      if (sql.includes('SELECT')) {
        const key = params![0];
        return { rows: store[key] ? [{ value: store[key] }] : [] };
      }
      return { rows: [] };
    }),
    _store: store,
  };
};

const createExecuteSyncDb = () => {
  const store: Record<string, string> = {};
  return {
    executeSync: jest.fn((sql: string, params?: any[]) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('INSERT OR REPLACE')) {
        store[params![0]] = params![1];
        return { rows: [] };
      }
      if (sql.includes('SELECT')) {
        const key = params![0];
        return { rows: store[key] ? [{ value: store[key] }] : [] };
      }
      return { rows: [] };
    }),
    _store: store,
  };
};

describe('SecureAppSettings', () => {
  beforeEach(() => {
    SecureAppSettings._resetForTest();
  });

  describe('init', () => {
    it('initializes with defaults when no stored state', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      const state = SecureAppSettings.get();
      expect(state.autoLockSeconds).toBe(60);
      expect(state.biometricEnabled).toBe(true);
      expect(state.darkMode).toBe(false);
      expect(state.themeMode).toBe('light');
      expect(state.passwordLength).toBe(20);
      expect(SecureAppSettings.isInitialized()).toBe(true);
    });

    it('loads persisted state from database', async () => {
      const db = createMockDb();
      db._store.app_settings_v1 = JSON.stringify({
        autoLockSeconds: 120,
        darkMode: true,
        passwordLength: 32,
      });
      await SecureAppSettings.init(db);
      const state = SecureAppSettings.get();
      expect(state.autoLockSeconds).toBe(120);
      expect(state.darkMode).toBe(true);
      expect(state.themeMode).toBe('dark');
      expect(state.passwordLength).toBe(32);
    });

    it('merges partial stored state with defaults', async () => {
      const db = createMockDb();
      db._store.app_settings_v1 = JSON.stringify({ darkMode: true });
      await SecureAppSettings.init(db);
      const state = SecureAppSettings.get();
      expect(state.darkMode).toBe(true);
      expect(state.autoLockSeconds).toBe(60); // default
      expect(state.biometricEnabled).toBe(true); // default
    });

    it('loads persisted state from async execute databases that return array rows', async () => {
      const db = createAsyncArrayRowsDb();
      db._store.app_settings_v1 = JSON.stringify({
        autoLockSeconds: 300,
        darkMode: true,
      });
      await SecureAppSettings.init(db);
      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(300);
      expect(SecureAppSettings.getValue('darkMode')).toBe(true);
    });

    it('loads persisted state from executeSync databases', async () => {
      const db = createExecuteSyncDb();
      db._store.app_settings_v1 = JSON.stringify({
        clipboardClearSeconds: 15,
        passwordLength: 24,
      });
      await SecureAppSettings.init(db);
      expect(SecureAppSettings.getValue('clipboardClearSeconds')).toBe(15);
      expect(SecureAppSettings.getValue('passwordLength')).toBe(24);
    });
  });

  describe('get', () => {
    it('returns a clone (not a reference)', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      const state1 = SecureAppSettings.get();
      const state2 = SecureAppSettings.get();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('getValue', () => {
    it('returns individual setting values', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(60);
      expect(SecureAppSettings.getValue('darkMode')).toBe(false);
    });
  });

  describe('update', () => {
    it('updates single setting', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ autoLockSeconds: 300 }, db);
      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(300);
    });

    it('syncs darkMode and themeMode', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ darkMode: true }, db);
      expect(SecureAppSettings.getValue('themeMode')).toBe('dark');
      await SecureAppSettings.update({ themeMode: 'light' }, db);
      expect(SecureAppSettings.getValue('darkMode')).toBe(false);
    });

    it('persists to database', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ passwordLength: 32 }, db);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE'),
        expect.any(Array),
      );
    });

    it('persists settings for executeSync databases across re-init', async () => {
      const db = createExecuteSyncDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ autoLockSeconds: 900, darkMode: true }, db);

      SecureAppSettings._resetForTest();
      await SecureAppSettings.init(db);

      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(900);
      expect(SecureAppSettings.getValue('darkMode')).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets to default state', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ darkMode: true, autoLockSeconds: 300 }, db);
      await SecureAppSettings.reset(db);
      expect(SecureAppSettings.getValue('darkMode')).toBe(false);
      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(60);
    });
  });

  describe('toVaultSettings', () => {
    it('returns backward-compatible VaultSettings format', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      const vs = SecureAppSettings.toVaultSettings();
      expect(vs).toHaveProperty('autoLockSeconds');
      expect(vs).toHaveProperty('biometricEnabled');
      expect(vs).toHaveProperty('clipboardClearSeconds');
      expect(vs).toHaveProperty('passwordLength');
      expect(vs).toHaveProperty('darkMode');
    });
  });

  describe('Security Center Reviews', () => {
    it('marks a triage item as reviewed', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.markReviewed('missing_2fa:1', 'missing_2fa', 'Test Login', db);
      const meta = SecureAppSettings.getReviewMeta('missing_2fa:1');
      expect(meta.reviewedAt).toBeTruthy();
      expect(meta.isExpired).toBe(false);
    });

    it('reopens a reviewed item', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.markReviewed('missing_2fa:1', 'missing_2fa', 'Test', db);
      await SecureAppSettings.reopenReview('missing_2fa:1', 'missing_2fa', 'Test', db);
      const meta = SecureAppSettings.getReviewMeta('missing_2fa:1');
      expect(meta.reviewedAt).toBeNull();
    });

    it('tracks review history', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.markReviewed('missing_2fa:1', 'missing_2fa', 'Test', db);
      const state = SecureAppSettings.get();
      expect(state.securityCenterHistory).toHaveLength(1);
      expect(state.securityCenterHistory[0].action).toBe('reviewed');
    });
  });
});
