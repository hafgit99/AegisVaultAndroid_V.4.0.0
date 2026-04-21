import { PasswordHistoryModule } from '../src/PasswordHistoryModule';
import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';

// Mock Native Dependencies
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

jest.mock('react-native-quick-crypto', () => {
    const cipher = {
        update: jest.fn(() => Buffer.alloc(0)),
        final: jest.fn(() => Buffer.alloc(0)),
        getAuthTag: jest.fn(() => Buffer.alloc(16, 0xaa)),
    };
    const decipher = {
        setAuthTag: jest.fn(),
        update: jest.fn(() => Buffer.alloc(0)),
        final: jest.fn(() => Buffer.alloc(0)),
    };

    return {
        randomBytes: jest.fn((size) => Buffer.alloc(size, 0xff)),
        randomFillSync: jest.fn((buf) => buf.fill(0xee)),
        createHmac: jest.fn(() => ({
          update: jest.fn(),
          digest: jest.fn(() => Buffer.alloc(32, 0xdd)),
        })),
        createCipheriv: jest.fn(() => cipher),
        createDecipheriv: jest.fn(() => decipher),
    };
});

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    logSecurityEvent: jest.fn(),
    encryptAES256GCM: jest.fn().mockResolvedValue({
      kdf: 'Argon2id',
      memory: 32768,
      iterations: 4,
      parallelism: 2,
      hashLength: 32,
      salt: 'salt',
      iv: 'iv',
      authTag: 'tag',
      ciphertext: 'ciphertext',
    }),
    db: { executeSync: jest.fn() }
  },
}));

describe('PasswordHistoryModule', () => {
  const getSecurityModule = () => require('../src/SecurityModule').SecurityModule;
  const historyRecord = (overrides: Partial<any> = {}) => ({
    accountId: 'acc_1',
    accountTitle: 'Account',
    accountUsername: 'user',
    history: [],
    lastChanged: 1704067200000,
    changeCount: 1,
    autoRetentionDays: 180,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (PasswordHistoryModule as any).cachedMasterSeed = null;
    
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.readFile as jest.Mock).mockResolvedValue('');
    (RNFS.writeFile as jest.Mock).mockResolvedValue(true);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
    const SecurityModule = getSecurityModule();
    SecurityModule.db = { executeSync: jest.fn() };
    (SecurityModule.db.executeSync as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT record_json')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('recordPasswordChange encrypts and appends to history', async () => {
    const result = await PasswordHistoryModule.recordPasswordChange(
      'acc_123', 'My Account', 'harun', 'new_password'
    );

    expect(result).toBe(true);
    const { SecurityModule } = require('../src/SecurityModule');
    expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO aegis_password_history_records'),
      expect.arrayContaining([
        'acc_123',
        expect.stringContaining('"accountId":"acc_123"'),
      ]),
    );
  });

  test('recordPasswordChange marks previous password as historical and trims to max history', async () => {
    const existingHistory = historyRecord({
      accountId: 'acc_trim',
      history: Array.from({ length: 10 }, (_, index) => ({
        id: `entry-${index}`,
        accountId: 'acc_trim',
        password: `cipher-${index}`,
        salt: `salt-${index}`,
        createdAt: 1704067200000 - index,
        isCurrentPassword: index === 0,
      })),
      changeCount: 10,
    });

    jest.spyOn(PasswordHistoryModule, 'getPasswordHistory').mockResolvedValue(existingHistory as any);

    const result = await PasswordHistoryModule.recordPasswordChange(
      'acc_trim',
      'Trimmed Account',
      'trim-user',
      'BrandNew#Pass123',
      'forced_reset',
      'rotation',
    );

    expect(result).toBe(true);
    expect(existingHistory.history).toHaveLength(10);
    expect(existingHistory.history[0].isCurrentPassword).toBe(true);
    expect(existingHistory.history.slice(1).every((entry: any) => entry.isCurrentPassword === false)).toBe(true);
    expect(existingHistory.changeCount).toBe(11);
    expect(existingHistory.history[0].reason).toBe('forced_reset');
    expect(existingHistory.history[0].notes).toBe('rotation');
  });

  test('recordPasswordChange logs failure details when encryption throws', async () => {
    const SecurityModule = getSecurityModule();
    jest
      .spyOn(PasswordHistoryModule as any, 'encryptPassword')
      .mockRejectedValueOnce(new Error('encrypt-failed'));

    const result = await PasswordHistoryModule.recordPasswordChange(
      'acc_fail',
      'Broken Account',
      'user',
      'password',
    );

    expect(result).toBe(false);
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'password_history_recorded',
      'failed',
      expect.objectContaining({
        accountId: 'acc_fail',
        reason: 'manual_update',
        error: 'encrypt-failed',
      }),
    );
  });

  test('detects reused passwords', async () => {
    const { SecurityModule } = require('../src/SecurityModule');
    const historyData = {
      accountId: 'acc_123',
      history: [
        { 
            password: JSON.stringify({ v: 2, data: Buffer.from('old_pwd').toString('base64'), iv: '', tag: '' }), 
            salt: 's', 
            createdAt: Date.now() 
        }
      ]
    };
    
    (SecurityModule.db.executeSync as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT record_json')) {
        return { rows: [{ record_json: JSON.stringify(historyData) }] };
      }
      return { rows: [] };
    });

    const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', Buffer.alloc(32), Buffer.alloc(12));
    (decipher.final as jest.Mock).mockReturnValueOnce(Buffer.from('old_pwd'));

    const reuse = await PasswordHistoryModule.checkPasswordReuse('old_pwd', 'acc_123');
    expect(reuse.isReused).toBe(true);
  });

  test('checkPasswordReuse skips null passwords and returns false on mismatches or lookup errors', async () => {
    const getHistorySpy = jest.spyOn(PasswordHistoryModule, 'getPasswordHistory');
    getHistorySpy
      .mockResolvedValueOnce(
        historyRecord({
          history: [
            { id: 'skip', accountId: 'acc_1', password: null, salt: 'salt-0', createdAt: 1, isCurrentPassword: false },
            { id: 'entry', accountId: 'acc_1', password: 'cipher', salt: 'salt-1', createdAt: 2, isCurrentPassword: true },
          ],
        }) as any,
      )
      .mockRejectedValueOnce(new Error('lookup failed'));
    jest
      .spyOn(PasswordHistoryModule as any, 'decryptPassword')
      .mockResolvedValueOnce('Different#Pass123');

    await expect(PasswordHistoryModule.checkPasswordReuse('Unique#Pass123', 'acc_1')).resolves.toEqual({
      isReused: false,
    });
    await expect(PasswordHistoryModule.checkPasswordReuse('pw', 'acc_1')).resolves.toEqual({
      isReused: false,
    });
  });

  test('cleanup removes entries older than window but keeps at least 3', async () => {
    const { SecurityModule } = require('../src/SecurityModule');
    const oldDate = Date.now() - (200 * 24 * 60 * 60 * 1000);
    const historyData = {
      accountId: 'acc',
      history: Array(5).fill(0).map((_, i) => ({ 
        id: `id_${i}`, 
        createdAt: oldDate, 
        password: JSON.stringify({v:2, data:'', iv:'', tag:''}) 
      }))
    };
    (SecurityModule.db.executeSync as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT record_json')) {
        return { rows: [{ record_json: JSON.stringify(historyData) }] };
      }
      return { rows: [] };
    });

    const removed = await PasswordHistoryModule.cleanupExpiredPasswords('acc');
    expect(removed).toBe(2);
    expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO aegis_password_history_records'),
      expect.any(Array),
    );
  });

  test('cleanupExpiredPasswords keeps recent entries and avoids saving when nothing is removed', async () => {
    const SecurityModule = getSecurityModule();
    jest.spyOn(PasswordHistoryModule, 'getPasswordHistory').mockResolvedValue(
      historyRecord({
        accountId: 'acc_recent',
        history: Array.from({ length: 4 }, (_, index) => ({
          id: `recent-${index}`,
          accountId: 'acc_recent',
          password: `cipher-${index}`,
          salt: `salt-${index}`,
          createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000 - index,
          isCurrentPassword: index === 0,
        })),
      }) as any,
    );

    const removed = await PasswordHistoryModule.cleanupExpiredPasswords('acc_recent');

    expect(removed).toBe(0);
    expect(SecurityModule.db.executeSync).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO aegis_password_history_records'),
      expect.any(Array),
    );
  });

  test('migrates legacy file-based history into SQLCipher on first read', async () => {
    const { SecurityModule } = require('../src/SecurityModule');
    const legacyRecord = {
      accountId: 'legacy_acc',
      accountTitle: 'Legacy',
      accountUsername: 'legacy-user',
      history: [],
      lastChanged: Date.now(),
      changeCount: 0,
      autoRetentionDays: 180,
    };
    const cipherText = JSON.stringify(legacyRecord);
    const mockEnvelope = JSON.stringify({
      v: 2,
      iv: '',
      tag: '',
      data: Buffer.from(cipherText).toString('base64'),
    });

    (SecurityModule.db.executeSync as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT record_json')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(mockEnvelope);

    const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', Buffer.alloc(32), Buffer.alloc(12));
    (decipher.final as jest.Mock).mockReturnValueOnce(Buffer.from(cipherText));

    const result = await PasswordHistoryModule.getPasswordHistory('legacy_acc');

    expect(result?.accountId).toBe('legacy_acc');
    expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO aegis_password_history_records'),
      expect.any(Array),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith(
      expect.stringContaining('password_history_legacy_acc.json'),
    );
  });

  test('getPasswordHistory returns parsed SQLCipher row when present', async () => {
    const SecurityModule = getSecurityModule();
    const record = historyRecord({ accountId: 'acc_db' });
    (SecurityModule.db.executeSync as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT record_json')) {
        return { rows: [{ record_json: JSON.stringify(record) }] };
      }
      return { rows: [] };
    });

    await expect(PasswordHistoryModule.getPasswordHistory('acc_db')).resolves.toEqual(record);
    expect(RNFS.exists).not.toHaveBeenCalled();
  });

  test('getPasswordHistory falls back to null when database read throws', async () => {
    const SecurityModule = getSecurityModule();
    (SecurityModule.db.executeSync as jest.Mock).mockImplementation(() => {
      throw new Error('db read failed');
    });

    await expect(PasswordHistoryModule.getPasswordHistory('acc_broken')).resolves.toBeNull();
  });

  test('getPreviousPassword rejects out-of-range history index', async () => {
    await expect(
      PasswordHistoryModule.getPreviousPassword('acc_123', 99),
    ).resolves.toBeNull();
  });

  test('getPreviousPassword returns null when history entry is missing or password is null', async () => {
    jest
      .spyOn(PasswordHistoryModule, 'getPasswordHistory')
      .mockResolvedValueOnce(historyRecord({ history: [] }) as any)
      .mockResolvedValueOnce(
        historyRecord({
          history: [
            {
              id: 'entry-1',
              accountId: 'acc_1',
              password: null,
              salt: 'salt',
              createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
              isCurrentPassword: false,
            },
          ],
        }) as any,
      );

    await expect(PasswordHistoryModule.getPreviousPassword('acc_1', 0)).resolves.toBeNull();
    await expect(PasswordHistoryModule.getPreviousPassword('acc_1', 0)).resolves.toBeNull();
  });

  test('getPreviousPassword rejects passwords that are too recent and decrypts mature entries', async () => {
    const getHistorySpy = jest.spyOn(PasswordHistoryModule, 'getPasswordHistory');
    getHistorySpy
      .mockResolvedValueOnce(
        historyRecord({
          history: [
            {
              id: 'recent-entry',
              accountId: 'acc_1',
              password: 'cipher',
              salt: 'salt',
              createdAt: Date.now() - 12 * 60 * 60 * 1000,
              isCurrentPassword: false,
            },
          ],
        }) as any,
      )
      .mockResolvedValueOnce(
        historyRecord({
          history: [
            {
              id: 'old-entry',
              accountId: 'acc_1',
              password: 'cipher',
              salt: 'salt',
              createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
              isCurrentPassword: false,
            },
          ],
        }) as any,
      );
    jest
      .spyOn(PasswordHistoryModule as any, 'decryptPassword')
      .mockResolvedValueOnce('Recovered#Pass123');

    await expect(PasswordHistoryModule.getPreviousPassword('acc_1', 0)).resolves.toBeNull();
    await expect(PasswordHistoryModule.getPreviousPassword('acc_1', 0)).resolves.toBe('Recovered#Pass123');
  });

  test('shouldRemindPasswordChange recommends routine rotation after 90 days', async () => {
    const { SecurityModule } = require('../src/SecurityModule');
    const oldDate = Date.now() - 91 * 24 * 60 * 60 * 1000;
    (SecurityModule.db.executeSync as jest.Mock).mockImplementation((query: string) => {
      if (query.includes('SELECT record_json')) {
        return {
          rows: [
            {
              record_json: JSON.stringify({
                accountId: 'acc_1',
                accountTitle: 'Account',
                accountUsername: 'user',
                history: [],
                lastChanged: oldDate,
                changeCount: 1,
                autoRetentionDays: 180,
              }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const reminder = await PasswordHistoryModule.shouldRemindPasswordChange(
      'acc_1',
    );
    expect(reminder.shouldRemind).toBe(true);
    expect(reminder.reason).toBe('routine');
  });

  test('shouldRemindPasswordChange returns routine reminder for new accounts and days-since-change for recent ones', async () => {
    const getHistorySpy = jest.spyOn(PasswordHistoryModule, 'getPasswordHistory');
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    getHistorySpy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        historyRecord({
          history: [
            {
              id: 'entry',
              accountId: 'acc_recent',
              password: 'cipher',
              salt: 'salt',
              createdAt: thirtyDaysAgo,
              isCurrentPassword: true,
            },
          ],
          lastChanged: thirtyDaysAgo,
        }) as any,
      );

    await expect(PasswordHistoryModule.shouldRemindPasswordChange('acc_new')).resolves.toEqual({
      shouldRemind: true,
      reason: 'routine',
    });

    const reminder = await PasswordHistoryModule.shouldRemindPasswordChange('acc_recent');
    expect(reminder.shouldRemind).toBe(false);
    expect(reminder.daysSinceChange).toBe(30);
  });

  test('validateNewPassword penalizes reused and weak passwords', async () => {
    const reuseSpy = jest
      .spyOn(PasswordHistoryModule, 'checkPasswordReuse')
      .mockResolvedValue({
        isReused: true,
        lastUsedDate: Date.now() - 24 * 60 * 60 * 1000,
      } as any);

    const result = await PasswordHistoryModule.validateNewPassword(
      'password',
      'acc_1',
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Contains common patterns');
    expect(result.errors.some((error) => error.startsWith('Used before'))).toBe(true);
    expect(result.strengthScore).toBeLessThan(50);

    reuseSpy.mockRestore();
  });

  test('validateNewPassword returns exact complexity feedback and boundary scores', async () => {
    const reuseSpy = jest.spyOn(PasswordHistoryModule, 'checkPasswordReuse');
    reuseSpy
      .mockResolvedValueOnce({ isReused: false } as any)
      .mockResolvedValueOnce({ isReused: false } as any)
      .mockResolvedValueOnce({ isReused: false } as any);

    const shortResult = await PasswordHistoryModule.validateNewPassword('abc', 'acc_short');
    const twelveChar = await PasswordHistoryModule.validateNewPassword('Abcd1234!xyz', 'acc_12');
    const patterned = await PasswordHistoryModule.validateNewPassword('qwertyAAA111!!!', 'acc_pattern');

    expect(shortResult.errors).toContain('Minimum 8 characters required');
    expect(shortResult.errors).toContain('Add uppercase letters');
    expect(shortResult.errors).toContain('Add numbers');
    expect(shortResult.errors).toContain('Add special characters');
    expect(shortResult.strengthScore).toBe(15);
    expect(twelveChar.strengthScore).toBe(90);
    expect(patterned.errors.filter((error) => error === 'Contains common patterns')).toHaveLength(2);
    expect(patterned.strengthScore).toBe(50);

    reuseSpy.mockRestore();
  });

  test('recoverWithPreviousPassword returns recovered password and audit message', async () => {
    const getPreviousSpy = jest
      .spyOn(PasswordHistoryModule, 'getPreviousPassword')
      .mockResolvedValue('restored-secret');
    const historySpy = jest
      .spyOn(PasswordHistoryModule, 'getPasswordHistory')
      .mockResolvedValue({
        accountId: 'acc_1',
        accountTitle: 'Account',
        accountUsername: 'user',
        history: [
          {
            id: 'entry-1',
            accountId: 'acc_1',
            password: 'cipher',
            salt: 'salt',
            createdAt: 1704067200000,
            isCurrentPassword: false,
          },
        ],
        lastChanged: 1704067200000,
        changeCount: 1,
        autoRetentionDays: 180,
      } as any);

    const result = await PasswordHistoryModule.recoverWithPreviousPassword(
      'acc_1',
      'Account',
      0,
      'recovery',
    );

    expect(result.success).toBe(true);
    expect(result.password).toBe('restored-secret');
    expect(result.message).toContain('Password recovered from');

    getPreviousSpy.mockRestore();
    historySpy.mockRestore();
  });

  test('recoverWithPreviousPassword returns warning when password is unavailable and falls back to epoch message when history is missing', async () => {
    const getPreviousSpy = jest.spyOn(PasswordHistoryModule, 'getPreviousPassword');
    const historySpy = jest.spyOn(PasswordHistoryModule, 'getPasswordHistory');

    getPreviousSpy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('restored-secret');
    historySpy.mockResolvedValueOnce(null as any);

    await expect(
      PasswordHistoryModule.recoverWithPreviousPassword('acc_1', 'Account', 0),
    ).resolves.toEqual({
      success: false,
      password: null,
      message: '⚠️ Cannot retrieve that password (too recent or not found)',
    });

    const recovered = await PasswordHistoryModule.recoverWithPreviousPassword('acc_1', 'Account', 0);
    expect(recovered.success).toBe(true);
    expect(recovered.password).toBe('restored-secret');
    expect(recovered.message).toContain('1970');

    getPreviousSpy.mockRestore();
    historySpy.mockRestore();
  });

  test('recoverWithPreviousPassword rejects invalid history indexes', async () => {
    const result = await PasswordHistoryModule.recoverWithPreviousPassword(
      'acc_1',
      'Account',
      99,
    );

    expect(result).toEqual({
      success: false,
      password: null,
      message: '❌ Invalid password history index',
    });
  });

  test('exportPasswordHistoryAudit strips passwords and returns encrypted payload', async () => {
    const SecurityModule = getSecurityModule();
    const historySpy = jest
      .spyOn(PasswordHistoryModule, 'getPasswordHistory')
      .mockResolvedValue({
        accountId: 'acc_1',
        accountTitle: 'Account',
        accountUsername: 'user',
        history: [
          {
            id: 'entry-1',
            accountId: 'acc_1',
            password: 'ciphertext',
            salt: 'salt',
            createdAt: 1704067200000,
            reason: 'manual_update',
            notes: 'rotated',
            isCurrentPassword: true,
          },
        ],
        lastChanged: 1704067200000,
        changeCount: 1,
        autoRetentionDays: 180,
      } as any);

    const encrypted = await PasswordHistoryModule.exportPasswordHistoryAudit(
      'acc_1',
      'audit-password',
    );

    expect(encrypted).toBeTruthy();
    const parsed = JSON.parse(encrypted!);
    expect(parsed.purpose).toBe('password_history_audit_export');
    expect(parsed.algorithm).toBe('AES-256-GCM');
    expect(parsed.data).toBe('ciphertext');
    expect(SecurityModule.encryptAES256GCM).toHaveBeenCalledWith(
      expect.not.stringContaining('ciphertext'),
      'audit-password',
    );
    expect(SecurityModule.encryptAES256GCM).toHaveBeenCalledWith(
      expect.stringContaining('"exportedBy":"PasswordHistoryModule"'),
      'audit-password',
    );

    historySpy.mockRestore();
  });

  test('exportPasswordHistoryAudit returns null when missing and logs failures when encryption breaks', async () => {
    const SecurityModule = getSecurityModule();
    const getHistorySpy = jest.spyOn(PasswordHistoryModule, 'getPasswordHistory');
    getHistorySpy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        historyRecord({
          history: [
            {
              id: 'entry-1',
              accountId: 'acc_1',
              password: 'cipher',
              salt: 'salt',
              createdAt: 1704067200000,
              isCurrentPassword: true,
            },
          ],
        }) as any,
      );
    (SecurityModule.encryptAES256GCM as jest.Mock).mockRejectedValueOnce(new Error('export-encryption-failed'));

    await expect(
      PasswordHistoryModule.exportPasswordHistoryAudit('missing', 'audit-password'),
    ).resolves.toBeNull();
    await expect(
      PasswordHistoryModule.exportPasswordHistoryAudit('acc_1', 'audit-password'),
    ).resolves.toBeNull();

    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'password_history_audit_export',
      'failed',
      expect.objectContaining({
        accountId: 'acc_1',
        error: 'export-encryption-failed',
      }),
    );
  });

  test('validateNewPassword accepts strong unique passwords', async () => {
    const reuseSpy = jest
      .spyOn(PasswordHistoryModule, 'checkPasswordReuse')
      .mockResolvedValue({ isReused: false } as any);

    const result = await PasswordHistoryModule.validateNewPassword(
      'Stronger#Pass1234',
      'acc_2',
    );

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.strengthScore).toBeGreaterThanOrEqual(80);

    reuseSpy.mockRestore();
  });

  test('ensureHistoryTable and savePasswordHistory use SQLCipher consistently', async () => {
    const SecurityModule = getSecurityModule();
    const history = historyRecord({ accountId: 'acc_save' });

    await (PasswordHistoryModule as any).ensureHistoryTable();
    await (PasswordHistoryModule as any).savePasswordHistory('acc_save', history);

    expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS aegis_password_history_records'),
    );
    expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO aegis_password_history_records'),
      expect.arrayContaining(['acc_save', JSON.stringify(history)]),
    );
  });

  test('ensureHistoryTable throws without an open database', async () => {
    const SecurityModule = getSecurityModule();
    SecurityModule.db = null;

    await expect((PasswordHistoryModule as any).ensureHistoryTable()).rejects.toThrow(
      'Password history requires an open SQLCipher database',
    );
  });

  test('getMasterSeed returns cached, existing, and newly generated seed values', async () => {
    const cachedSeed = Buffer.alloc(32, 0x11);
    (PasswordHistoryModule as any).cachedMasterSeed = cachedSeed;
    await expect((PasswordHistoryModule as any).getMasterSeed()).resolves.toBe(cachedSeed);

    (PasswordHistoryModule as any).cachedMasterSeed = null;
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(true);
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce('aa'.repeat(32));
    const existingSeed = await (PasswordHistoryModule as any).getMasterSeed();
    expect(existingSeed.toString('hex')).toBe('aa'.repeat(32));

    (PasswordHistoryModule as any).cachedMasterSeed = null;
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);
    const newSeed = await (PasswordHistoryModule as any).getMasterSeed();
    expect(newSeed.toString('hex')).toBe('ee'.repeat(32));
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.aegis_pwh_master_seed'),
      'ee'.repeat(32),
      'utf8',
    );
  });

  test('deriveKey, generateSalt, constantTimeCompare, and encryptWithPassword expose expected metadata', async () => {
    const SecurityModule = getSecurityModule();
    const digest = Buffer.alloc(32, 0xdd);
    const update = jest.fn();
    (QuickCrypto.createHmac as jest.Mock).mockReturnValueOnce({
      update,
      digest: jest.fn(() => digest),
    });

    const key = (PasswordHistoryModule as any).deriveKey(Buffer.alloc(32, 0xaa), 'test-context');
    const salt = (PasswordHistoryModule as any).generateSalt();
    const exported = JSON.parse(await (PasswordHistoryModule as any).encryptWithPassword('payload', 'audit-pass'));

    expect(Buffer.from(key)).toEqual(digest);
    expect(update).toHaveBeenCalledWith('test-context');
    expect(salt).toHaveLength(64);
    expect(salt).toMatch(/^[a-f0-9]+$/);
    expect((PasswordHistoryModule as any).constantTimeCompare('same-value', 'same-value')).toBe(true);
    expect((PasswordHistoryModule as any).constantTimeCompare('same-value', 'same-valuE')).toBe(false);
    expect((PasswordHistoryModule as any).constantTimeCompare('short', 'longer')).toBe(false);
    expect(SecurityModule.encryptAES256GCM).toHaveBeenCalledWith('payload', 'audit-pass');
    expect(exported).toEqual(
      expect.objectContaining({
        version: '1.0.0',
        purpose: 'password_history_audit_export',
        algorithm: 'AES-256-GCM',
        data: 'ciphertext',
      }),
    );
  });

  test('password and history crypto helpers support v2, legacy, and invalid payloads', async () => {
    const cipher = {
      update: jest.fn(() => Buffer.from('enc-body')),
      final: jest.fn(() => Buffer.from('enc-final')),
      getAuthTag: jest.fn(() => Buffer.from('tag-value')),
    };
    const decipherPasswordV2 = {
      setAuthTag: jest.fn(),
      update: jest.fn(() => Buffer.from('clear-body')),
      final: jest.fn(() => Buffer.from('clear-final')),
    };
    const decipherPasswordLegacy = {
      setAuthTag: jest.fn(),
      update: jest.fn(() => Buffer.from('legacy-clear')),
      final: jest.fn(() => Buffer.from('-done')),
    };
    const historyCipher = {
      update: jest.fn(() => Buffer.from('hist-body')),
      final: jest.fn(() => Buffer.from('hist-final')),
      getAuthTag: jest.fn(() => Buffer.from('hist-tag')),
    };
    const decipherHistoryV2 = {
      setAuthTag: jest.fn(),
      update: jest.fn(() => Buffer.from('hist-clear')),
      final: jest.fn(() => Buffer.from('-v2')),
    };
    const decipherHistoryLegacy = {
      setAuthTag: jest.fn(),
      update: jest.fn(() => Buffer.from('hist-clear')),
      final: jest.fn(() => Buffer.from('-legacy')),
    };

    (QuickCrypto.createCipheriv as jest.Mock)
      .mockReturnValueOnce(cipher)
      .mockReturnValueOnce(historyCipher);
    (QuickCrypto.createDecipheriv as jest.Mock)
      .mockReturnValueOnce(decipherPasswordV2)
      .mockReturnValueOnce(decipherPasswordLegacy)
      .mockReturnValueOnce(decipherHistoryV2)
      .mockReturnValueOnce(decipherHistoryLegacy);

    const encryptedPassword = await (PasswordHistoryModule as any).encryptPassword('Secret#123');
    const passwordPayload = JSON.parse(encryptedPassword);
    expect(passwordPayload.v).toBe(2);
    expect(passwordPayload.key).toBeUndefined();
    await expect((PasswordHistoryModule as any).decryptPassword(encryptedPassword, 'salt')).resolves.toBe(
      'clear-bodyclear-final',
    );

    const legacyPassword = JSON.stringify({
      key: Buffer.alloc(32, 0xaa).toString('base64'),
      iv: Buffer.alloc(12, 0xbb).toString('base64'),
      tag: Buffer.alloc(16, 0xcc).toString('base64'),
      data: Buffer.from('cipher').toString('base64'),
    });
    await expect((PasswordHistoryModule as any).decryptPassword(legacyPassword, 'salt')).resolves.toBe(
      'legacy-clear-done',
    );
    await expect((PasswordHistoryModule as any).decryptPassword('not-json', 'salt')).resolves.toBe('');

    const encryptedHistory = await (PasswordHistoryModule as any).encryptHistory('{"history":true}');
    const historyPayload = JSON.parse(encryptedHistory);
    expect(historyPayload.v).toBe(2);
    await expect((PasswordHistoryModule as any).decryptHistory(encryptedHistory)).resolves.toBe('hist-clear-v2');

    const legacyHistory = JSON.stringify({
      key: Buffer.alloc(32, 0xaa).toString('base64'),
      iv: Buffer.alloc(12, 0xbb).toString('base64'),
      tag: Buffer.alloc(16, 0xcc).toString('base64'),
      data: Buffer.from('cipher').toString('base64'),
    });
    await expect((PasswordHistoryModule as any).decryptHistory(legacyHistory)).resolves.toBe('hist-clear-legacy');
    await expect((PasswordHistoryModule as any).decryptHistory('bad-json')).resolves.toBeNull();
  });
});
