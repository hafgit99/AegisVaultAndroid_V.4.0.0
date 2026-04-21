jest.mock('react-native-quick-crypto');
jest.mock('react-native-argon2');
jest.mock('react-native-fs');
jest.mock('@op-engineering/op-sqlite');
jest.mock('react-native-biometrics');

import { SecurityModule } from '../src/SecurityModule';

// Mock DB helper
const mockDb = {
  executeSync: jest.fn().mockReturnValue({ rows: [] }),
  close: jest.fn(),
};

describe('SecurityModule Phase2 - Mutation Hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecurityModule as any).db = mockDb;
    (SecurityModule as any).appConfig = null;
    (SecurityModule as any).bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    mockDb.executeSync.mockReturnValue({ rows: [] });
  });

  // ═══ buildPasswordFields ═══
  describe('buildPasswordFields', () => {
    const build = (item: any) => (SecurityModule as any).buildPasswordFields(item);

    test('login category extracts password and marks incomplete', () => {
      const r = build({ category: 'login', password: 'secret', title: 'T', username: 'U' });
      expect(r).toHaveLength(1);
      expect(r[0].field).toBe('password');
      expect(r[0].value).toBe('secret');
      expect(r[0].isIncomplete).toBe(false);
    });

    test('login missing title is incomplete', () => {
      const r = build({ category: 'login', password: 'p', title: '', username: 'U' });
      expect(r[0].isIncomplete).toBe(true);
    });

    test('login missing username is incomplete', () => {
      const r = build({ category: 'login', password: 'p', title: 'T', username: '' });
      expect(r[0].isIncomplete).toBe(true);
    });

    test('login missing password is incomplete', () => {
      const r = build({ category: 'login', password: '', title: 'T', username: 'U' });
      expect(r[0].isIncomplete).toBe(true);
    });

    test('wifi category extracts wifi_password', () => {
      const r = build({ category: 'wifi', title: 'Home', data: JSON.stringify({ ssid: 'net', wifi_password: 'wpass' }) });
      expect(r).toHaveLength(1);
      expect(r[0].field).toBe('wifi_password');
      expect(r[0].value).toBe('wpass');
      expect(r[0].isIncomplete).toBe(false);
    });

    test('wifi missing ssid is incomplete', () => {
      const r = build({ category: 'wifi', title: 'T', data: JSON.stringify({ wifi_password: 'w' }) });
      expect(r[0].isIncomplete).toBe(true);
    });

    test('wifi missing title is incomplete', () => {
      const r = build({ category: 'wifi', title: '', data: JSON.stringify({ ssid: 's', wifi_password: 'w' }) });
      expect(r[0].isIncomplete).toBe(true);
    });

    test('wifi missing wifi_password is incomplete', () => {
      const r = build({ category: 'wifi', title: 'T', data: JSON.stringify({ ssid: 's' }) });
      expect(r[0].isIncomplete).toBe(true);
    });

    test('card with pin and cvv', () => {
      const r = build({ category: 'card', data: JSON.stringify({ pin: '1234', cvv: '567' }) });
      expect(r).toHaveLength(2);
      expect(r[0].field).toBe('pin');
      expect(r[0].value).toBe('1234');
      expect(r[1].field).toBe('cvv');
      expect(r[1].value).toBe('567');
    });

    test('card with only pin', () => {
      const r = build({ category: 'card', data: JSON.stringify({ pin: '0000' }) });
      expect(r).toHaveLength(1);
      expect(r[0].field).toBe('pin');
    });

    test('card with only cvv', () => {
      const r = build({ category: 'card', data: JSON.stringify({ cvv: '999' }) });
      expect(r).toHaveLength(1);
      expect(r[0].field).toBe('cvv');
    });

    test('card with no pin/cvv returns empty', () => {
      const r = build({ category: 'card', data: '{}' });
      expect(r).toHaveLength(0);
    });

    test('unknown category returns empty', () => {
      const r = build({ category: 'note', password: 'x' });
      expect(r).toHaveLength(0);
    });

    test('handles invalid JSON in data', () => {
      const r = build({ category: 'wifi', title: 'T', data: 'not-json' });
      expect(r).toHaveLength(1);
      expect(r[0].isIncomplete).toBe(true);
    });

    test('handles null data', () => {
      const r = build({ category: 'card', data: null });
      expect(r).toHaveLength(0);
    });
  });

  // ═══ normalizeForSimilarity ═══
  describe('normalizeForSimilarity', () => {
    const norm = (v: string) => (SecurityModule as any).normalizeForSimilarity(v);

    test('lowercases input', () => {
      expect(norm('ABC')).toBe('abc');
    });

    test('removes whitespace', () => {
      expect(norm('a b c')).toBe('abc');
    });

    test('removes dashes underscores dots', () => {
      expect(norm('a-b_c.d')).toBe('abcd');
    });

    test('removes trailing non-alpha chars', () => {
      expect(norm('abc123')).toBe('abc');
    });

    test('preserves inner digits', () => {
      expect(norm('a1b2c')).toBe('a1b2c');
    });

    test('handles empty string', () => {
      expect(norm('')).toBe('');
    });
  });

  // ═══ levenshteinDistance ═══
  describe('levenshteinDistance', () => {
    const lev = (a: string, b: string) => (SecurityModule as any).levenshteinDistance(a, b);

    test('identical strings return 0', () => {
      expect(lev('abc', 'abc')).toBe(0);
    });

    test('empty vs non-empty', () => {
      expect(lev('', 'abc')).toBe(3);
      expect(lev('abc', '')).toBe(3);
    });

    test('single char difference', () => {
      expect(lev('abc', 'axc')).toBe(1);
    });

    test('insertion', () => {
      expect(lev('ac', 'abc')).toBe(1);
    });

    test('deletion', () => {
      expect(lev('abc', 'ac')).toBe(1);
    });

    test('completely different', () => {
      expect(lev('abc', 'xyz')).toBe(3);
    });

    test('longer strings', () => {
      expect(lev('kitten', 'sitting')).toBe(3);
    });
  });

  // ═══ getItemData ═══
  describe('getItemData', () => {
    const gid = (item: any) => (SecurityModule as any).getItemData(item);

    test('parses valid JSON data', () => {
      expect(gid({ data: '{"a":1}' })).toEqual({ a: 1 });
    });

    test('returns empty for null data', () => {
      expect(gid({ data: null })).toEqual({});
    });

    test('returns empty for undefined data', () => {
      expect(gid({})).toEqual({});
    });

    test('returns empty for invalid JSON', () => {
      expect(gid({ data: 'bad' })).toEqual({});
    });
  });

  // ═══ getItemTimestamp ═══
  describe('getItemTimestamp', () => {
    const ts = (item: any) => (SecurityModule as any).getItemTimestamp(item);

    test('uses updated_at first', () => {
      const result = ts({ updated_at: '2024-01-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z' });
      expect(result).toBe(new Date('2024-01-01T00:00:00Z').getTime());
    });

    test('falls back to created_at', () => {
      const result = ts({ created_at: '2020-06-15T12:00:00Z' });
      expect(result).toBe(new Date('2020-06-15T12:00:00Z').getTime());
    });

    test('returns null for missing timestamps', () => {
      expect(ts({})).toBeNull();
    });

    test('returns null for invalid date', () => {
      expect(ts({ updated_at: 'not-a-date' })).toBeNull();
    });
  });

  // ═══ getItems (DB mocked) ═══
  describe('getItems', () => {
    test('returns empty when db is null', async () => {
      (SecurityModule as any).db = null;
      const r = await SecurityModule.getItems();
      expect(r).toEqual([]);
    });

    test('returns rows from db', async () => {
      const mockRows = [{ id: 1, title: 'Test' }];
      mockDb.executeSync.mockReturnValue({ rows: mockRows });
      const r = await SecurityModule.getItems();
      expect(r).toEqual(mockRows);
    });

    test('filters by search term', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      await SecurityModule.getItems('github');
      const call = mockDb.executeSync.mock.calls[0];
      expect(call[0]).toContain('LIKE');
      expect(call[1]).toContain('%github%');
    });

    test('filters by category', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      await SecurityModule.getItems(undefined, 'login');
      const call = mockDb.executeSync.mock.calls[0];
      expect(call[0]).toContain('category = ?');
      expect(call[1]).toContain('login');
    });

    test('category "all" is ignored', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      await SecurityModule.getItems(undefined, 'all');
      const call = mockDb.executeSync.mock.calls[0];
      expect(call[0]).not.toContain('category = ?');
    });

    test('handles db error', async () => {
      mockDb.executeSync.mockImplementation(() => { throw new Error('DB error'); });
      const r = await SecurityModule.getItems();
      expect(r).toEqual([]);
    });
  });

  // ═══ getItemById ═══
  describe('getItemById', () => {
    test('returns null when db is null', async () => {
      (SecurityModule as any).db = null;
      expect(await SecurityModule.getItemById(1)).toBeNull();
    });

    test('returns item when found', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [{ id: 1, title: 'Found' }] });
      const r = await SecurityModule.getItemById(1);
      expect(r).toEqual({ id: 1, title: 'Found' });
    });

    test('returns null when not found', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      expect(await SecurityModule.getItemById(999)).toBeNull();
    });
  });

  // ═══ getDeletedItems ═══
  describe('getDeletedItems', () => {
    test('returns empty when db is null', async () => {
      (SecurityModule as any).db = null;
      expect(await SecurityModule.getDeletedItems()).toEqual([]);
    });

    test('returns deleted rows', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [{ id: 2, is_deleted: 1 }] });
      const r = await SecurityModule.getDeletedItems();
      expect(r).toHaveLength(1);
    });
  });

  // ═══ buildAccountHardeningReport ═══
  describe('buildAccountHardeningReport', () => {
    const build = (items: any[]) => (SecurityModule as any).buildAccountHardeningReport(items);

    test('empty items returns perfect score', () => {
      const r = build([]);
      expect(r.score).toBe(100);
      expect(r.riskLevel).toBe('low');
      expect(r.summary.loginItems).toBe(0);
    });

    test('login with password but no 2FA', () => {
      const r = build([
        { category: 'login', password: 'pass', username: 'user', url: 'https://example.com', data: '{}' }
      ]);
      expect(r.summary.missing2FACount).toBe(1);
      expect(r.checks.some((c: any) => c.type === 'missing_2fa')).toBe(true);
      expect(r.score).toBeLessThan(100);
    });

    test('login with TOTP is protected', () => {
      const r = build([
        { category: 'login', password: 'p', username: 'u', url: 'https://ex.com', data: JSON.stringify({ totp_secret: 'ABCDEF' }) }
      ]);
      expect(r.summary.totpProtectedCount).toBe(1);
      expect(r.summary.missing2FACount).toBe(0);
    });

    test('login missing username triggers missing_identity', () => {
      const r = build([
        { category: 'login', password: 'p', username: '', url: 'https://ex.com', data: '{}' }
      ]);
      expect(r.checks.some((c: any) => c.type === 'missing_identity')).toBe(true);
      expect(r.summary.incompleteLoginCount).toBe(1);
    });

    test('stale login triggers stale_secret', () => {
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      const r = build([
        { category: 'login', password: 'p', username: 'u', url: 'https://ex.com', updated_at: staleDate, data: '{}' }
      ]);
      expect(r.summary.staleSecretCount).toBe(1);
      expect(r.checks.some((c: any) => c.type === 'stale_secret')).toBe(true);
    });

    test('fresh login does not trigger stale_secret', () => {
      const freshDate = new Date().toISOString();
      const r = build([
        { category: 'login', password: 'p', username: 'u', url: 'https://ex.com', updated_at: freshDate, data: '{}' }
      ]);
      expect(r.summary.staleSecretCount).toBe(0);
    });

    test('penalty calculation: 2 missing 2FA + 1 stale + 1 incomplete', () => {
      const staleDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      const items = [
        { category: 'login', password: 'p1', username: 'u1', url: 'https://a.com', data: '{}' },
        { category: 'login', password: 'p2', username: 'u2', url: 'https://b.com', data: '{}' },
        { category: 'login', password: 'p3', username: '', url: 'https://c.com', updated_at: staleDate, data: '{}' },
      ];
      const r = build(items);
      // penalty = 3*10 + 1*5 + 1*6 = 41
      expect(r.score).toBe(59);
      expect(r.riskLevel).toBe('high');
    });

    test('passkey items are cross-referenced', () => {
      const r = build([
        { category: 'passkey', username: 'user', url: 'https://github.com', data: JSON.stringify({ rp_id: 'github.com' }) },
        { category: 'login', password: 'p', username: 'user', url: 'https://github.com', data: '{}' },
      ]);
      expect(r.summary.passkeyProtectedCount).toBe(1);
      expect(r.summary.missing2FACount).toBe(0);
    });

    test('actions reflect issues', () => {
      const r = build([
        { category: 'login', password: 'p', username: 'u', url: 'https://a.com', data: '{}' },
      ]);
      expect(r.actions.some((a: string) => a.includes('TOTP'))).toBe(true);
    });

    test('healthy vault gets positive action', () => {
      const r = build([
        { category: 'login', password: 'p', username: 'u', url: 'https://a.com', data: JSON.stringify({ totp_secret: 'X' }) },
      ]);
      expect(r.actions.some((a: string) => a.includes('healthy'))).toBe(true);
    });

    test('non-login items are skipped', () => {
      const r = build([
        { category: 'note', title: 'Secret note' },
        { category: 'card', data: '{}' },
      ]);
      expect(r.summary.loginItems).toBe(0);
    });
  });

  // ═══ getPasswordHealthReport (mocked getItems) ═══
  describe('getPasswordHealthReport', () => {
    test('empty vault returns perfect score', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [] });
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.score).toBe(100);
      expect(r.riskLevel).toBe('low');
    });

    test('weak password detected', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'T', username: 'U', password: '1234', data: '{}' }
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.some((i: any) => i.type === 'weak')).toBe(true);
    });

    test('empty password detected', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'T', username: 'U', password: '', data: '{}' }
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.some((i: any) => i.type === 'empty')).toBe(true);
    });

    test('reused passwords detected', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'A', username: 'U', password: 'SameStrongPassword!123', data: '{}' },
        { id: 2, category: 'login', title: 'B', username: 'U', password: 'SameStrongPassword!123', data: '{}' },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.some((i: any) => i.type === 'reused')).toBe(true);
    });

    test('similar passwords detected', async () => {
      // Passwords must normalize to DIFFERENT but close strings (Levenshtein ≤ 2)
      // normalizeForSimilarity: lowercase, strip whitespace/dashes/dots, strip trailing non-alpha
      // 'securealphatoken' vs 'securealphavoken' differ by 1 char in the middle
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'A', username: 'U', password: 'SecureAlphaToken', data: '{}' },
        { id: 2, category: 'login', title: 'B', username: 'U', password: 'SecureAlphaVoken', data: '{}' },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.some((i: any) => i.type === 'similar')).toBe(true);
    });

    test('strong unique passwords get clean report', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'A', username: 'U', password: 'xK9$mP2!qR7@nL4&vB', data: '{}' },
        { id: 2, category: 'login', title: 'B', username: 'U', password: 'jT5#wF8*yH3^cD6%aZ', data: '{}' },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.filter((i: any) => i.type === 'reused')).toHaveLength(0);
      expect(r.issues.filter((i: any) => i.type === 'similar')).toHaveLength(0);
    });

    test('wifi passwords are checked', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'wifi', title: 'Home', data: JSON.stringify({ ssid: 'Net', wifi_password: '12345' }) },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.some((i: any) => i.field === 'wifi_password')).toBe(true);
    });

    test('card pin and cvv are checked', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'card', title: 'Visa', data: JSON.stringify({ pin: '0000', cvv: '123' }) },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.issues.some((i: any) => i.field === 'pin')).toBe(true);
    });

    test('actions reflect reused passwords', async () => {
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'A', username: 'U', password: 'DuplicatePass!@#456', data: '{}' },
        { id: 2, category: 'login', title: 'B', username: 'U', password: 'DuplicatePass!@#456', data: '{}' },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.actions.some((a: string) => a.includes('reused'))).toBe(true);
    });

    test('penalty scoring works correctly', async () => {
      // 2 weak (14) + 2 reused (24) + 1 empty (10) = 48 penalty, score=52
      mockDb.executeSync.mockReturnValue({ rows: [
        { id: 1, category: 'login', title: 'A', username: 'U', password: 'short', data: '{}' },
        { id: 2, category: 'login', title: 'B', username: 'U', password: 'short', data: '{}' },
        { id: 3, category: 'login', title: 'C', username: 'U', password: '', data: '{}' },
      ]});
      const r = await SecurityModule.getPasswordHealthReport();
      expect(r.score).toBeLessThan(100);
      expect(r.score).toBeGreaterThanOrEqual(0);
    });
  });

  // ═══ extractHistorySecretsFromItem ═══
  describe('extractHistorySecretsFromItem', () => {
    const extract = (item: any) => (SecurityModule as any).extractHistorySecretsFromItem(item);

    test('login extracts password', () => {
      const r = extract({ category: 'login', password: 'secret' });
      expect(r).toEqual([{ field: 'password', value: 'secret' }]);
    });

    test('login ignores empty password', () => {
      expect(extract({ category: 'login', password: '' })).toHaveLength(0);
    });

    test('wifi extracts wifi_password', () => {
      const r = extract({ category: 'wifi', data: JSON.stringify({ wifi_password: 'wp' }) });
      expect(r).toEqual([{ field: 'wifi_password', value: 'wp' }]);
    });

    test('card extracts pin and cvv', () => {
      const r = extract({ category: 'card', data: JSON.stringify({ pin: '1234', cvv: '567' }) });
      expect(r).toHaveLength(2);
    });

    test('passkey extracts credential_id', () => {
      const r = extract({ category: 'passkey', data: JSON.stringify({ credential_id: 'cred123' }) });
      expect(r).toEqual([{ field: 'credential_id', value: 'cred123' }]);
    });

    test('unknown category returns empty', () => {
      expect(extract({ category: 'note' })).toHaveLength(0);
    });
  });
});
