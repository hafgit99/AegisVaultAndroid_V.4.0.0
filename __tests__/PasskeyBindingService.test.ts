/**
 * PasskeyBindingService.test.ts — Aegis Vault Android v4.02
 * Tests for the passkey binding and lifecycle management service.
 */

import { PasskeyBindingService } from '../src/PasskeyBindingService';

const createMockDb = () => {
  const store: Record<string, string> = {};
  return {
    execute: jest.fn((sql: string, params?: any[]) => {
      if (sql.includes('SELECT')) {
        const val = store[params![0]];
        return val ? { rows: { length: 1, item: () => ({ value: val }) } } : { rows: { length: 0 } };
      }
      if (sql.includes('INSERT OR REPLACE')) {
        store[params![0]] = params![1];
      }
    }),
    _store: store,
  };
};

describe('PasskeyBindingService', () => {
  beforeEach(() => {
    PasskeyBindingService._resetForTest();
  });

  describe('init', () => {
    it('initializes with default state', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.bindings).toEqual({});
      expect(state.auditLog).toEqual([]);
      expect(state.revocations).toEqual([]);
      expect(state.policy.maxBindingAgeDays).toBe(90);
    });

    it('loads persisted state from mock db', async () => {
      const db = createMockDb();
      db._store.app_passkey_state_v1 = JSON.stringify({
        bindings: { cred1: { credentialId: 'cred1', meta: { createdAt: '2020-01-01' } } }
      });
      await PasskeyBindingService.init(db);
      const state = PasskeyBindingService.get();
      expect(state.bindings.cred1.credentialId).toBe('cred1');
    });
  });

  describe('saveBinding', () => {
    it('saves a new binding and appends to audit log', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const record = {
        credentialId: 'cred123',
        encryptedPayload: 'payload',
        prfSalt: 'salt',
        meta: { createdAt: '', lastUsedAt: '', version: 1 },
        eventLog: []
      };
      await PasskeyBindingService.saveBinding(record as any, db);
      const state = PasskeyBindingService.get();
      expect(state.bindings.cred123).toBeDefined();
      expect(state.auditLog).toHaveLength(1);
      expect(state.auditLog[0].type).toBe('bound');
    });

    it('handles rotation by tracking existing credential', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const record1 = { credentialId: 'cred1', meta: {}, eventLog: [] };
      await PasskeyBindingService.saveBinding(record1 as any, db);
      
      const record2 = { credentialId: 'cred1', meta: {}, eventLog: [] }; // rotated
      await PasskeyBindingService.saveBinding(record2 as any, db);
      
      const state = PasskeyBindingService.get();
      expect(state.auditLog[1].type).toBe('rotated');
      expect(state.bindings.cred1.meta.rotatedAt).toBeDefined();
    });
  });

  describe('revokeBinding', () => {
    it('removes the binding and records revocation', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      await PasskeyBindingService.saveBinding({ credentialId: 'rev1', meta: {}, eventLog: [] } as any, db);
      
      await PasskeyBindingService.revokeBinding('rev1', 'lost_device', db);
      
      const state = PasskeyBindingService.get();
      expect(state.bindings.rev1).toBeUndefined();
      expect(state.revocations).toHaveLength(1);
      expect(state.revocations[0].reason).toBe('lost_device');
    });
  });

  describe('getPolicyViolations', () => {
    it('detects rotation requirement for old passkeys', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago
      await PasskeyBindingService.saveBinding({
          credentialId: 'oldie',
          meta: { createdAt: oldDate },
          eventLog: []
      } as any, db);

      const violations = PasskeyBindingService.getPolicyViolations('oldie');
      expect(violations).toContain('PASSKEY_ROTATION_REQUIRED');
    });

    it('detects revoked credentials', async () => {
      const db = createMockDb();
      await PasskeyBindingService.init(db);
      const record = { credentialId: 'revoked-one', meta: { createdAt: new Date().toISOString() }, eventLog: [] } as any;
      await PasskeyBindingService.saveBinding(record, db);
      await PasskeyBindingService.revokeBinding('revoked-one', 'compromised', db);
      
      // Simulating the credential reappearing (e.g. from an old sync or import)
      await PasskeyBindingService.saveBinding(record, db);
      
      const violations = PasskeyBindingService.getPolicyViolations('revoked-one');
      expect(violations).toContain('PASSKEY_REVOKED');
    });
  });
});
