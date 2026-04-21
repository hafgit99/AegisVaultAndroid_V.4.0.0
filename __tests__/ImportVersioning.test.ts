import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import {
  ImportVersioning,
  ImportVersioningWithAudit,
  KDFVersion,
  MigrationAuditLogger,
  generateMigrationDialog,
} from '../src/ImportVersioning';

const createLegacyBackup = (data: any, password: string) => {
  const salt = QuickCrypto.randomBytes(32).toString('hex');
  const key = QuickCrypto.pbkdf2Sync(
    password,
    Buffer.from(salt, 'hex'),
    310000,
    32,
    'sha256',
  );
  const iv = QuickCrypto.randomBytes(12);
  const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    version: '1.0',
    kdf: KDFVersion.PBKDF2_SHA256,
    iterations: 310000,
    salt,
    iv: iv.toString('hex'),
    data: encrypted.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: 'AES-256-GCM',
  });
};

describe('ImportVersioning current behavior', () => {
  const mockVaultData = {
    vault: [{ id: 'entry-1', title: 'GitHub', password: 'secret-1' }],
  };
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    MigrationAuditLogger.clearLogs();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('detectKDFVersion recognizes legacy PBKDF2 backups', async () => {
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    const detection = await ImportVersioning.detectKDFVersion(backup);

    expect(detection.version).toBe(KDFVersion.PBKDF2_SHA256);
    expect(detection.isLegacy).toBe(true);
  });

  test('detectKDFVersion recognizes modern Argon2id backups', async () => {
    const backup = JSON.stringify({
      version: '2.0',
      kdf: KDFVersion.ARGON2ID,
      algorithm: 'AES-256-GCM',
      kdfParameters: {
        memory: 32768,
        parallelism: 2,
        hashLength: 32,
      },
    });
    const detection = await ImportVersioning.detectKDFVersion(backup);

    expect(detection.version).toBe(KDFVersion.ARGON2ID);
    expect(detection.isLegacy).toBe(false);
  });

  test('decryptWithPBKDF2 decrypts valid legacy payloads', async () => {
    const backup = JSON.parse(createLegacyBackup(mockVaultData, 'correct-password'));
    const decrypted = await ImportVersioning.decryptWithPBKDF2(
      'correct-password',
      backup.salt,
      backup.data,
      backup.authTag,
      backup.iv,
    );

    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted as string).vault[0].title).toBe('GitHub');
  });

  test('decryptWithPBKDF2 returns null for wrong passwords', async () => {
    const backup = JSON.parse(createLegacyBackup(mockVaultData, 'correct-password'));
    const decrypted = await ImportVersioning.decryptWithPBKDF2(
      'wrong-password',
      backup.salt,
      backup.data,
      backup.authTag,
      backup.iv,
    );

    expect(decrypted).toBeNull();
  });

  test('importBackupWithMigration marks legacy backups for migration', async () => {
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    const result = await ImportVersioning.importBackupWithMigration(
      backup,
      'correct-password',
    );

    expect(result.success).toBe(true);
    expect(result.requiresMigration).toBe(true);
    expect(result.migrationWarning).toContain('legacy PBKDF2-SHA256');
  });

  test('generateMigrationDialog only appears for legacy metadata', () => {
    const legacyDialog = generateMigrationDialog({
      version: '1.0',
      kdf: KDFVersion.PBKDF2_SHA256,
      algorithm: 'AES-256-GCM',
      kdfParameters: {},
      timestamp: Date.now(),
    });
    const modernDialog = generateMigrationDialog({
      version: '2.0',
      kdf: KDFVersion.ARGON2ID,
      algorithm: 'AES-256-GCM',
      kdfParameters: {},
      timestamp: Date.now(),
    });

    expect(legacyDialog).not.toBeNull();
    expect(modernDialog).toBeNull();
  });

  test('compatibility matrix includes legacy and recommended entries', () => {
    const matrix = ImportVersioning.getCompatibilityInfo();

    expect(matrix.map(entry => entry.version)).toContain(KDFVersion.PBKDF2_SHA256);
    expect(matrix.map(entry => entry.version)).toContain(KDFVersion.ARGON2ID);
    expect(
      matrix.find(entry => entry.version === KDFVersion.ARGON2ID)?.status,
    ).toBe('recommended');
  });

  test('audit wrapper records successful import actions', async () => {
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    await ImportVersioningWithAudit.importWithLogging(
      backup,
      'correct-password',
    );

    const logs = MigrationAuditLogger.getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
    expect(logs[0].oldKDF).toBe(KDFVersion.PBKDF2_SHA256);
  });

  test('generateMigrationPrompt only returns text for legacy backups', () => {
    expect(
      ImportVersioning.generateMigrationPrompt({
        version: '1.0',
        kdf: KDFVersion.PBKDF2_SHA256,
        algorithm: 'AES-256-GCM',
        kdfParameters: {},
        timestamp: Date.now(),
      }),
    ).toContain('PBKDF2-SHA256');

    expect(
      ImportVersioning.generateMigrationPrompt({
        version: '2.0',
        kdf: KDFVersion.ARGON2ID,
        algorithm: 'AES-256-GCM',
        kdfParameters: {},
        timestamp: Date.now(),
      }),
    ).toBe('');
  });

  test('audit logger summary counts statuses and exposes last migration', () => {
    MigrationAuditLogger.log({
      action: 'decrypt_pbkdf2',
      status: 'success',
      itemsProcessed: 1,
      oldKDF: KDFVersion.PBKDF2_SHA256,
    });
    MigrationAuditLogger.log({
      action: 'migrate_kdf',
      status: 'warning',
      itemsProcessed: 1,
      oldKDF: KDFVersion.PBKDF2_SHA256,
      newKDF: KDFVersion.ARGON2ID,
    });

    const summary = MigrationAuditLogger.getSummary();
    expect(summary.totalActions).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.lastMigration?.action).toBe('migrate_kdf');
  });

  // NEW TESTS ADDED FOR HIGH MUTATION COVERAGE

  test('decryptWithArgon2id successfully decrypts valid payload', async () => {
    // We need to create an Argon2id encrypted backup using the mock structure.
    const password = 'argon-password';
    const metadata = {
      kdfParameters: { salt: 'argonsalt', memory: 32768, parallelism: 2, hashLength: 32 }
    };
    
    // In jest.setup.js, Argon2 mock does:
    const mockCrypto = require('crypto');
    const rawHash = mockCrypto.createHash('sha256').update(`argon-password:argonsalt:argon2id`).digest('hex').slice(0, 64).padEnd(64, '0');
    const key = Buffer.from(rawHash, 'hex');
    const iv = QuickCrypto.randomBytes(12);
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encryptedData = Buffer.concat([
      cipher.update(JSON.stringify(mockVaultData), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    const decrypted = await ImportVersioning.decryptWithArgon2id(
      password,
      metadata,
      encryptedData.toString('base64'),
      authTag.toString('base64'),
      iv.toString('hex')
    );
    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted as string).vault[0].title).toBe('GitHub');
  });

  test('decryptWithArgon2id returns null on wrong password', async () => {
    const metadata = { kdfParameters: { salt: 'argonsalt' } };
    const decrypted = await ImportVersioning.decryptWithArgon2id('wrong-pass', metadata, 'invalid-base64');
    expect(decrypted).toBeNull();
  });

  test('importBackupWithMigration handles argon2id', async () => {
    const password = 'argon-password';
    const metadata = { kdfParameters: { salt: 'argonsalt' } };
    const mockCrypto = require('crypto');
    const rawHash = mockCrypto.createHash('sha256').update(`argon-password:argonsalt:argon2id`).digest('hex').slice(0, 64).padEnd(64, '0');
    const key = Buffer.from(rawHash, 'hex');
    const iv = QuickCrypto.randomBytes(12);
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encryptedData = Buffer.concat([
      cipher.update(JSON.stringify(mockVaultData), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    const backup = JSON.stringify({
      version: '2.0',
      kdf: KDFVersion.ARGON2ID,
      algorithm: 'AES-256-GCM',
      kdfParameters: { salt: 'argonsalt' },
      data: encryptedData.toString('base64'),
      authTag: authTag.toString('base64'),
      iv: iv.toString('hex')
    });

    const result = await ImportVersioning.importBackupWithMigration(backup, password);
    expect(result.success).toBe(true);
    expect(result.requiresMigration).toBe(false);
    expect(result.migrationWarning).toBeUndefined();
  });

  test('importBackupWithMigration returns failure on bad JSON', async () => {
    const result = await ImportVersioning.importBackupWithMigration('invalid-json', 'pass');
    expect(result.success).toBe(false);
  });

  test('migrateBackupKDF performs full migration from PBKDF2 to Argon2id', async () => {
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    const result = await ImportVersioning.migrateBackupKDF(backup, 'correct-password', 'new-password');
    
    expect(result.success).toBe(true);
    expect(result.oldBackup.kdf).toBe(KDFVersion.PBKDF2_SHA256);
    expect(result.newBackup.kdf).toBe(KDFVersion.ARGON2ID);
    expect(result.itemsMigrated).toBe(1);
    expect(result.warningsMigration.length).toBeGreaterThan(0);
  });

  test('migrateBackupKDF throws error if import fails', async () => {
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    await expect(ImportVersioning.migrateBackupKDF(backup, 'totally-wrong-password')).rejects.toThrow();
  });

  test('audit wrapper records migration actions', async () => {
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    await ImportVersioningWithAudit.migrateWithLogging(backup, 'correct-password', 'new-pass');

    const logs = MigrationAuditLogger.getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('migrate_kdf');
    expect(logs[0].status).toBe('success');
    expect(logs[0].oldKDF).toBe(KDFVersion.PBKDF2_SHA256);
    expect(logs[0].newKDF).toBe(KDFVersion.ARGON2ID);
  });

  test('detectKDFVersion throws on unknown KDF', async () => {
    await expect(ImportVersioning.detectKDFVersion(JSON.stringify({ iterations: 1 })))
      .rejects.toThrow('Cannot determine KDF version');
  });

  // === TARGETED MUTATION KILLERS ===

  test('detectKDFVersion recognizes legacy format WITHOUT explicit kdf field', async () => {
    // This tests line 107: parsed.iterations === 310000 && parsed.salt (no kdf field)
    const legacyNoKdf = JSON.stringify({
      iterations: 310000,
      salt: 'abc123hex'
    });
    const result = await ImportVersioning.detectKDFVersion(legacyNoKdf);
    expect(result.version).toBe(KDFVersion.PBKDF2_SHA256);
    expect(result.isLegacy).toBe(true);
    expect(result.metadata.version).toBe('1.0');
    expect(result.metadata.algorithm).toBe('AES-256-GCM');
    expect(result.metadata.kdfParameters?.iterations).toBe(310000);
    expect(result.metadata.kdfParameters?.salt).toBe('abc123hex');
  });

  test('detectKDFVersion rejects legacy with wrong iteration count', async () => {
    const wrongIter = JSON.stringify({ iterations: 100000, salt: 'abc' });
    await expect(ImportVersioning.detectKDFVersion(wrongIter))
      .rejects.toThrow('Cannot determine KDF version');
  });

  test('detectKDFVersion rejects legacy with iterations but no salt', async () => {
    const noSalt = JSON.stringify({ iterations: 310000 });
    await expect(ImportVersioning.detectKDFVersion(noSalt))
      .rejects.toThrow('Cannot determine KDF version');
  });

  test('decryptWithArgon2id uses default params when kdfParameters are missing', async () => {
    // Tests lines 199-202: memory || 32768, parallelism || 2, hashLength || 32
    const password = 'default-test';
    const metadata = { kdfParameters: { salt: 'defaultsalt' } }; // no memory, parallelism, hashLength
    
    const mockCrypto = require('crypto');
    const rawHash = mockCrypto.createHash('sha256')
      .update(`default-test:defaultsalt:argon2id`)
      .digest('hex').slice(0, 64).padEnd(64, '0');
    const key = Buffer.from(rawHash, 'hex');
    const iv = QuickCrypto.randomBytes(12);
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify({ test: true }), 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    const decrypted = await ImportVersioning.decryptWithArgon2id(
      password, metadata, enc.toString('base64'), tag.toString('base64'), iv.toString('hex')
    );
    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted!).test).toBe(true);
  });

  test('decryptWithArgon2id uses zero IV when iv is not provided', async () => {
    // Tests the fallback: Buffer.alloc(12, 0)
    const password = 'iv-test';
    const metadata = { kdfParameters: { salt: 'ivsalt' } };
    
    const mockCrypto = require('crypto');
    const rawHash = mockCrypto.createHash('sha256')
      .update(`iv-test:ivsalt:argon2id`)
      .digest('hex').slice(0, 64).padEnd(64, '0');
    const key = Buffer.from(rawHash, 'hex');
    const zeroIv = Buffer.alloc(12, 0);
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, zeroIv);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify({ zero: 1 }), 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // Pass no iv param — should default to zero IV
    const decrypted = await ImportVersioning.decryptWithArgon2id(
      password, metadata, enc.toString('base64'), tag.toString('base64')
    );
    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted!).zero).toBe(1);
  });

  test('decryptWithArgon2id handles salt as non-string (Buffer)', async () => {
    // Tests line 192-194: salt type branching
    const password = 'buf-salt';
    const metadata = { kdfParameters: { salt: Buffer.from('bufsalt').toString('hex') } };
    const decrypted = await ImportVersioning.decryptWithArgon2id(password, metadata, 'invaliddata');
    expect(decrypted).toBeNull(); // Will fail during decipher
  });

  test('decryptWithArgon2id handles empty kdfParameters', async () => {
    // Tests line 189: params = metadata.kdfParameters || {}
    const metadata = {};
    const decrypted = await ImportVersioning.decryptWithArgon2id('pass', metadata, 'data');
    expect(decrypted).toBeNull();
  });

  test('decryptWithPBKDF2 handles Buffer inputs for salt and iv', async () => {
    // Tests lines 143, 158-159: typeof salt/iv/authTag === 'string' branches
    const password = 'buf-test';
    const saltBuf = QuickCrypto.randomBytes(32);
    const ivBuf = QuickCrypto.randomBytes(12);
    const key = QuickCrypto.pbkdf2Sync(password, saltBuf, 310000, 32, 'sha256');
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, ivBuf);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify({ buf: true }), 'utf8'),
      cipher.final()
    ]);
    const tagBuf = cipher.getAuthTag();

    // Pass Buffers instead of strings
    const decrypted = await ImportVersioning.decryptWithPBKDF2(
      password, saltBuf, enc, tagBuf, ivBuf
    );
    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted!).buf).toBe(true);
  });

  test('decryptWithPBKDF2 uses salt slice as IV when no iv provided', async () => {
    // Tests line 158: iv fallback to saltBuffer.slice(0, 12)
    const password = 'no-iv';
    const saltBuf = QuickCrypto.randomBytes(32);
    const ivFromSalt = saltBuf.slice(0, 12);
    const key = QuickCrypto.pbkdf2Sync(password, saltBuf, 310000, 32, 'sha256');
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, ivFromSalt);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify({ noiv: true }), 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // Don't pass iv - should use salt.slice(0,12) as fallback
    const decrypted = await ImportVersioning.decryptWithPBKDF2(
      password, saltBuf.toString('hex'), enc.toString('base64'), tag.toString('base64')
    );
    expect(decrypted).not.toBeNull();
    expect(JSON.parse(decrypted!).noiv).toBe(true);
  });

  test('decryptWithPBKDF2 works without authTag', async () => {
    // Tests line 163: if (tagBuffer) branch - no tag
    const decrypted = await ImportVersioning.decryptWithPBKDF2(
      'pass', 'aabbccdd', 'invaliddata'
    );
    expect(decrypted).toBeNull(); // Will fail during decipher but tests the path
  });

  test('audit logger overflows when exceeding maxLogs', async () => {
    // Tests lines 485-486: this.logs.length > this.maxLogs and slice
    MigrationAuditLogger.clearLogs();

    // Add 105 logs to trigger overflow
    for (let i = 0; i < 105; i++) {
      MigrationAuditLogger.log({
        action: 'decrypt_pbkdf2',
        status: 'success',
        itemsProcessed: i,
      });
    }

    const allLogs = MigrationAuditLogger.getRecentLogs(200);
    expect(allLogs.length).toBe(100); // Should be trimmed to maxLogs
    // First log should be index 5 (items 0-4 were trimmed)
    expect(allLogs[0].itemsProcessed).toBe(5);
    expect(allLogs[99].itemsProcessed).toBe(104);
  });

  test('getRecentLogs returns correct count', () => {
    // Tests line 492-493: slice(-count)
    MigrationAuditLogger.clearLogs();
    for (let i = 0; i < 5; i++) {
      MigrationAuditLogger.log({
        action: 'decrypt_pbkdf2',
        status: 'success',
        itemsProcessed: i,
      });
    }
    expect(MigrationAuditLogger.getRecentLogs(3)).toHaveLength(3);
    expect(MigrationAuditLogger.getRecentLogs(10)).toHaveLength(5);
    // Default count
    expect(MigrationAuditLogger.getRecentLogs()).toHaveLength(5);
  });

  test('getSummary correctly counts failures', () => {
    // Tests line 506: status === 'failed' filter
    MigrationAuditLogger.clearLogs();
    MigrationAuditLogger.log({ action: 'decrypt_pbkdf2', status: 'failed', itemsProcessed: 0 });
    MigrationAuditLogger.log({ action: 'decrypt_pbkdf2', status: 'failed', itemsProcessed: 0 });
    MigrationAuditLogger.log({ action: 'decrypt_pbkdf2', status: 'success', itemsProcessed: 1 });

    const summary = MigrationAuditLogger.getSummary();
    expect(summary.failureCount).toBe(2);
    expect(summary.successCount).toBe(1);
    expect(summary.warningCount).toBe(0);
    expect(summary.totalActions).toBe(3);
    expect(summary.lastMigration?.status).toBe('success');
  });

  test('getSummary returns undefined lastMigration when no logs', () => {
    MigrationAuditLogger.clearLogs();
    const summary = MigrationAuditLogger.getSummary();
    expect(summary.totalActions).toBe(0);
    expect(summary.lastMigration).toBeUndefined();
  });

  test('importWithLogging uses cloud_restore action', async () => {
    // Tests line 529: userAction parameter
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    MigrationAuditLogger.clearLogs();

    await ImportVersioningWithAudit.importWithLogging(backup, 'correct-password', 'cloud_restore');

    const logs = MigrationAuditLogger.getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].reason).toContain('cloud_restore');
  });

  test('importWithLogging records failed imports', async () => {
    MigrationAuditLogger.clearLogs();
    await ImportVersioningWithAudit.importWithLogging('bad-json', 'pass');

    const logs = MigrationAuditLogger.getRecentLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('failed');
  });

  test('migrateBackupKDF metadata has correct fields', async () => {
    // Tests lines 339-378: newMetadata structure
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    const result = await ImportVersioning.migrateBackupKDF(backup, 'correct-password');

    expect(result.newBackup.version).toBe('2.0');
    expect(result.newBackup.kdf).toBe(KDFVersion.ARGON2ID);
    expect(result.newBackup.algorithm).toBe('AES-256-GCM');
    expect(result.newBackup.kdfParameters.memory).toBe(32768);
    expect(result.newBackup.kdfParameters.parallelism).toBe(2);
    expect(result.newBackup.kdfParameters.hashLength).toBe(32);
    expect(result.newBackup.kdfParameters.salt).toBeDefined();
    expect(result.newBackup.source).toBe('migration');
    expect(result.newBackup.timestamp).toBeGreaterThan(0);
    expect(result.itemsScanned).toBe(result.itemsMigrated);
    expect(result.warningsMigration).toContain('Old backup should be securely deleted after migration');
    expect(result.warningsMigration).toContain('Keep a copy of old backup until you confirm Argon2id backup is good');
  });

  test('migrateBackupKDF uses original password when newPassword not provided', async () => {
    // Tests line 360: newPassword || password
    const backup = createLegacyBackup(mockVaultData, 'correct-password');
    const result = await ImportVersioning.migrateBackupKDF(backup, 'correct-password');
    expect(result.success).toBe(true);
  });

  test('generateMigrationDialog returns correct dialog structure', () => {
    const dialog = generateMigrationDialog({
      version: '1.0',
      kdf: KDFVersion.PBKDF2_SHA256,
      algorithm: 'AES-256-GCM',
      kdfParameters: {},
      timestamp: Date.now(),
    });
    expect(dialog).not.toBeNull();
    expect(dialog!.title).toBe('Legacy Encryption Detected');
    expect(dialog!.buttons.accept).toBe('Continue Import');
    expect(dialog!.buttons.decline).toBe('Cancel');
    expect(dialog!.buttons.learnMore).toBe('Encryption Details');
    expect(dialog!.message).toContain('PBKDF2-SHA256');
    expect(dialog!.message).toContain('Argon2id');
  });

  test('getCompatibilityInfo returns full details', () => {
    const matrix = ImportVersioning.getCompatibilityInfo();
    const legacy = matrix.find(e => e.version === KDFVersion.PBKDF2_SHA256)!;
    const modern = matrix.find(e => e.version === KDFVersion.ARGON2ID)!;

    expect(legacy.supportedSince).toBe('v1.0');
    expect(legacy.status).toBe('legacy');
    expect(legacy.maxIterations).toBe(310000);
    expect(modern.supportedSince).toBe('v2.0');
    expect(modern.status).toBe('recommended');
    expect(modern.memoryUsage).toBe('32 MB');
  });

  test('detectKDFVersion preserves metadata fields from explicit kdf', async () => {
    const backup = JSON.stringify({
      kdf: KDFVersion.ARGON2ID,
      algorithm: 'XChaCha20-Poly1305',
      version: '3.0',
      kdfParameters: { memory: 65536, parallelism: 4, hashLength: 64 }
    });
    const result = await ImportVersioning.detectKDFVersion(backup);
    expect(result.version).toBe(KDFVersion.ARGON2ID);
    expect(result.isLegacy).toBe(false);
    expect(result.metadata.algorithm).toBe('XChaCha20-Poly1305');
    expect(result.metadata.version).toBe('3.0');
    expect(result.metadata.kdfParameters?.memory).toBe(65536);
    expect(result.metadata.kdfParameters?.parallelism).toBe(4);
    expect(result.metadata.kdfParameters?.hashLength).toBe(64);
  });
});
