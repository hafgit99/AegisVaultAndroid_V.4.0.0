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
});
