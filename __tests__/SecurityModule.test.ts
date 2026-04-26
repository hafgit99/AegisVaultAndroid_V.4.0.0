/**
 * SecurityModule.test.ts — Aegis Vault Android v4.2.0
 * Hardened mutation-killing tests for core security operations.
 *
 * Covers: brute-force protection, biometric derivation, password health,
 * AES-256-GCM encrypt/decrypt, shared vault sanitization, parsing,
 * device salt management, and app config persistence.
 */

import { SecurityModule } from '../src/SecurityModule';
import RNFS from 'react-native-fs';

// ═══════════════════════════════════════════════════════════════
// Mocks — minimal, deterministic, verifiable
// ═══════════════════════════════════════════════════════════════

jest.mock('react-native-biometrics', () => {
  return jest.fn().mockImplementation(() => ({
    simplePrompt: jest.fn().mockResolvedValue({ success: true }),
    biometricKeysExist: jest.fn().mockResolvedValue({ keysExist: false }),
    createKeys: jest.fn().mockResolvedValue({ publicKey: 'mock-pk-material' }),
    deleteKeys: jest.fn().mockResolvedValue(undefined),
  }));
});

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/doc',
  DownloadDirectoryPath: '/downloads',
  ExternalDirectoryPath: '/external',
  CachesDirectoryPath: '/cache',
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1024 }),
  TemporaryDirectoryPath: '/tmp',
}));

jest.mock('react-native-quick-crypto', () => ({
  randomBytes: jest.fn((size: number) => Buffer.alloc(size, 0x42)),
  createHmac: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue(Buffer.alloc(32, 0xab)),
  })),
  createCipheriv: jest.fn(() => ({
    update: jest.fn((d: any) => Buffer.from(d)),
    final: jest.fn(() => Buffer.alloc(0)),
    getAuthTag: jest.fn(() => Buffer.alloc(16, 0xcc)),
  })),
  createDecipheriv: jest.fn(() => ({
    update: jest.fn((d: any) => Buffer.from(d)),
    final: jest.fn(() => Buffer.alloc(0)),
    setAuthTag: jest.fn(),
  })),
  pbkdf2: jest.fn((_p: any, _s: any, _i: any, l: number, _a: any, cb: Function) => cb(null, Buffer.alloc(l, 0xdd))),
}));

jest.mock('react-native-argon2', () => {
  return jest.fn().mockImplementation((password: string, salt: string, options: any) => {
    const pStr = typeof password === 'string' ? password : Buffer.from(password).toString('hex');
    const sStr = typeof salt === 'string' ? salt : Buffer.from(salt).toString('hex');
    const hashLen = options.hashLength || 32;
    const hash = Buffer.alloc(hashLen);
    for (let i = 0; i < hash.length; i++) {
      hash[i] = (pStr.charCodeAt(i % pStr.length) ^ sStr.charCodeAt(i % sStr.length)) & 0xFF;
    }
    return Promise.resolve({ rawHash: hash.toString('hex') });
  });
});

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn().mockReturnValue({
    executeSync: jest.fn(),
    execute: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('./i18n', () => ({ t: (k: string) => k }), { virtual: true });
jest.mock('../src/i18n', () => ({ t: (k: string) => k, default: { t: (k: string) => k } }));

jest.mock('../src/IntegrityModule', () => ({
  IntegrityModule: {
    getIntegritySignals: jest.fn().mockResolvedValue({
      rooted: false, emulator: false, debugBuild: false, testKeys: false,
      adbEnabled: false, score: 95, riskLevel: 'low', reasons: [], artifacts: [],
    }),
    checkDeviceIntegrity: jest.fn().mockResolvedValue({
      riskLevel: 'low', score: 95, reasons: [],
    }),
  },
}));

jest.mock('../src/WearOSModule', () => ({
  WearOSModule: { syncToWatch: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../src/AutofillService', () => ({
  AutofillService: { syncCredentials: jest.fn().mockResolvedValue(undefined) },
}));

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('SecurityModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset internal state
    SecurityModule.db = null;
    (SecurityModule as any).deviceSalt = null;
    (SecurityModule as any).currentUnlockSecret = null;
    (SecurityModule as any).appConfig = null;
    (SecurityModule as any).bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
  });

  // ── Biometric Key Derivation ────────────────────────────────

  describe('deriveKeyFromBiometric', () => {
    it('returns a hex key on successful biometric verification', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false); // no existing salt
      const key = await SecurityModule.deriveKeyFromBiometric();
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
      // Key should be hex string (64 chars for 32 bytes)
      expect(key!.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(key!)).toBe(true);
    });

    it('returns null when biometric prompt is cancelled', async () => {
      const RNBio = require('react-native-biometrics');
      RNBio.mockImplementation(() => ({
        simplePrompt: jest.fn().mockResolvedValue({ success: false }),
        biometricKeysExist: jest.fn(),
        createKeys: jest.fn(),
        deleteKeys: jest.fn(),
      }));

      const key = await SecurityModule.deriveKeyFromBiometric();
      expect(key).toBeNull();
    });

    it('deletes existing keys if they exist but no public key is stored', async () => {
      const RNBio = require('react-native-biometrics');
      const deleteKeysSpy = jest.fn().mockResolvedValue(undefined);
      RNBio.mockImplementation(() => ({
        simplePrompt: jest.fn().mockResolvedValue({ success: true }),
        biometricKeysExist: jest.fn().mockResolvedValue({ keysExist: true }),
        createKeys: jest.fn().mockResolvedValue({ publicKey: 'new-pk' }),
        deleteKeys: deleteKeysSpy,
      }));

      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      
      await SecurityModule.deriveKeyFromBiometric();
      expect(deleteKeysSpy).toHaveBeenCalled();
    });

    it('returns null if Argon2 derivation fails', async () => {
      const Argon2Fn = require('react-native-argon2');
      Argon2Fn.mockResolvedValueOnce({ rawHash: null });

      const key = await SecurityModule.deriveKeyFromBiometric();
      expect(key).toBeNull();
    });
  });

  // ── Brute Force Protection ──────────────────────────────────

  describe('Brute force protection', () => {
    it('getRemainingLockout returns 0 when no lockout', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      const lockout = await SecurityModule.getRemainingLockout();
      expect(typeof lockout).toBe('number');
      expect(lockout).toBe(0);
    });

    it('getFailedAttempts returns current count', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      const count = await SecurityModule.getFailedAttempts();
      expect(typeof count).toBe('number');
      expect(count).toBe(0);
    });

    it('getRemainingLockout returns positive seconds when locked', async () => {
      const lockUntil = Date.now() + 60000; // 60 seconds from now
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        failCount: 5, lockUntil, lastAttempt: Date.now(),
      }));
      const lockout = await SecurityModule.getRemainingLockout();
      expect(lockout).toBeGreaterThan(0);
      expect(lockout).toBeLessThanOrEqual(61);
    });

    it('getRemainingLockout returns 0 when lock has expired', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        failCount: 5, lockUntil: Date.now() - 1000, lastAttempt: Date.now() - 60000,
      }));
      const lockout = await SecurityModule.getRemainingLockout();
      expect(lockout).toBe(0);
    });
  });

  // ── Password Health Report ──────────────────────────────────

  describe('getPasswordHealthReport', () => {
    it('identifies empty/incomplete accounts', async () => {
      jest.spyOn(SecurityModule, 'getItems').mockResolvedValue([{
        id: 1, title: 'Test', username: 'user', password: '',
        category: 'login', data: '{}', url: '', notes: '',
        favorite: 0, is_deleted: 0,
      }] as any);

      const report = await SecurityModule.getPasswordHealthReport();

      expect(report.summary.totalItems).toBe(1);
      expect(report.summary.emptyOrIncompleteCount).toBe(1);
      expect(typeof report.score).toBe('number');
      expect(typeof report.generatedAt).toBe('string');
      expect(report.riskLevel).toBeDefined();
    });

    it('calculates health for strong passwords', async () => {
      jest.spyOn(SecurityModule, 'getItems').mockResolvedValue([{
        id: 1, title: 'Strong', username: 'u',
        password: 'V3ry$tr0ng!P@$$w0rd',
        category: 'login', data: '{}', url: '', notes: '',
        favorite: 0, is_deleted: 0,
      }] as any);

      const report = await SecurityModule.getPasswordHealthReport();
      expect(report.summary.totalItems).toBe(1);
      expect(report.summary.emptyOrIncompleteCount).toBe(0);
    });

    it('detects reused passwords across items', async () => {
      const sharedPw = 'duplicatePw123!';
      jest.spyOn(SecurityModule, 'getItems').mockResolvedValue([
        { id: 1, title: 'A', username: 'u1', password: sharedPw, category: 'login', data: '{}', url: '', notes: '', favorite: 0, is_deleted: 0 },
        { id: 2, title: 'B', username: 'u2', password: sharedPw, category: 'login', data: '{}', url: '', notes: '', favorite: 0, is_deleted: 0 },
      ] as any);

      const report = await SecurityModule.getPasswordHealthReport();
      expect(report.summary.reusedCount).toBeGreaterThanOrEqual(1);
    });

    it('returns correct structure with all fields', async () => {
      jest.spyOn(SecurityModule, 'getItems').mockResolvedValue([] as any);
      const report = await SecurityModule.getPasswordHealthReport();

      expect(report).toHaveProperty('score');
      expect(report).toHaveProperty('riskLevel');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('issues');
      expect(report).toHaveProperty('actions');
      expect(report).toHaveProperty('hardening');
      expect(report.summary).toHaveProperty('totalItems');
      expect(report.summary).toHaveProperty('checkedSecrets');
      expect(report.summary).toHaveProperty('weakCount');
      expect(report.summary).toHaveProperty('reusedCount');
      expect(report.summary).toHaveProperty('similarCount');
      expect(report.summary).toHaveProperty('emptyOrIncompleteCount');
    });
  });

  // ── parseSharedAssignment ───────────────────────────────────

  describe('parseSharedAssignment', () => {
    it('returns null for null/undefined input', () => {
      expect(SecurityModule.parseSharedAssignment(null)).toBeNull();
      expect(SecurityModule.parseSharedAssignment(undefined)).toBeNull();
    });

    it('returns null for item without shared data', () => {
      expect(SecurityModule.parseSharedAssignment({ data: '{}' } as any)).toBeNull();
    });

    it('returns null when spaceId is empty', () => {
      expect(SecurityModule.parseSharedAssignment({
        data: JSON.stringify({ shared: { spaceId: '' } }),
      } as any)).toBeNull();
    });

    it('parses valid shared assignment from item', () => {
      const result = SecurityModule.parseSharedAssignment({
        data: JSON.stringify({
          shared: {
            spaceId: 'space_123',
            role: 'editor',
            sharedBy: 'Alice',
            isSensitive: true,
            emergencyAccess: false,
            notes: 'test note',
            lastReviewedAt: '2026-01-01',
          },
        }),
      } as any);

      expect(result).not.toBeNull();
      expect(result!.spaceId).toBe('space_123');
      expect(result!.role).toBe('editor');
      expect(result!.sharedBy).toBe('Alice');
      expect(result!.isSensitive).toBe(true);
      expect(result!.emergencyAccess).toBe(false);
      expect(result!.notes).toBe('test note');
      expect(result!.lastReviewedAt).toBe('2026-01-01');
    });

    it('defaults role to viewer for invalid roles', () => {
      const result = SecurityModule.parseSharedAssignment({
        data: JSON.stringify({
          shared: { spaceId: 'sp1', role: 'admin' },
        }),
      } as any);

      expect(result!.role).toBe('viewer');
    });

    it('parses from raw string data', () => {
      const jsonStr = JSON.stringify({
        shared: { spaceId: 'from-string', role: 'viewer' },
      });
      const result = SecurityModule.parseSharedAssignment(jsonStr);
      expect(result).not.toBeNull();
      expect(result!.spaceId).toBe('from-string');
    });

    it('returns undefined for optional empty fields', () => {
      const result = SecurityModule.parseSharedAssignment({
        data: JSON.stringify({
          shared: { spaceId: 'sp', sharedBy: '', notes: '  ', lastReviewedAt: '' },
        }),
      } as any);

      expect(result!.sharedBy).toBeUndefined();
      expect(result!.notes).toBeUndefined();
      expect(result!.lastReviewedAt).toBeUndefined();
    });
  });

  // ── encryptAES256GCM ────────────────────────────────────────

  describe('encryptAES256GCM', () => {
    it('returns all required encryption fields', async () => {
      const result = await SecurityModule.encryptAES256GCM('hello world', 'p@ssw0rd');

      expect(result).toHaveProperty('salt');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('kdf');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('iterations');
      expect(result).toHaveProperty('parallelism');
      expect(result).toHaveProperty('hashLength');
    });

    it('uses Argon2id as KDF', async () => {
      const result = await SecurityModule.encryptAES256GCM('test', 'pw');
      expect(result.kdf).toBe('Argon2id');
    });

    it('returns base64 encoded strings for salt/iv/authTag/ciphertext', async () => {
      const result = await SecurityModule.encryptAES256GCM('data', 'key');
      // Base64 chars only
      const b64regex = /^[A-Za-z0-9+/=]+$/;
      expect(b64regex.test(result.salt)).toBe(true);
      expect(b64regex.test(result.iv)).toBe(true);
      expect(b64regex.test(result.authTag)).toBe(true);
    });

    it('uses correct KDF parameters', async () => {
      const result = await SecurityModule.encryptAES256GCM('test', 'pw');
      expect(result.memory).toBe(32768);
      expect(result.iterations).toBe(4);
      expect(result.parallelism).toBe(2);
      expect(result.hashLength).toBe(32);
    });

    it('generates random salt and iv for each call', async () => {
      // randomBytesSafe is called for salt (32) and iv (12)
      await SecurityModule.encryptAES256GCM('test', 'pw');
      const QC = require('react-native-quick-crypto');
      expect(QC.randomBytes).toHaveBeenCalled();
      expect(QC.createCipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        expect.any(Uint8Array),
        expect.any(Uint8Array),
      );
      const [, keyArg, ivArg] = QC.createCipheriv.mock.calls[0];
      expect(keyArg.length).toBe(32);
      expect(ivArg.length).toBe(12);
    });
  });

  // ── decryptAES256GCM ────────────────────────────────────────

  describe('decryptAES256GCM', () => {
    it('decrypts with Argon2id KDF metadata', async () => {
      // Setup: cipher mock returns buffer that decodes to plaintext
      const plaintext = 'secret message';
      const QC = require('react-native-quick-crypto');
      QC.createDecipheriv.mockReturnValue({
        update: jest.fn(() => Buffer.from(plaintext, 'utf8')),
        final: jest.fn(() => Buffer.alloc(0)),
        setAuthTag: jest.fn(),
      });

      const result = await SecurityModule.decryptAES256GCM(
        Buffer.from('encrypted').toString('base64'),
        'password',
        Buffer.alloc(32).toString('base64'),
        Buffer.alloc(12).toString('base64'),
        Buffer.alloc(16).toString('base64'),
        { kdf: 'Argon2id', memory: 32768, iterations: 4, parallelism: 2, hashLength: 32 },
      );

      expect(result).toBe(plaintext);
    });

    it('handles legacy PBKDF2 KDF', async () => {
      const QC = require('react-native-quick-crypto');
      QC.createDecipheriv.mockReturnValue({
        update: jest.fn(() => Buffer.from('legacy', 'utf8')),
        final: jest.fn(() => Buffer.alloc(0)),
        setAuthTag: jest.fn(),
      });

      const result = await SecurityModule.decryptAES256GCM(
        Buffer.from('data').toString('base64'),
        'pw',
        Buffer.alloc(32).toString('base64'),
        Buffer.alloc(12).toString('base64'),
        Buffer.alloc(16).toString('base64'),
        { kdf: 'PBKDF2-SHA256', iterations: 310000, hashLength: 32 },
      );

      expect(result).toBe('legacy');
      expect(require('react-native-quick-crypto').pbkdf2).toHaveBeenCalled();
    });
  });

  // ── App Config ──────────────────────────────────────────────

  describe('App config', () => {
    it('getAppConfigSetting returns default when no config exists', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      (SecurityModule as any).appConfig = null;
      const val = await SecurityModule.getAppConfigSetting('autoLockSeconds');
      expect(val).toBe(60);
    });

    it('setAppConfigSetting persists value', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      (SecurityModule as any).appConfig = null;
      await SecurityModule.setAppConfigSetting('darkMode', true);
      expect(RNFS.writeFile).toHaveBeenCalled();
    });

    it('getAppConfigSetting reads stored value', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ autoLockSeconds: 120 }));
      (SecurityModule as any).appConfig = null;

      const val = await SecurityModule.getAppConfigSetting('autoLockSeconds');
      expect(val).toBe(120);
    });
  });

  // ── getSyncRootSecret ───────────────────────────────────────

  describe('getSyncRootSecret', () => {
    it('derives a buffer from password and device salt', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false); // force new salt generation
      (SecurityModule as any).deviceSalt = null;
      const secret = await SecurityModule.getSyncRootSecret('my-password');
      expect(secret).toBeTruthy();
      expect(ArrayBuffer.isView(secret)).toBe(true);
      expect(secret.length).toBe(32);
    });

    it('regenerates device salt when stored salt has invalid length', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue('abcd');
      (SecurityModule as any).deviceSalt = null;

      const secret = await SecurityModule.getSyncRootSecret('my-password');

      expect(secret.length).toBe(32);
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('aegis_device_salt'),
        expect.any(String),
        'utf8',
      );
    });
  });

  describe('settings persistence', () => {
    it('getSetting stringifies primitive database values', async () => {
      SecurityModule.db = {
        executeSync: jest
          .fn()
          .mockReturnValueOnce({ rows: [{ value: 120 }] })
          .mockReturnValueOnce({ rows: [{ value: true }] }),
      } as any;

      await expect(SecurityModule.getSetting('autoLockSeconds')).resolves.toBe(
        '120',
      );
      await expect(SecurityModule.getSetting('biometricEnabled')).resolves.toBe(
        'true',
      );
    });

    it('setSetting updates app config and logs critical setting changes', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      const setAppConfigSpy = jest
        .spyOn(SecurityModule, 'setAppConfigSetting')
        .mockResolvedValue(undefined);
      const getSettingSpy = jest
        .spyOn(SecurityModule, 'getSetting')
        .mockResolvedValue('30');
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      await SecurityModule.setSetting('autoLockSeconds', '60');

      expect(setAppConfigSpy).toHaveBeenCalledWith('autoLockSeconds', 60);
      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO vault_settings (key,value) VALUES (?,?)',
        ['autoLockSeconds', '60'],
      );
      expect(logSpy).toHaveBeenCalledWith(
        'critical_setting_changed',
        'info',
        expect.objectContaining({
          key: 'autoLockSeconds',
          previous: '30',
          next: '60',
        }),
      );
    });

    it('getAllSettings merges app config and database overrides', async () => {
      const appConfigSpy = jest
        .spyOn(SecurityModule, 'getAppConfigSetting')
        .mockImplementation(async (key: string) => {
          const values: Record<string, any> = {
            autoLockSeconds: '45',
            biometricEnabled: 'true',
            darkMode: false,
          };
          return values[key];
        });
      const getSettingSpy = jest
        .spyOn(SecurityModule, 'getSetting')
        .mockImplementation(async (key: string) => {
          const values: Record<string, string | null> = {
            autoLockSeconds: '90',
            biometricEnabled: '0',
            clipboardClearSeconds: '15',
            passwordLength: '24',
            darkMode: '1',
            breachCheckEnabled: 'false',
          };
          return values[key] ?? null;
        });

      const settings = await SecurityModule.getAllSettings();

      expect(settings.autoLockSeconds).toBe(90);
      expect(settings.biometricEnabled).toBe(false);
      expect(settings.clipboardClearSeconds).toBe(15);
      expect(settings.passwordLength).toBe(24);
      expect(settings.darkMode).toBe(true);
      expect(settings.breachCheckEnabled).toBe(false);

      appConfigSpy.mockRestore();
      getSettingSpy.mockRestore();
    });
  });

  describe('brute force state recovery', () => {
    it('resets to zero state when brute force state file is malformed', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue('not-json');

      await expect(SecurityModule.getFailedAttempts()).resolves.toBe(0);
      await expect(SecurityModule.getRemainingLockout()).resolves.toBe(0);
    });
  });

  describe('SQLCipher key pragma formatting', () => {
    it('uses validated raw hex literals for rekey operations', () => {
      expect(
        (SecurityModule as any).buildSqlCipherRawKeyPragma(
          'rekey',
          'A'.repeat(64),
        ),
      ).toBe(`PRAGMA rekey = "x'${'a'.repeat(64)}'";`);
      expect(() =>
        (SecurityModule as any).buildSqlCipherRawKeyPragma(
          'rekey',
          "abc';DROP TABLE vault_items;--",
        ),
      ).toThrow('Invalid SQLCipher rekey key format');
    });
  });

  describe('password helpers', () => {
    it('generatePassword respects requested character classes', () => {
      const password = SecurityModule.generatePassword(12, {
        uppercase: false,
        lowercase: true,
        numbers: false,
        symbols: false,
      });

      expect(password).toHaveLength(12);
      expect(password).toMatch(/^[abcdefghijklmnopqrstuvwxyz]+$/);
    });

    it('generatePassword can exclude ambiguous characters explicitly', () => {
      const password = SecurityModule.generatePassword(12, {
        uppercase: false,
        lowercase: true,
        numbers: false,
        symbols: false,
        excludeAmbiguous: true,
      });

      expect(password).toHaveLength(12);
      expect(password).toMatch(/^[abcdefghijkmnopqrstuvwxyz]+$/);
    });

    it('getPasswordStrength classifies empty, medium and strong passwords', () => {
      expect(SecurityModule.getPasswordStrength('')).toEqual({
        score: 0,
        label: 'Yok',
        color: '#94a3b8',
      });
      expect(SecurityModule.getPasswordStrength('Abcdef12')).toEqual(
        expect.objectContaining({ label: 'Orta' }),
      );
      expect(SecurityModule.getPasswordStrength('Very$trongPassword123!')).toEqual(
        expect.objectContaining({ label: 'Çok Güçlü' }),
      );
    });
  });

  describe('passkey helpers', () => {
    it('normalizePasskeyRpId prefers explicit rpId and strips protocol, path and port', () => {
      expect(
        SecurityModule.normalizePasskeyRpId(
          'https://ignored.example.com',
          'https://login.example.com:443/path',
        ),
      ).toBe('login.example.com');
    });

    it('sanitizeBase64Url removes invalid characters', () => {
      expect(SecurityModule.sanitizeBase64Url('ab+/=_-cd!!')).toBe('ab_-cd');
    });

    it('generatePasskeyData builds normalized defaults', () => {
      const data = SecurityModule.generatePasskeyData({
        url: 'https://example.com/login',
        username: 'alice',
      });

      expect(data.rp_id).toBe('example.com');
      expect(data.display_name).toBe('alice');
      expect(data.transport).toBe('internal');
      expect(data.authenticator_attachment).toBe('platform');
      expect(data.algorithm).toBe('ES256');
      expect((data.credential_id || '').length).toBeGreaterThanOrEqual(16);
      expect((data.user_handle || '').length).toBeGreaterThanOrEqual(16);
    });

    it('parsePasskeyPayload rejects invalid json payloads', () => {
      const result = SecurityModule.parsePasskeyPayload('not-json');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Passkey JSON is not valid JSON.');
    });

    it('parsePasskeyPayload normalizes rpId, ids and transport', () => {
      const payload = JSON.stringify({
        rp: { id: 'https://login.example.com:443/path' },
        credentialId: 'abC-_1234567890XYZW+/=',
        userHandle: 'zyX-_1234567890QRST+/=',
        displayName: 'Alice Device',
        transports: ['USB'],
        authenticatorAttachment: 'cross-platform',
        algorithm: 'ES256',
        mode: 'rp_connected',
        server_verified: true,
        challenge_source: 'server',
      });

      const result = SecurityModule.parsePasskeyPayload(payload, {
        url: 'https://fallback.example.com',
      });

      expect(result.valid).toBe(true);
      expect(result.normalized).toEqual(
        expect.objectContaining({
          rp_id: 'login.example.com',
          credential_id: 'abC-_1234567890XYZW',
          user_handle: 'zyX-_1234567890QRST',
          display_name: 'Alice Device',
          transport: 'usb',
          authenticator_attachment: 'cross-platform',
          algorithm: 'ES256',
          mode: 'rp_connected',
          server_verified: true,
          challenge_source: 'server',
        }),
      );
    });

    it('validatePasskeyItem reports missing required fields and normalizes valid data', () => {
      const invalid = SecurityModule.validatePasskeyItem({
        title: '',
        username: '',
        url: '',
        data: '{"credential_id":"short","user_handle":"tiny"}',
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toEqual(
        expect.arrayContaining([
          'Title is required.',
          'Username is required.',
          'Website URL is required.',
        ]),
      );

      const valid = SecurityModule.validatePasskeyItem({
        title: 'Example Passkey',
        username: 'alice',
        url: 'https://example.com/login',
        data: JSON.stringify({
          credential_id: 'ABCDEFGHIJKLMNOP',
          user_handle: 'QRSTUVWXYZabcdef',
          transport: 'INTERNAL',
        }),
      });
      expect(valid.valid).toBe(true);
      expect(valid.normalized).toEqual(
        expect.objectContaining({
          rp_id: 'example.com',
          transport: 'internal',
          display_name: 'alice',
        }),
      );
    });
  });

  describe('shared space flows', () => {
    it('getSharedVaultSpaces returns empty array for invalid setting payloads', async () => {
      const getSettingSpy = jest
        .spyOn(SecurityModule, 'getSetting')
        .mockResolvedValue('{"broken":true}');

      await expect(SecurityModule.getSharedVaultSpaces()).resolves.toEqual([]);

      getSettingSpy.mockRestore();
    });

    it('saveSharedVaultSpace rejects unnamed spaces and persists normalized spaces', async () => {
      const getSpacesSpy = jest
        .spyOn(SecurityModule, 'getSharedVaultSpaces')
        .mockResolvedValue([]);
      const setSettingSpy = jest
        .spyOn(SecurityModule, 'setSetting')
        .mockResolvedValue(undefined as any);
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      await expect(
        SecurityModule.saveSharedVaultSpace({ name: '   ' } as any),
      ).resolves.toBeNull();

      const saved = await SecurityModule.saveSharedVaultSpace({
        name: ' Family Vault ',
        kind: 'family',
        members: [{ id: 'm1', name: 'Alice', email: 'a@example.com', role: 'viewer', status: 'active' }],
      } as any);

      expect(saved).toEqual(
        expect.objectContaining({
          name: 'Family Vault',
          kind: 'family',
        }),
      );
      expect(setSettingSpy).toHaveBeenCalledWith(
        'sharedVaultSpaces',
        expect.stringContaining('Family Vault'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        'shared_space_saved',
        'success',
        expect.objectContaining({ kind: 'family', members: 1 }),
      );

      getSpacesSpy.mockRestore();
      setSettingSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('deleteSharedVaultSpace removes space and strips assignments from linked items', async () => {
      const getSpacesSpy = jest
        .spyOn(SecurityModule, 'getSharedVaultSpaces')
        .mockResolvedValue([
          {
            id: 'space-1',
            name: 'Family',
            kind: 'family',
            description: '',
            defaultRole: 'viewer',
            allowExport: true,
            requireReview: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            members: [],
          },
        ] as any);
      const setSettingSpy = jest
        .spyOn(SecurityModule, 'setSetting')
        .mockResolvedValue(undefined as any);
      const getItemsSpy = jest
        .spyOn(SecurityModule, 'getItems')
        .mockResolvedValue([
          {
            id: 10,
            title: 'Shared Item',
            username: 'alice',
            password: 'pw',
            url: 'https://example.com',
            notes: '',
            category: 'login',
            favorite: 0,
            is_deleted: 0,
            data: JSON.stringify({ shared: { spaceId: 'space-1', role: 'viewer' } }),
          },
          {
            id: 11,
            title: 'Other Item',
            username: 'bob',
            password: 'pw',
            url: 'https://other.com',
            notes: '',
            category: 'login',
            favorite: 0,
            is_deleted: 0,
            data: JSON.stringify({ shared: { spaceId: 'space-2', role: 'viewer' } }),
          },
        ] as any);
      const updateItemSpy = jest
        .spyOn(SecurityModule, 'updateItem')
        .mockResolvedValue(true as any);
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      const result = await SecurityModule.deleteSharedVaultSpace('space-1');

      expect(result).toBe(true);
      expect(setSettingSpy).toHaveBeenCalledWith(
        'sharedVaultSpaces',
        expect.not.stringContaining('space-1'),
      );
      expect(updateItemSpy).toHaveBeenCalledTimes(1);
      expect(updateItemSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ data: '{}' }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        'shared_space_deleted',
        'info',
        { id: 'space-1' },
      );

      getSpacesSpy.mockRestore();
      setSettingSpy.mockRestore();
      getItemsSpy.mockRestore();
      updateItemSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('getSharingOverview reports orphaned, unreviewed and sensitive shared items', async () => {
      const getSpacesSpy = jest
        .spyOn(SecurityModule, 'getSharedVaultSpaces')
        .mockResolvedValue([
          {
            id: 'space-1',
            name: 'Family',
            kind: 'family',
            description: '',
            defaultRole: 'viewer',
            allowExport: true,
            requireReview: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            members: [],
          },
          {
            id: 'space-2',
            name: 'Team',
            kind: 'team',
            description: '',
            defaultRole: 'editor',
            allowExport: true,
            requireReview: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            members: [
              {
                id: 'pending-1',
                name: 'Pending',
                email: 'p@example.com',
                role: 'viewer',
                status: 'pending',
              },
            ],
          },
        ] as any);
      const getItemsSpy = jest
        .spyOn(SecurityModule, 'getItems')
        .mockResolvedValue([
          {
            id: 1,
            title: 'Orphaned',
            username: 'alice',
            password: 'pw',
            url: 'https://a.com',
            notes: '',
            category: 'login',
            favorite: 0,
            is_deleted: 0,
            data: JSON.stringify({ shared: { spaceId: 'missing-space', role: 'viewer' } }),
          },
          {
            id: 2,
            title: 'Needs Review',
            username: 'bob',
            password: 'pw',
            url: 'https://b.com',
            notes: '',
            category: 'login',
            favorite: 0,
            is_deleted: 0,
            data: JSON.stringify({
              shared: {
                spaceId: 'space-1',
                role: 'viewer',
                isSensitive: true,
                emergencyAccess: false,
                lastReviewedAt: '2020-01-01T00:00:00.000Z',
              },
            }),
          },
        ] as any);

      const overview = await SecurityModule.getSharingOverview();

      expect(overview.summary).toEqual(
        expect.objectContaining({
          spaces: 2,
          sharedItems: 2,
          familySpaces: 1,
          teamSpaces: 1,
          pendingMembers: 1,
          reviewRequiredItems: 1,
        }),
      );
      expect(overview.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'orphaned_space', severity: 'high' }),
          expect.objectContaining({ type: 'no_members', severity: 'high' }),
          expect.objectContaining({ type: 'review_required', severity: 'medium' }),
          expect.objectContaining({
            type: 'sensitive_without_emergency',
            severity: 'medium',
          }),
        ]),
      );
      expect(overview.actions.join(' ')).toContain('deleted spaces');
      expect(overview.actions.join(' ')).toContain('emergency access');
      expect(overview.score).toBeLessThan(100);
      expect(overview.spaces[0]).toEqual(
        expect.objectContaining({ itemCount: expect.any(Number) }),
      );

      getSpacesSpy.mockRestore();
      getItemsSpy.mockRestore();
    });
  });

  describe('item persistence flows', () => {
    it('addItem returns null when database is not open', async () => {
      SecurityModule.db = null;

      await expect(
        SecurityModule.addItem({ title: 'Missing DB' } as any),
      ).resolves.toBeNull();
    });

    it('addItem inserts normal items and triggers sync side effects', async () => {
      SecurityModule.db = {
        executeSync: jest
          .fn()
          .mockImplementationOnce(() => ({ rows: [] }))
          .mockImplementationOnce(() => ({ rows: [{ id: 99 }] })),
      } as any;
      const autofillSpy = jest
        .spyOn(SecurityModule as any, 'syncAutofill')
        .mockResolvedValue(undefined);
      const wearSpy = jest
        .spyOn(SecurityModule as any, 'triggerWearSync')
        .mockResolvedValue(undefined);
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      const id = await SecurityModule.addItem({
        title: 'GitHub',
        username: 'alice',
        password: 'secret',
        url: 'https://github.com',
        notes: 'dev',
        category: 'login',
        favorite: 1,
        data: '{}',
      });

      expect(id).toBe(99);
      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vault_items'),
        ['GitHub', 'alice', 'secret', 'https://github.com', 'dev', 'login', 1, '{}'],
      );
      expect(autofillSpy).toHaveBeenCalled();
      expect(wearSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        'item_added',
        'success',
        expect.objectContaining({ id: 99, title: 'GitHub' }),
      );
    });

    it('addItem rejects invalid passkey items before insert', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;

      const id = await SecurityModule.addItem({
        title: '',
        username: '',
        url: '',
        category: 'passkey',
        data: '{}',
      });

      expect(id).toBeNull();
      expect(SecurityModule.db.executeSync).not.toHaveBeenCalled();
    });

    it('updateItem returns false when target item does not exist', async () => {
      SecurityModule.db = {
        executeSync: jest.fn().mockReturnValue({ rows: [] }),
      } as any;

      await expect(
        SecurityModule.updateItem(55, { title: 'Missing' }),
      ).resolves.toBe(false);
    });

    it('updateItem ignores non-whitelisted field names before building SQL', async () => {
      const executeSync = jest
        .fn()
        .mockImplementationOnce(() => ({
          rows: [
            {
              id: 7,
              title: 'Existing',
              username: '',
              password: '',
              url: '',
              notes: '',
              category: 'login',
              favorite: 0,
              is_deleted: 0,
              data: '{}',
            },
          ],
        }))
        .mockImplementation(() => ({ rows: [] }));
      SecurityModule.db = { executeSync } as any;
      jest
        .spyOn(SecurityModule as any, 'syncAutofill')
        .mockResolvedValue(undefined);
      jest
        .spyOn(SecurityModule as any, 'triggerWearSync')
        .mockResolvedValue(undefined);
      jest.spyOn(SecurityModule, 'logSecurityEvent').mockResolvedValue(undefined as any);

      const result = await SecurityModule.updateItem(7, {
        title: 'Safe',
        ['title = title; DROP TABLE vault_items; --']: 'boom',
      } as any);

      expect(result).toBe(true);
      const updateCall = executeSync.mock.calls.find(call =>
        String(call[0]).startsWith('UPDATE vault_items SET'),
      );
      expect(updateCall?.[0]).toBe(
        'UPDATE vault_items SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      );
      expect(updateCall?.[1]).toEqual(['Safe', 7]);
    });

    it('updateItem updates passkey items with normalized data and history sync', async () => {
      SecurityModule.db = {
        executeSync: jest
          .fn()
          .mockImplementationOnce(() => ({
            rows: [
              {
                id: 7,
                title: 'Existing Passkey',
                username: 'alice',
                password: '',
                url: 'https://example.com',
                notes: '',
                category: 'passkey',
                favorite: 0,
                is_deleted: 0,
                data: JSON.stringify({
                  credential_id: 'ABCDEFGHIJKLMNOP',
                  user_handle: 'QRSTUVWXYZabcdef',
                }),
              },
            ],
          }))
          .mockImplementationOnce(() => ({ rows: [] })),
      } as any;
      const historySpy = jest
        .spyOn(SecurityModule as any, 'appendPasswordHistoryEntries')
        .mockResolvedValue(undefined);
      const autofillSpy = jest
        .spyOn(SecurityModule as any, 'syncAutofill')
        .mockResolvedValue(undefined);
      const wearSpy = jest
        .spyOn(SecurityModule as any, 'triggerWearSync')
        .mockResolvedValue(undefined);
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      const result = await SecurityModule.updateItem(7, {
        title: 'Updated Passkey',
        username: 'alice',
        url: 'https://example.com/login',
        category: 'passkey',
        data: JSON.stringify({
          credential_id: 'ABCDEFGHIJKLMNOP',
          user_handle: 'QRSTUVWXYZabcdef',
          transport: 'USB',
        }),
      });

      expect(result).toBe(true);
      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE vault_items SET'),
        expect.arrayContaining([
          'Updated Passkey',
          'alice',
          'https://example.com/login',
          'passkey',
          expect.stringContaining('"transport":"usb"'),
          7,
        ]),
      );
      expect(historySpy).toHaveBeenCalled();
      expect(autofillSpy).toHaveBeenCalled();
      expect(wearSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        'item_updated',
        'success',
        { id: 7 },
      );
    });

    it('deleteItem soft deletes items and triggers sync flows', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      const autofillSpy = jest
        .spyOn(SecurityModule as any, 'syncAutofill')
        .mockResolvedValue(undefined);
      const wearSpy = jest
        .spyOn(SecurityModule as any, 'triggerWearSync')
        .mockResolvedValue(undefined);

      await expect(SecurityModule.deleteItem(12)).resolves.toBe(true);

      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'UPDATE vault_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [12],
      );
      expect(autofillSpy).toHaveBeenCalled();
      expect(wearSpy).toHaveBeenCalled();
    });

    it('restoreItem clears deletion markers and syncs autofill', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      const autofillSpy = jest
        .spyOn(SecurityModule as any, 'syncAutofill')
        .mockResolvedValue(undefined);

      await expect(SecurityModule.restoreItem(12)).resolves.toBe(true);

      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'UPDATE vault_items SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
        [12],
      );
      expect(autofillSpy).toHaveBeenCalled();
    });

    it('permanentlyDeleteItem removes attachments, history and item rows', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;

      await expect(SecurityModule.permanentlyDeleteItem(7)).resolves.toBe(true);

      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        1,
        'DELETE FROM vault_attachments WHERE item_id = ?',
        [7],
      );
      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM vault_password_history WHERE item_id = ?',
        [7],
      );
      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        3,
        'DELETE FROM vault_items WHERE id = ?',
        [7],
      );
    });

    it('emptyTrash removes deleted items and related data', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;

      await expect(SecurityModule.emptyTrash()).resolves.toBe(true);

      expect(SecurityModule.db.executeSync).toHaveBeenCalledTimes(3);
      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'DELETE FROM vault_items WHERE is_deleted = 1',
      );
    });

    it('resetVault clears vault tables and syncs autofill', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      const autofillSpy = jest
        .spyOn(SecurityModule as any, 'syncAutofill')
        .mockResolvedValue(undefined);

      await expect(SecurityModule.resetVault()).resolves.toBe(true);

      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        1,
        'DELETE FROM vault_attachments',
      );
      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM vault_password_history',
      );
      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        3,
        'DELETE FROM vault_items',
      );
      expect(autofillSpy).toHaveBeenCalled();
    });

    it('toggleFavorite flips favorite value via updateItem', async () => {
      const updateSpy = jest
        .spyOn(SecurityModule, 'updateItem')
        .mockResolvedValue(true);

      await expect(SecurityModule.toggleFavorite(4, 1)).resolves.toBe(true);
      await expect(SecurityModule.toggleFavorite(5, 0)).resolves.toBe(true);

      expect(updateSpy).toHaveBeenNthCalledWith(1, 4, { favorite: 0 });
      expect(updateSpy).toHaveBeenNthCalledWith(2, 5, { favorite: 1 });
    });

    it('getItemCount returns database count and falls back to zero on error', async () => {
      SecurityModule.db = {
        executeSync: jest
          .fn()
          .mockReturnValueOnce({ rows: [{ c: 42 }] })
          .mockImplementationOnce(() => {
            throw new Error('count failed');
          }),
      } as any;

      await expect(SecurityModule.getItemCount()).resolves.toBe(42);
      await expect(SecurityModule.getItemCount()).resolves.toBe(0);
    });
  });

  describe('attachments and reset flows', () => {
    it('addAttachment stores file content from a normal path', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 512 });
      (RNFS.readFile as jest.Mock).mockResolvedValue('dGVzdA==');

      await expect(
        SecurityModule.addAttachment(
          9,
          'notes.txt',
          'text/plain',
          '/doc/notes.txt',
        ),
      ).resolves.toBe(true);

      expect(RNFS.stat).toHaveBeenCalledWith('/doc/notes.txt');
      expect(RNFS.readFile).toHaveBeenCalledWith('/doc/notes.txt', 'base64');
      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [9, 'notes.txt', 'text/plain', 512, 'dGVzdA=='],
      );
    });

    it('addAttachment handles content URIs via temp copy and cleanup', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 2048 });
      (RNFS.readFile as jest.Mock).mockResolvedValue('Y29udGVudA==');

      await expect(
        SecurityModule.addAttachment(
          4,
          'photo.png',
          'image/png',
          'content://media/photo.png',
        ),
      ).resolves.toBe(true);

      expect(RNFS.copyFile).toHaveBeenCalledWith(
        'content://media/photo.png',
        expect.stringContaining('/cache/aegis_temp_'),
      );
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/cache/aegis_temp_'),
      );
    });

    it('addAttachment rejects oversized files', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 51 * 1024 * 1024 });

      await expect(
        SecurityModule.addAttachment(2, 'big.bin', 'application/octet-stream', '/doc/big.bin'),
      ).resolves.toBe(false);

      expect(SecurityModule.db.executeSync).not.toHaveBeenCalled();
    });

    it('addAttachment falls back to direct base64 read when primary read fails', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;
      (RNFS.stat as jest.Mock).mockRejectedValue(new Error('stat failed'));
      (RNFS.readFile as jest.Mock).mockResolvedValue('ZmFsbGJhY2s=');

      await expect(
        SecurityModule.addAttachment(3, 'fallback.txt', 'text/plain', '/doc/fallback.txt'),
      ).resolves.toBe(true);

      expect(RNFS.readFile).toHaveBeenCalledWith('/doc/fallback.txt', 'base64');
      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [3, 'fallback.txt', 'text/plain', expect.any(Number), 'ZmFsbGJhY2s='],
      );
    });

    it('addAttachmentFromBase64 stores provided data directly', async () => {
      SecurityModule.db = { executeSync: jest.fn() } as any;

      await expect(
        SecurityModule.addAttachmentFromBase64(
          6,
          'avatar.jpg',
          'image/jpeg',
          'YmFzZTY0',
          6,
        ),
      ).resolves.toBe(true);

      expect(SecurityModule.db.executeSync).toHaveBeenCalledWith(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [6, 'avatar.jpg', 'image/jpeg', 6, 'YmFzZTY0'],
      );
    });

    it('readFileToBase64 returns copied content for content URIs and cleans temp file', async () => {
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 100 });
      (RNFS.readFile as jest.Mock).mockResolvedValue('dGVtcA==');

      const result = await SecurityModule.readFileToBase64(
        'content://provider/doc.pdf',
        'doc.pdf',
      );

      expect(result).toEqual({ base64: 'dGVtcA==', size: 100 });
      expect(RNFS.copyFile).toHaveBeenCalled();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/cache/aegis_read_'),
      );
    });

    it('getAttachments and deleteAttachment operate on attachment rows', async () => {
      SecurityModule.db = {
        executeSync: jest
          .fn()
          .mockReturnValueOnce({
            rows: [
              {
                id: 1,
                item_id: 8,
                filename: 'doc.pdf',
                mime_type: 'application/pdf',
                size: 128,
                created_at: '2026-04-15T00:00:00.000Z',
              },
            ],
          })
          .mockReturnValueOnce({ rows: [] }),
      } as any;

      await expect(SecurityModule.getAttachments(8)).resolves.toEqual([
        expect.objectContaining({ id: 1, filename: 'doc.pdf' }),
      ]);
      await expect(SecurityModule.deleteAttachment(1)).resolves.toBe(true);
      expect(SecurityModule.db.executeSync).toHaveBeenNthCalledWith(
        2,
        'DELETE FROM vault_attachments WHERE id=?',
        [1],
      );
    });

    it('downloadAttachment saves to the first available directory', async () => {
      SecurityModule.db = {
        executeSync: jest.fn().mockReturnValue({
          rows: [{ filename: 'report?.txt', file_data: 'cmVwb3J0' }],
        }),
      } as any;
      (RNFS.exists as jest.Mock).mockImplementation(async (path: string) => {
        if (path === '/downloads') return false;
        if (path === '/external') return true;
        if (path === '/external/report_.txt') return false;
        return true;
      });

      await expect(SecurityModule.downloadAttachment(77)).resolves.toBe(
        '/external/report_.txt',
      );
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        '/external/report_.txt',
        'cmVwb3J0',
        'base64',
      );
    });

    it('factoryReset clears local files and logs success', async () => {
      const lockSpy = jest
        .spyOn(SecurityModule as any, 'lockVault')
        .mockImplementation(() => {});
      const resetBiometricSpy = jest
        .spyOn(SecurityModule as any, 'resetBiometricKeys')
        .mockResolvedValue(undefined);
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      await expect(SecurityModule.factoryReset()).resolves.toBe(true);

      expect(lockSpy).toHaveBeenCalled();
      expect(resetBiometricSpy).toHaveBeenCalled();
      expect(RNFS.unlink).toHaveBeenCalledWith('/doc/aegis_android_vault.sqlite');
      expect(logSpy).toHaveBeenCalledWith('factory_reset', 'success', {});
    });

    it('panicWipe delegates to factoryReset and logs success', async () => {
      const lockSpy = jest
        .spyOn(SecurityModule as any, 'lockVault')
        .mockImplementation(() => {});
      const factorySpy = jest
        .spyOn(SecurityModule, 'factoryReset')
        .mockResolvedValue(true);
      const logSpy = jest
        .spyOn(SecurityModule, 'logSecurityEvent')
        .mockResolvedValue(undefined as any);

      await expect(SecurityModule.panicWipe()).resolves.toBe(true);

      expect(lockSpy).toHaveBeenCalled();
      expect(factorySpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('panic_wipe', 'success', {});
    });
  });
});
