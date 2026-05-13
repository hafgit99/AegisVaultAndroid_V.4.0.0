jest.mock('react-native-quick-crypto');
jest.mock('react-native-argon2');
jest.mock('react-native-fs');
jest.mock('@op-engineering/op-sqlite');
jest.mock('react-native-biometrics');

import { SecurityModule, __bufToUtf8, __base64ToBuf, __hexToBuf, __bufToHex } from '../src/SecurityModule';
import RNFS from 'react-native-fs';

const mockDb = {
  executeSync: jest.fn().mockReturnValue({ rows: [] }),
  close: jest.fn(),
};

describe('SecurityModule Phase3 - Mutation Hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecurityModule as any).db = mockDb;
    (SecurityModule as any).appConfig = null;
    (SecurityModule as any).autoLockTimer = null;
    (SecurityModule as any).currentUnlockSecret = null;
    (SecurityModule as any).bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    mockDb.executeSync.mockReturnValue({ rows: [] });
  });

  // ═══ Utility Functions ═══
  describe('__bufToUtf8', () => {
    test('decodes ASCII bytes', () => {
      expect(__bufToUtf8(new Uint8Array([72, 101, 108, 108, 111]))).toBe('Hello');
    });
    test('handles empty buffer', () => {
      expect(__bufToUtf8(new Uint8Array(0))).toBe('');
    });
    test('decodes UTF-8 multibyte', () => {
      expect(__bufToUtf8(new Uint8Array([0xC3, 0xBC]))).toBe('ü');
    });
  });

  describe('__base64ToBuf', () => {
    test('decodes base64 no padding', () => {
      const buf = __base64ToBuf('SGVs');
      expect(buf[0]).toBe(72); expect(buf[1]).toBe(101); expect(buf[2]).toBe(108);
    });
    test('decodes base64 with single pad', () => {
      const buf = __base64ToBuf('SGVsbG8=');
      expect(Buffer.from(buf).toString('utf8')).toBe('Hello');
    });
    test('decodes base64 with double pad', () => {
      const buf = __base64ToBuf('SGk=');
      expect(Buffer.from(buf).toString('utf8')).toBe('Hi');
    });
  });

  describe('__hexToBuf', () => {
    test('converts hex to bytes', () => {
      const buf = __hexToBuf('48656c6c6f');
      expect(Buffer.from(buf).toString('utf8')).toBe('Hello');
    });
    test('handles empty string', () => {
      expect(__hexToBuf('').length).toBe(0);
    });
  });

  describe('__bufToHex', () => {
    test('converts bytes to hex', () => {
      expect(__bufToHex(new Uint8Array([0x48, 0x65, 0x6c]))).toBe('48656c');
    });
    test('pads single-digit hex values', () => {
      expect(__bufToHex(new Uint8Array([0x00, 0x0f]))).toBe('000f');
    });
  });

  // ═══ getLockoutDuration ═══
  describe('getLockoutDuration', () => {
    const dur = (n: number) => (SecurityModule as any).getLockoutDuration(n);
    test('0-4 fails: no lockout', () => {
      expect(dur(0)).toBe(0); expect(dur(1)).toBe(0);
      expect(dur(4)).toBe(0);
    });
    test('5 fails: 15 min', () => { expect(dur(5)).toBe(15 * 60 * 1000); });
    test('6 fails: 60 min', () => { expect(dur(6)).toBe(60 * 60 * 1000); });
    test('7 fails: 6 hours', () => { expect(dur(7)).toBe(6 * 60 * 60 * 1000); });
    test('10+ fails: capped at 7 days', () => {
      expect(dur(10)).toBe(7 * 24 * 60 * 60 * 1000);
      expect(dur(99)).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  // ═══ parseSettingBoolean ═══
  describe('parseSettingBoolean', () => {
    const p = (v: any, fb: boolean) => (SecurityModule as any).parseSettingBoolean(v, fb);
    test('null/undefined returns fallback', () => {
      expect(p(null, true)).toBe(true);
      expect(p(undefined, false)).toBe(false);
    });
    test('boolean passthrough', () => {
      expect(p(true, false)).toBe(true);
      expect(p(false, true)).toBe(false);
    });
    test('number: 0=false, nonzero=true', () => {
      expect(p(0, true)).toBe(false);
      expect(p(1, false)).toBe(true);
      expect(p(42, false)).toBe(true);
    });
    test('string true/1', () => {
      expect(p('true', false)).toBe(true);
      expect(p('1', false)).toBe(true);
      expect(p(' TRUE ', false)).toBe(true);
    });
    test('string false/0', () => {
      expect(p('false', true)).toBe(false);
      expect(p('0', true)).toBe(false);
    });
    test('unknown string returns fallback', () => {
      expect(p('maybe', true)).toBe(true);
      expect(p('maybe', false)).toBe(false);
    });
  });

  // ═══ parseSettingNumber ═══
  describe('parseSettingNumber', () => {
    const p = (v: any, fb: number) => (SecurityModule as any).parseSettingNumber(v, fb);
    test('null/undefined returns fallback', () => {
      expect(p(null, 60)).toBe(60);
      expect(p(undefined, 30)).toBe(30);
    });
    test('valid number', () => { expect(p('120', 60)).toBe(120); });
    test('non-finite returns fallback', () => {
      expect(p('abc', 60)).toBe(60);
      expect(p(NaN, 60)).toBe(60);
      expect(p(Infinity, 60)).toBe(60);
    });
    test('negative clamped to 0', () => { expect(p(-5, 60)).toBe(0); });
    test('truncates decimals', () => { expect(p(12.9, 0)).toBe(12); });
  });

  // ═══ parseSettingForAppConfig ═══
  describe('parseSettingForAppConfig', () => {
    const p = (v: string) => (SecurityModule as any).parseSettingForAppConfig(v);
    test('true string', () => { expect(p('true')).toBe(true); });
    test('false string', () => { expect(p('false')).toBe(false); });
    test('number string', () => { expect(p('42')).toBe(42); });
    test('non-numeric string passthrough', () => { expect(p('hello')).toBe('hello'); });
  });

  // ═══ lockVault ═══
  describe('lockVault', () => {
    test('closes db, nulls state', () => {
      (SecurityModule as any).db = mockDb;
      (SecurityModule as any).currentUnlockSecret = 'secret';
      SecurityModule.lockVault();
      expect(mockDb.close).toHaveBeenCalled();
      expect(SecurityModule.db).toBeNull();
      expect((SecurityModule as any).currentUnlockSecret).toBeNull();
    });
    test('handles null db gracefully', () => {
      (SecurityModule as any).db = null;
      expect(() => SecurityModule.lockVault()).not.toThrow();
    });
  });

  // ═══ getDb ═══
  describe('getDb', () => {
    test('returns current db reference', () => {
      (SecurityModule as any).db = mockDb;
      expect(SecurityModule.getDb()).toBe(mockDb);
    });
    test('returns null when not set', () => {
      (SecurityModule as any).db = null;
      expect(SecurityModule.getDb()).toBeNull();
    });
  });

  // ═══ logSecurityEvent ═══
  describe('logSecurityEvent', () => {
    test('inserts into db when available', async () => {
      await SecurityModule.logSecurityEvent('test_event', 'success', { key: 'val' });
      expect(mockDb.executeSync).toHaveBeenCalledWith(
        'INSERT INTO vault_audit_log (event_type, event_status, details) VALUES (?,?,?)',
        ['test_event', 'success', '{"key":"[redacted]"}'],
      );
    });
    test('buffers when db is null', async () => {
      (SecurityModule as any).db = null;
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await SecurityModule.logSecurityEvent('buffered', 'info');
      expect(RNFS.writeFile).toHaveBeenCalled();
    });
    test('deduplicates wear_os_sync_complete success events by updating existing record', async () => {
      // First sync should INSERT
      mockDb.executeSync.mockReturnValueOnce({ rows: [] }); // No existing record
      await SecurityModule.logSecurityEvent('wear_os_sync_complete', 'success', { count: 3 });
      expect(mockDb.executeSync).toHaveBeenCalledWith(
        'INSERT INTO vault_audit_log (event_type, event_status, details) VALUES (?,?,?)',
        ['wear_os_sync_complete', 'success', '{"count":3}'],
      );

      // Subsequent sync should UPDATE the existing record instead of INSERT
      jest.clearAllMocks();
      mockDb.executeSync.mockReturnValueOnce({
        rows: [{ id: 99, details: '{"count":3}' }],
      }); // Existing record found
      await SecurityModule.logSecurityEvent('wear_os_sync_complete', 'success', { count: 2 });
      expect(mockDb.executeSync).toHaveBeenCalledWith(
        "SELECT id, details FROM vault_audit_log WHERE event_type='wear_os_sync_complete' AND event_status='success' ORDER BY created_at DESC LIMIT 1",
      );
      expect(mockDb.executeSync).toHaveBeenCalledWith(
        'UPDATE vault_audit_log SET details=?, created_at=CURRENT_TIMESTAMP WHERE id=?',
        ['{"count":2}', 99],
      );
    });
  });

  // ═══ clearAuditEvents ═══
  describe('clearAuditEvents', () => {
    test('returns false when db is null', async () => {
      (SecurityModule as any).db = null;
      expect(await SecurityModule.clearAuditEvents()).toBe(false);
    });
    test('clears and returns true', async () => {
      expect(await SecurityModule.clearAuditEvents()).toBe(true);
      expect(mockDb.executeSync).toHaveBeenCalledWith('DELETE FROM vault_audit_log');
    });
  });

  // ═══ getAuditEvents ═══
  describe('getAuditEvents', () => {
    test('clamps limit to [1, 500]', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await SecurityModule.getAuditEvents(0);
      const call = mockDb.executeSync.mock.calls[0];
      expect(call[1][0]).toBe(1);
    });
    test('merges db and buffer events', async () => {
      mockDb.executeSync.mockReturnValue({
        rows: [{ id: 1, event_type: 'a', event_status: 'success', details: '{}', created_at: '2026-01-02T00:00:00Z' }],
      });
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify([
        { event_type: 'b', event_status: 'info', details: '{}', created_at: '2026-01-01T00:00:00Z' },
      ]));
      const events = await SecurityModule.getAuditEvents(10);
      expect(events.length).toBe(2);
      expect(events[0].event_type).toBe('a');
      expect(events[1].id).toBeLessThan(0);
    });
  });

  // ═══ mergeSharedAssignmentIntoData ═══
  describe('mergeSharedAssignmentIntoData', () => {
    test('adds shared when assignment has spaceId', () => {
      const result = JSON.parse(SecurityModule.mergeSharedAssignmentIntoData('{}', { spaceId: 'sp1', role: 'editor' } as any));
      expect(result.shared.spaceId).toBe('sp1');
      expect(result.shared.role).toBe('editor');
    });
    test('removes shared when assignment is null', () => {
      const data = JSON.stringify({ shared: { spaceId: 'old' }, other: 1 });
      const result = JSON.parse(SecurityModule.mergeSharedAssignmentIntoData(data, null));
      expect(result.shared).toBeUndefined();
      expect(result.other).toBe(1);
    });
    test('removes shared when assignment has no spaceId', () => {
      const result = JSON.parse(SecurityModule.mergeSharedAssignmentIntoData('{"shared":{"spaceId":"x"}}', { spaceId: '' } as any));
      expect(result.shared).toBeUndefined();
    });
  });

  // ═══ getPasswordHistory ═══
  describe('getPasswordHistory', () => {
    test('returns empty when db is null', async () => {
      (SecurityModule as any).db = null;
      expect(await SecurityModule.getPasswordHistory(1)).toEqual([]);
    });
    test('clamps limit', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      await SecurityModule.getPasswordHistory(1, 999);
      const limitArg = mockDb.executeSync.mock.calls[0][1][1];
      expect(limitArg).toBe(100);
    });
    test('min limit is 1', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      await SecurityModule.getPasswordHistory(1, -5);
      const limitArg = mockDb.executeSync.mock.calls[0][1][1];
      expect(limitArg).toBe(1);
    });
  });

  // ═══ restorePasswordFromHistory ═══
  describe('restorePasswordFromHistory', () => {
    test('returns false when db is null', async () => {
      (SecurityModule as any).db = null;
      expect(await SecurityModule.restorePasswordFromHistory(1, 1)).toBe(false);
    });
    test('returns false when history row not found', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      expect(await SecurityModule.restorePasswordFromHistory(1, 99)).toBe(false);
    });
    test('restores password field', async () => {
      mockDb.executeSync
        .mockReturnValueOnce({ rows: [{ id: 10, item_id: 1, field: 'password', value: 'oldpw' }] })
        .mockReturnValueOnce({ rows: [{ id: 1, title: 'T', username: 'U', password: 'new', url: '', notes: '', category: 'login', data: '{}', favorite: 0, is_deleted: 0 }] })
        .mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule, 'updateItem').mockResolvedValue(true);
      const result = await SecurityModule.restorePasswordFromHistory(1, 10);
      expect(result).toBe(true);
      expect(SecurityModule.updateItem).toHaveBeenCalledWith(1, expect.objectContaining({ password: 'oldpw' }));
    });
    test('restores wifi_password field', async () => {
      mockDb.executeSync
        .mockReturnValueOnce({ rows: [{ id: 11, item_id: 2, field: 'wifi_password', value: 'wifiold' }] })
        .mockReturnValueOnce({ rows: [{ id: 2, title: 'W', username: '', password: '', url: '', notes: '', category: 'wifi', data: '{"ssid":"net"}', favorite: 0, is_deleted: 0 }] })
        .mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule, 'updateItem').mockResolvedValue(true);
      const result = await SecurityModule.restorePasswordFromHistory(2, 11);
      expect(result).toBe(true);
    });
    test('restores pin field', async () => {
      mockDb.executeSync
        .mockReturnValueOnce({ rows: [{ id: 12, item_id: 3, field: 'pin', value: '9999' }] })
        .mockReturnValueOnce({ rows: [{ id: 3, title: 'C', username: '', password: '', url: '', notes: '', category: 'card', data: '{"pin":"0000"}', favorite: 0, is_deleted: 0 }] })
        .mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule, 'updateItem').mockResolvedValue(true);
      expect(await SecurityModule.restorePasswordFromHistory(3, 12)).toBe(true);
    });
    test('restores cvv field', async () => {
      mockDb.executeSync
        .mockReturnValueOnce({ rows: [{ id: 13, item_id: 4, field: 'cvv', value: '888' }] })
        .mockReturnValueOnce({ rows: [{ id: 4, title: 'C2', username: '', password: '', url: '', notes: '', category: 'card', data: '{"cvv":"111"}', favorite: 0, is_deleted: 0 }] })
        .mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule, 'updateItem').mockResolvedValue(true);
      expect(await SecurityModule.restorePasswordFromHistory(4, 13)).toBe(true);
    });
    test('restores credential_id field', async () => {
      mockDb.executeSync
        .mockReturnValueOnce({ rows: [{ id: 14, item_id: 5, field: 'credential_id', value: 'cred_old' }] })
        .mockReturnValueOnce({ rows: [{ id: 5, title: 'PK', username: 'u', password: '', url: 'https://x.com', notes: '', category: 'passkey', data: '{"credential_id":"cred_new"}', favorite: 0, is_deleted: 0 }] })
        .mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule, 'updateItem').mockResolvedValue(true);
      expect(await SecurityModule.restorePasswordFromHistory(5, 14)).toBe(true);
    });
    test('returns false for unknown field', async () => {
      mockDb.executeSync
        .mockReturnValueOnce({ rows: [{ id: 15, item_id: 6, field: 'unknown_field', value: 'x' }] })
        .mockReturnValueOnce({ rows: [{ id: 6, title: 'X', username: '', password: '', url: '', notes: '', category: 'login', data: '{}', favorite: 0, is_deleted: 0 }] });
      expect(await SecurityModule.restorePasswordFromHistory(6, 15)).toBe(false);
    });
  });

  // ═══ cleanupOldTrash ═══
  describe('cleanupOldTrash', () => {
    test('does nothing when db is null', async () => {
      (SecurityModule as any).db = null;
      await SecurityModule.cleanupOldTrash();
      expect(mockDb.executeSync).not.toHaveBeenCalled();
    });
    test('executes 3 delete statements', async () => {
      await SecurityModule.cleanupOldTrash();
      expect(mockDb.executeSync).toHaveBeenCalledTimes(3);
    });
  });

  // ═══ getActiveSyncRootSecret ═══
  describe('getActiveSyncRootSecret', () => {
    test('returns null when no unlock secret', async () => {
      (SecurityModule as any).currentUnlockSecret = null;
      expect(await SecurityModule.getActiveSyncRootSecret()).toBeNull();
    });
  });

  // ═══ setItemSharedAssignment ═══
  describe('setItemSharedAssignment', () => {
    test('returns false when item not found', async () => {
      jest.spyOn(SecurityModule, 'getItemById').mockResolvedValue(null);
      expect(await SecurityModule.setItemSharedAssignment(999)).toBe(false);
    });
  });

  // ═══ applyMergedSyncItems ═══
  describe('applyMergedSyncItems', () => {
    test('throws when db is null', async () => {
      (SecurityModule as any).db = null;
      await expect(SecurityModule.applyMergedSyncItems([])).rejects.toThrow('not open');
    });
    test('inserts new items in transaction', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule as any, 'syncAutofill').mockResolvedValue(undefined);
      jest.spyOn(SecurityModule, 'logSecurityEvent').mockResolvedValue(undefined as any);
      await SecurityModule.applyMergedSyncItems([
        { id: 1, title: 'New', username: '', password: '', url: '', notes: '', category: 'login', favorite: 0, data: '{}', is_deleted: 0 } as any,
      ]);
      expect(mockDb.executeSync).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockDb.executeSync).toHaveBeenCalledWith('COMMIT');
    });
    test('updates existing items', async () => {
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM')) return { rows: [{ id: 1 }] };
        return { rows: [] };
      });
      jest.spyOn(SecurityModule as any, 'syncAutofill').mockResolvedValue(undefined);
      jest.spyOn(SecurityModule, 'logSecurityEvent').mockResolvedValue(undefined as any);
      await SecurityModule.applyMergedSyncItems([
        { id: 1, title: 'Updated', username: '', password: '', url: '', notes: '', category: 'login', favorite: 0, data: '{}', is_deleted: 0 } as any,
      ]);
      const updateCall = mockDb.executeSync.mock.calls.find((c: any) => c[0].includes('UPDATE vault_items'));
      expect(updateCall).toBeTruthy();
    });
    test('rolls back on error', async () => {
      mockDb.executeSync.mockImplementation((sql: string) => {
        if (sql === 'BEGIN TRANSACTION') return;
        if (sql === 'ROLLBACK') return;
        if (sql.includes('SELECT id FROM')) throw new Error('db error');
        return { rows: [] };
      });
      await expect(SecurityModule.applyMergedSyncItems([
        { id: 1, title: 'Bad' } as any,
      ])).rejects.toThrow();
      expect(mockDb.executeSync).toHaveBeenCalledWith('ROLLBACK');
    });
    test('filters items without numeric id', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      jest.spyOn(SecurityModule as any, 'syncAutofill').mockResolvedValue(undefined);
      jest.spyOn(SecurityModule, 'logSecurityEvent').mockResolvedValue(undefined as any);
      await SecurityModule.applyMergedSyncItems([
        { title: 'NoId' } as any,
        { id: 'string-id', title: 'BadId' } as any,
      ]);
      // Only BEGIN + COMMIT, no SELECT/INSERT for invalid items
      const selectCalls = mockDb.executeSync.mock.calls.filter((c: any) => c[0].includes('SELECT id FROM'));
      expect(selectCalls.length).toBe(0);
    });
  });

  // ═══ startAutoLockTimer / clearAutoLockTimer ═══
  describe('auto lock timer', () => {
    test('startAutoLockTimer sets timer', () => {
      const cb = jest.fn();
      SecurityModule.startAutoLockTimer(1, cb);
      expect((SecurityModule as any).autoLockTimer).not.toBeNull();
      SecurityModule.clearAutoLockTimer();
    });
    test('clearAutoLockTimer clears timer', () => {
      SecurityModule.startAutoLockTimer(10, jest.fn());
      SecurityModule.clearAutoLockTimer();
      expect((SecurityModule as any).autoLockTimer).toBeNull();
    });
    test('startAutoLockTimer with 0 does not set timer', () => {
      SecurityModule.startAutoLockTimer(0, jest.fn());
      expect((SecurityModule as any).autoLockTimer).toBeNull();
    });
    test('resetAutoLockTimer delegates to start', () => {
      const cb = jest.fn();
      SecurityModule.resetAutoLockTimer(5, cb);
      expect((SecurityModule as any).autoLockTimer).not.toBeNull();
      SecurityModule.clearAutoLockTimer();
    });
  });

  // ═══ CRUD null-db guards ═══
  describe('null db guards', () => {
    beforeEach(() => { (SecurityModule as any).db = null; });
    test('deleteItem returns false', async () => { expect(await SecurityModule.deleteItem(1)).toBe(false); });
    test('restoreItem returns false', async () => { expect(await SecurityModule.restoreItem(1)).toBe(false); });
    test('permanentlyDeleteItem returns false', async () => { expect(await SecurityModule.permanentlyDeleteItem(1)).toBe(false); });
    test('emptyTrash returns false', async () => { expect(await SecurityModule.emptyTrash()).toBe(false); });
    test('resetVault returns false', async () => { expect(await SecurityModule.resetVault()).toBe(false); });
    test('getItemCount returns 0', async () => { expect(await SecurityModule.getItemCount()).toBe(0); });
    test('addAttachment returns false', async () => { expect(await SecurityModule.addAttachment(1, 'f', 't', 'p')).toBe(false); });
    test('addAttachmentFromBase64 returns false', async () => { expect(await SecurityModule.addAttachmentFromBase64(1, 'f', 't', 'd', 0)).toBe(false); });
    test('getAttachments returns empty', async () => { expect(await SecurityModule.getAttachments(1)).toEqual([]); });
    test('downloadAttachment returns null', async () => { expect(await SecurityModule.downloadAttachment(1)).toBeNull(); });
    test('deleteAttachment returns false', async () => { expect(await SecurityModule.deleteAttachment(1)).toBe(false); });
    test('getSetting returns null', async () => { expect(await SecurityModule.getSetting('key')).toBeNull(); });
    test('getAllItems delegates to getItems', async () => { expect(await SecurityModule.getAllItems()).toEqual([]); });
  });

  // ═══ getSetting string coercion ═══
  describe('getSetting edge cases', () => {
    test('returns null for undefined row value', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [{ value: null }] });
      expect(await SecurityModule.getSetting('key')).toBeNull();
    });
    test('coerces number to string', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [{ value: 42 }] });
      expect(await SecurityModule.getSetting('key')).toBe('42');
    });
    test('coerces boolean to string', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [{ value: true }] });
      expect(await SecurityModule.getSetting('key')).toBe('true');
    });
  });

  // ═══ deleteSharedVaultSpace edge ═══
  describe('deleteSharedVaultSpace', () => {
    test('returns false for empty spaceId', async () => {
      expect(await SecurityModule.deleteSharedVaultSpace('')).toBe(false);
      expect(await SecurityModule.deleteSharedVaultSpace('   ')).toBe(false);
    });
  });
});
