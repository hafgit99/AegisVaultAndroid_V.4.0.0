/**
 * PasskeyBindingService.test.ts — Aegis Vault Android v4.2.0
 * Hardened mutation-killing tests for FIDO2 passkey binding lifecycle.
 */
import { PasskeyBindingService, PASSKEY_STATE_CHANGED } from '../src/PasskeyBindingService';
import { DeviceEventEmitter } from 'react-native';

const createMockDb = () => {
  const store: Record<string, string> = {};
  return {
    execute: jest.fn<
      { rows: { length: number; item?: () => { value: string } } } | undefined,
      [string, (any[] | undefined)?]
    >((sql: string, params?: any[]) => {
      if (sql.includes('SELECT')) {
        const val = store[params![0]];
        return val ? { rows: { length: 1, item: () => ({ value: val }) } } : { rows: { length: 0 } };
      }
      if (sql.includes('INSERT OR REPLACE')) {
        store[params![0]] = params![1];
      }
      return undefined;
    }),
    _store: store,
  };
};

describe('PasskeyBindingService', () => {
  beforeEach(() => {
    PasskeyBindingService._resetForTest();
    jest.clearAllMocks();
  });

  // ── init ────────────────────────────────────────────────────

  describe('init', () => {
    it('initializes with default state when db is empty', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.bindings).toEqual({});
      expect(state.auditLog).toEqual([]);
      expect(state.revocations).toEqual([]);
      expect(state.policy.maxBindingAgeDays).toBe(90);
      expect(state.policy.blockRevokedCredentials).toBe(true);
      expect(state.policy.requireRecoveryExportBeforeRotation).toBe(false);
    });

    it('loads persisted state from db', async () => {
      const db = createMockDb();
      db._store.app_passkey_state_v1 = JSON.stringify({
        bindings: { cred1: { credentialId: 'cred1', meta: { createdAt: '2020-01-01' } } },
      });
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.bindings.cred1.credentialId).toBe('cred1');
    });

    it('merges default policy with persisted partial policy', async () => {
      const db = createMockDb();
      db._store.app_passkey_state_v1 = JSON.stringify({
        bindings: {},
        policy: { maxBindingAgeDays: 30 },
      });
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.policy.maxBindingAgeDays).toBe(30);
      expect(state.policy.blockRevokedCredentials).toBe(true); // default preserved
    });

    it('handles init failure gracefully with default state', async () => {
      const db = createMockDb();
      db.execute = jest.fn<
        { rows: { length: number; item?: () => { value: string } } } | undefined,
        [string, (any[] | undefined)?]
      >(() => { throw new Error('db crash'); });
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.bindings).toEqual({});
      expect(state.policy.maxBindingAgeDays).toBe(90);
    });

    it('skips re-initialization', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      db._store.app_passkey_state_v1 = JSON.stringify({ bindings: { new: {} } });
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.bindings.new).toBeUndefined(); // not reloaded
    });
  });

  // ── get ─────────────────────────────────────────────────────

  describe('get', () => {
    it('returns a deep clone (mutations to result do not affect internal state)', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const state1 = PasskeyBindingService.get();
      state1.bindings.injected = {} as any;
      const state2 = PasskeyBindingService.get();
      expect(state2.bindings.injected).toBeUndefined();
    });
  });

  // ── saveBinding ─────────────────────────────────────────────

  describe('saveBinding', () => {
    it('saves a new binding with audit log entry', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);

      const record = {
        credentialId: 'cred123',
        encryptedPayload: 'enc-payload',
        prfSalt: 'salt',
        meta: { createdAt: '', lastUsedAt: '', version: 1 },
        eventLog: [],
      };
      await PasskeyBindingService.saveBinding(record as any, db);

      const state = PasskeyBindingService.get();
      expect(state.bindings.cred123).toBeDefined();
      expect(state.bindings.cred123.encryptedPayload).toBe('enc-payload');
      expect(state.bindings.cred123.prfSalt).toBe('salt');
      expect(state.auditLog).toHaveLength(1);
      expect(state.auditLog[0].type).toBe('bound');
      expect(state.auditLog[0].credentialId).toBe('cred123');
      expect(typeof state.auditLog[0].at).toBe('string');
      expect(state.auditLog[0].detail).toBe('Passkey bound.');
    });

    it('fills in default meta when missing', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);

      await PasskeyBindingService.saveBinding({
        credentialId: 'c1', meta: {}, eventLog: [],
      } as any, db);

      const binding = PasskeyBindingService.get().bindings.c1;
      expect(typeof binding.meta.createdAt).toBe('string');
      expect(binding.meta.createdAt.length).toBeGreaterThan(0);
      expect(typeof binding.meta.lastUsedAt).toBe('string');
      expect(typeof binding.meta.deviceLabel).toBe('string');
      expect(typeof binding.meta.deviceFingerprint).toBe('string');
    });

    it('marks as rotation when binding already exists', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);

      await PasskeyBindingService.saveBinding({
        credentialId: 'rotate-me', meta: {}, eventLog: [],
      } as any, db);

      await PasskeyBindingService.saveBinding({
        credentialId: 'rotate-me', meta: {}, eventLog: [],
      } as any, db);

      const state = PasskeyBindingService.get();
      expect(state.auditLog[0].type).toBe('bound');
      expect(state.auditLog[1].type).toBe('rotated');
      expect(state.auditLog[1].detail).toBe('Passkey rotated.');
      expect(state.bindings['rotate-me'].meta.rotatedAt).toBeDefined();
      expect(state.bindings['rotate-me'].meta.rotatedFromCredentialId).toBe('rotate-me');
    });

    it('emits state change event', async () => {
      const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({
        credentialId: 'ev-test', meta: {}, eventLog: [],
      } as any, db);
      expect(emitSpy).toHaveBeenCalledWith(PASSKEY_STATE_CHANGED, expect.any(Object));
    });

    it('persists to db after save', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({
        credentialId: 'persist-test', meta: {}, eventLog: [],
      } as any, db);
      expect(db._store.app_passkey_state_v1).toBeDefined();
      const stored = JSON.parse(db._store.app_passkey_state_v1);
      expect(stored.bindings['persist-test']).toBeDefined();
    });

    it('limits event log to 20 entries', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const longLog = Array.from({ length: 25 }, (_unused, _index) => ({
        at: new Date().toISOString(), type: 'used' as const, credentialId: 'c',
      }));
      await PasskeyBindingService.saveBinding({
        credentialId: 'log-limit', meta: {}, eventLog: longLog,
      } as any, db);
      const binding = PasskeyBindingService.get().bindings['log-limit'];
      expect(binding.eventLog.length).toBeLessThanOrEqual(21); // 20 + 1 new
    });
  });

  // ── revokeBinding ───────────────────────────────────────────

  describe('revokeBinding', () => {
    it('removes binding and records revocation', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({
        credentialId: 'rev1', meta: {}, eventLog: [],
      } as any, db);

      await PasskeyBindingService.revokeBinding('rev1', 'lost_device', db);

      const state = PasskeyBindingService.get();
      expect(state.bindings.rev1).toBeUndefined();
      expect(state.revocations).toHaveLength(1);
      expect(state.revocations[0].credentialId).toBe('rev1');
      expect(state.revocations[0].reason).toBe('lost_device');
      expect(typeof state.revocations[0].revokedAt).toBe('string');
      expect(state.auditLog.some(e => e.type === 'revoked')).toBe(true);
    });

    it('does nothing for non-existent credential', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.revokeBinding('nonexistent', 'test', db);
      const state = PasskeyBindingService.get();
      expect(state.revocations).toHaveLength(0);
    });
  });

  // ── updateLastUsed ──────────────────────────────────────────

  describe('updateLastUsed', () => {
    it('updates lastUsedAt and appends usage event', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({
        credentialId: 'use1', meta: { createdAt: '2020-01-01', lastUsedAt: '2020-01-01' }, eventLog: [],
      } as any, db);

      await PasskeyBindingService.updateLastUsed('use1', db);

      const state = PasskeyBindingService.get();
      expect(state.bindings.use1.meta.lastUsedAt).not.toBe('2020-01-01');
      expect(state.auditLog.some(e => e.type === 'used' && e.credentialId === 'use1')).toBe(true);
    });

    it('does nothing for non-existent credential', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const auditsBefore = PasskeyBindingService.get().auditLog.length;
      await PasskeyBindingService.updateLastUsed('nonexist', db);
      expect(PasskeyBindingService.get().auditLog.length).toBe(auditsBefore);
    });
  });

  // ── getPolicyViolations ─────────────────────────────────────

  describe('getPolicyViolations', () => {
    it('detects rotation requirement for old passkeys', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      await PasskeyBindingService.saveBinding({
        credentialId: 'oldie', meta: { createdAt: oldDate }, eventLog: [],
      } as any, db);

      const violations = PasskeyBindingService.getPolicyViolations('oldie');
      expect(violations).toContain('PASSKEY_ROTATION_REQUIRED');
    });

    it('returns no violations for fresh passkey', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({
        credentialId: 'fresh', meta: { createdAt: new Date().toISOString() }, eventLog: [],
      } as any, db);

      const violations = PasskeyBindingService.getPolicyViolations('fresh');
      expect(violations).not.toContain('PASSKEY_ROTATION_REQUIRED');
    });

    it('detects revoked credentials', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const record = { credentialId: 'rev-pol', meta: { createdAt: new Date().toISOString() }, eventLog: [] } as any;
      await PasskeyBindingService.saveBinding(record, db);
      await PasskeyBindingService.revokeBinding('rev-pol', 'compromised', db);
      await PasskeyBindingService.saveBinding(record, db); // re-added

      const violations = PasskeyBindingService.getPolicyViolations('rev-pol');
      expect(violations).toContain('PASSKEY_REVOKED');
    });

    it('returns empty array for non-existent credential', () => {
      const violations = PasskeyBindingService.getPolicyViolations('nonexist');
      expect(violations).toEqual([]);
    });
  });

  // ── reset ───────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all state and persists', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({
        credentialId: 'to-clear', meta: {}, eventLog: [],
      } as any, db);

      await PasskeyBindingService.reset(db);

      const state = PasskeyBindingService.get();
      expect(state.bindings).toEqual({});
      expect(state.auditLog).toEqual([]);
      expect(state.revocations).toEqual([]);
    });
  });

  // ── persist edge cases ──────────────────────────────────────

  describe('persist', () => {
    it('handles null db gracefully', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      // Should not throw
      await PasskeyBindingService.persist(null as any);
    });

    it('handles db.execute failure gracefully', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      db.execute = jest.fn<
        { rows: { length: number; item?: () => { value: string } } } | undefined,
        [string, (any[] | undefined)?]
      >(() => { throw new Error('write failed'); });
      // Should not throw, just warn
      await expect(PasskeyBindingService.persist(db)).resolves.not.toThrow();
    });
  });
});
