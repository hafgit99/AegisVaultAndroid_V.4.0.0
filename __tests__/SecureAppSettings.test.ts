/**
 * SecureAppSettings.test.ts — Aegis Vault Android v4.02
 * Tests for the centralized settings management module.
 */
import { SecureAppSettings } from '../src/SecureAppSettings';
import { DeviceEventEmitter } from 'react-native';

jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn(),
  },
}));

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
    jest.clearAllMocks();
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
        validationRecords: [
          {
            id: 'validation_1',
            createdAt: '2026-04-16T10:00:00.000Z',
            updatedAt: '2026-04-16T10:00:00.000Z',
            priority: 'P0',
            deviceId: 'pixel-8',
            vendor: 'Google',
            model: 'Pixel 8',
            androidVersion: '15',
            scenario: 'passkey_create',
            result: 'PASS',
          },
        ],
      });
      await SecureAppSettings.init(db);
      const state = SecureAppSettings.get();
      expect(state.autoLockSeconds).toBe(120);
      expect(state.darkMode).toBe(true);
      expect(state.themeMode).toBe('dark');
      expect(state.passwordLength).toBe(32);
      expect(state.validationRecords).toHaveLength(1);
      expect(state.validationRecords[0].deviceId).toBe('pixel-8');
      expect(state.syncHealth.relayReachable).toBe(null);
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

    it('maps themeMode back to darkMode when only themeMode is stored', async () => {
      const db = createMockDb();
      db._store.app_settings_v1 = JSON.stringify({ themeMode: 'dark' });

      await SecureAppSettings.init(db);

      expect(SecureAppSettings.getValue('themeMode')).toBe('dark');
      expect(SecureAppSettings.getValue('darkMode')).toBe(true);
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

    it('falls back to defaults and sets initialized when init fails', async () => {
      const db = {
        execute: jest.fn(async () => {
          throw new Error('db failed');
        }),
      };

      await SecureAppSettings.init(db);

      expect(SecureAppSettings.isInitialized()).toBe(true);
      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(60);
      expect(SecureAppSettings.getValue('themeMode')).toBe('light');
    });

    it('falls back to defaults when persisted JSON is malformed', async () => {
      const db = createMockDb();
      db._store.app_settings_v1 = '{not-valid-json';

      await SecureAppSettings.init(db);

      expect(SecureAppSettings.isInitialized()).toBe(true);
      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(60);
      expect(SecureAppSettings.getValue('darkMode')).toBe(false);
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

    it('clones validation records deeply', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({
        validationRecords: [
          {
            id: 'validation_1',
            createdAt: '2026-04-16T10:00:00.000Z',
            updatedAt: '2026-04-16T10:00:00.000Z',
            priority: 'P0',
            deviceId: 'pixel-8',
            vendor: 'Google',
            model: 'Pixel 8',
            androidVersion: '15',
            scenario: 'passkey_auth',
            result: 'PASS',
          },
        ],
      });

      const state = SecureAppSettings.get();
      state.validationRecords[0].deviceId = 'mutated';

      expect(SecureAppSettings.get().validationRecords[0].deviceId).toBe('pixel-8');
    });

    it('clones sync health deeply', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({
        syncHealth: {
          relayReachable: true,
          relayCheckedAt: '2026-04-16T10:00:00.000Z',
          lastSyncError: 'temporary',
        },
      });

      const state = SecureAppSettings.get();
      state.syncHealth.lastSyncError = 'mutated';

      expect(SecureAppSettings.get().syncHealth.lastSyncError).toBe('temporary');
    });

    it('clones nested shared spaces and browser pairings deeply', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({
        sharedSpaces: [
          {
            id: 'space-1',
            name: 'Family',
            kind: 'family',
            members: [
              {
                id: 'member-1',
                name: 'Alice',
                role: 'owner',
                status: 'active',
              },
            ],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          } as any,
        ],
        browserPairings: [
          {
            id: 'pair-1',
            label: 'Chrome',
            platform: 'browser_extension',
            status: 'paired',
            pairingCode: '123456',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const state = SecureAppSettings.get();
      state.sharedSpaces[0].members[0].name = 'Mutated';
      state.browserPairings[0].label = 'Mutated';

      expect(SecureAppSettings.get().sharedSpaces[0].members[0].name).toBe('Alice');
      expect(SecureAppSettings.get().browserPairings[0].label).toBe('Chrome');
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

    it('maps themeMode dark updates back into darkMode', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);

      await SecureAppSettings.update({ themeMode: 'dark' }, db);

      expect(SecureAppSettings.getValue('themeMode')).toBe('dark');
      expect(SecureAppSettings.getValue('darkMode')).toBe(true);
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

    it('emits settings changed event after update even without db', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);

      await SecureAppSettings.update({ passwordLength: 64 });

      expect(DeviceEventEmitter.emit).toHaveBeenCalledWith(
        'aegis_settings_changed',
        expect.objectContaining({ passwordLength: 64 }),
      );
    });

    it('swallows save failures but keeps in-memory state updated', async () => {
      const db = {
        execute: jest.fn(async (sql: string) => {
          if (sql.includes('CREATE TABLE')) return { rows: [] };
          if (sql.includes('SELECT')) return { rows: [] };
          if (sql.includes('INSERT OR REPLACE')) {
            throw new Error('write failed');
          }
          return { rows: [] };
        }),
      };

      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ autoLockSeconds: 999 }, db);

      expect(SecureAppSettings.getValue('autoLockSeconds')).toBe(999);
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

    it('removes persisted settings row when reset receives db', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ darkMode: true }, db);

      await SecureAppSettings.reset(db);

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM aegis_settings_v1'),
        ['app_settings_v1'],
      );
    });

    it('resets initialization flag for fresh boot flows', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      expect(SecureAppSettings.isInitialized()).toBe(true);

      await SecureAppSettings.reset();

      expect(SecureAppSettings.isInitialized()).toBe(true);
      SecureAppSettings._resetForTest();
      expect(SecureAppSettings.isInitialized()).toBe(false);
    });

    it('emits settings changed event with default state after reset', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update({ darkMode: true, passwordLength: 40 }, db);

      await SecureAppSettings.reset(db);

      expect(DeviceEventEmitter.emit).toHaveBeenLastCalledWith(
        'aegis_settings_changed',
        expect.objectContaining({
          darkMode: false,
          themeMode: 'light',
          passwordLength: 20,
        }),
      );
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

    it('maps device trust flags into legacy vault settings shape', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update(
        {
          deviceTrustPolicy: 'strict',
          biometricEnabled: false,
          rootDetectionEnabled: false,
          rootBlocksVault: true,
          degradedDeviceAction: 'block',
        },
        db,
      );

      const vs = SecureAppSettings.toVaultSettings();
      expect(vs.deviceTrustPolicy).toEqual({
        deviceTrustPolicy: 'strict',
        requireBiometric: false,
        rootDetectionEnabled: false,
        rootBlocksVault: true,
        degradedDeviceAction: 'block',
      });
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

    it('returns expired review metadata after seven days', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update(
        {
          securityCenterReviews: {
            'missing_2fa:1': new Date(
              Date.now() - 8 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        },
        db,
      );

      const meta = SecureAppSettings.getReviewMeta('missing_2fa:1');
      expect(meta.reviewedAt).toBeTruthy();
      expect(meta.isExpired).toBe(true);
    });

    it('treats exact 7 day review age as not expired yet', async () => {
      const now = 1_800_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.update(
        {
          securityCenterReviews: {
            'missing_2fa:1': new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        db,
      );

      const meta = SecureAppSettings.getReviewMeta('missing_2fa:1');
      expect(meta.reviewedAt).toBeTruthy();
      expect(meta.isExpired).toBe(false);
    });

    it('returns null metadata for review keys that were never reviewed', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);

      expect(SecureAppSettings.getReviewMeta('unknown:key')).toEqual({
        reviewedAt: null,
        isExpired: false,
      });
    });

    it('adds reopened events to history and clears persisted review metadata', async () => {
      const db = createMockDb();
      await SecureAppSettings.init(db);
      await SecureAppSettings.markReviewed('weak_password:7', 'weak_password', 'Legacy item', db);

      await SecureAppSettings.reopenReview('weak_password:7', 'weak_password', 'Legacy item', db);

      const state = SecureAppSettings.get();
      expect(state.securityCenterReviews['weak_password:7']).toBeUndefined();
      expect(state.securityCenterHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'reopened',
            reviewKey: 'weak_password:7',
            issueType: 'weak_password',
            title: 'Legacy item',
          }),
        ]),
      );
    });
  });
});
