import RNFS from 'react-native-fs';
import { RecoveryModule } from '../src/RecoveryModule';
import { BackupModule } from '../src/BackupModule';
import { SecurityModule } from '../src/SecurityModule';

jest.mock('../src/BackupModule', () => ({
  BackupModule: {
    exportEncrypted: jest.fn(),
    importEncryptedAegis: jest.fn(),
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    resetBiometricKeys: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('RecoveryModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.readFile as jest.Mock).mockResolvedValue('');
  });

  test('initiateRecovery rejects invalid email and logs failure reason', async () => {
    const session = await RecoveryModule.initiateRecovery('invalid-email');

    expect(session).toBeNull();
    expect(RNFS.writeFile).not.toHaveBeenCalled();
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'recovery_initiate_failed',
      'success',
      expect.objectContaining({ reason: 'invalid_email' }),
    );
  });

  test('initiateRecovery no longer logs verification code', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const session = await RecoveryModule.initiateRecovery('user@example.com');

    expect(session).not.toBeNull();
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Verification code sent'),
    );
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/recovery_sessions/'),
      expect.any(String),
      'utf8',
    );

    consoleSpy.mockRestore();
  });

  test('createRecoveryBackup copies exported aegis file instead of serializing a path', async () => {
    (BackupModule.exportEncrypted as jest.Mock).mockResolvedValue(
      '/mock/documents/tmp-export.aegis',
    );

    const ok = await RecoveryModule.createRecoveryBackup(
      [],
      'user@example.com',
      'backup-password',
    );

    expect(ok).toBe(true);
    expect(RNFS.copyFile).toHaveBeenCalledWith(
      '/mock/documents/tmp-export.aegis',
      expect.stringContaining('/recovery_backups/'),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/tmp-export.aegis');
  });

  test('restoreFromRecovery passes backup path to importEncryptedAegis', async () => {
    const session = {
      sessionId: 'session-1',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      verificationCode: '',
      recoveryToken: 'token-1',
      vaultBackupPath: '/mock/documents/recovery_backups/file.aegis',
      status: 'code_verified',
      userEmail: 'user@example.com',
    };

    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      path === '/mock/documents/recovery_sessions/session-1.json' ||
      path === '/mock/documents/recovery_backups/file.aegis',
    );
    (RNFS.readFile as jest.Mock).mockImplementation(async path => {
      if (path === '/mock/documents/recovery_sessions/session-1.json') {
        return JSON.stringify(session);
      }
      return '';
    });
    (BackupModule.importEncryptedAegis as jest.Mock).mockResolvedValue({
      imported: 2,
      skipped: 0,
      total: 2,
      errors: [],
      source: 'aegis_vault',
    });

    const restored = await RecoveryModule.restoreFromRecovery(
      'session-1',
      'token-1',
      'backup-password',
    );

    expect(restored).toBe(true);
    expect(BackupModule.importEncryptedAegis).toHaveBeenCalledWith(
      '/mock/documents/recovery_backups/file.aegis',
      'backup-password',
    );
    expect(SecurityModule.resetBiometricKeys).toHaveBeenCalled();
  });

  test('verifyRecoveryCode upgrades session to token-based step and clears code', async () => {
    const originalSession = {
      sessionId: 'session-verify',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      verificationCode: '123456',
      status: 'initiated',
      userEmail: 'user@example.com',
    };

    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      path === '/mock/documents/recovery_sessions/session-verify.json',
    );
    (RNFS.readFile as jest.Mock).mockImplementation(async path => {
      if (path === '/mock/documents/recovery_sessions/session-verify.json') {
        return JSON.stringify(originalSession);
      }
      return '';
    });

    const recoveryToken = await RecoveryModule.verifyRecoveryCode(
      'session-verify',
      '123456',
    );

    expect(recoveryToken).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      '/mock/documents/recovery_sessions/session-verify.json',
      expect.any(String),
      'utf8',
    );
    const [, savedSessionRaw] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    const savedSession = JSON.parse(savedSessionRaw);
    expect(savedSession.status).toBe('code_verified');
    expect(savedSession.verificationCode).toBe('');
    expect(savedSession.recoveryToken).toBe(recoveryToken);
  });

  test('verifyRecoveryCode rejects expired codes and marks session expired', async () => {
    const expiredSession = {
      sessionId: 'session-expired',
      createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      verificationCode: '654321',
      status: 'initiated',
      userEmail: 'user@example.com',
    };

    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      path === '/mock/documents/recovery_sessions/session-expired.json',
    );
    (RNFS.readFile as jest.Mock).mockImplementation(async path => {
      if (path === '/mock/documents/recovery_sessions/session-expired.json') {
        return JSON.stringify(expiredSession);
      }
      return '';
    });

    const token = await RecoveryModule.verifyRecoveryCode(
      'session-expired',
      '654321',
    );

    expect(token).toBeNull();
    const [, savedSessionRaw] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(savedSessionRaw).status).toBe('expired');
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'recovery_verify_code_failed',
      'success',
      expect.objectContaining({ reason: 'code_expired' }),
    );
  });

  test('restoreFromRecovery refuses invalid token before touching backup import', async () => {
    const session = {
      sessionId: 'session-invalid-token',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      verificationCode: '',
      recoveryToken: 'token-expected',
      vaultBackupPath: '/mock/documents/recovery_backups/file.aegis',
      status: 'code_verified',
      userEmail: 'user@example.com',
    };

    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      path === '/mock/documents/recovery_sessions/session-invalid-token.json',
    );
    (RNFS.readFile as jest.Mock).mockImplementation(async path => {
      if (path === '/mock/documents/recovery_sessions/session-invalid-token.json') {
        return JSON.stringify(session);
      }
      return '';
    });

    const restored = await RecoveryModule.restoreFromRecovery(
      'session-invalid-token',
      'wrong-token',
      'backup-password',
    );

    expect(restored).toBe(false);
    expect(BackupModule.importEncryptedAegis).not.toHaveBeenCalled();
    expect(SecurityModule.resetBiometricKeys).not.toHaveBeenCalled();
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'recovery_restore_failed',
      'success',
      expect.objectContaining({ reason: 'invalid_token' }),
    );
  });

  test('restoreFromRecovery fails closed when decrypted backup imports zero items', async () => {
    const session = {
      sessionId: 'session-empty-import',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      verificationCode: '',
      recoveryToken: 'token-1',
      vaultBackupPath: '/mock/documents/recovery_backups/file.aegis',
      status: 'code_verified',
      userEmail: 'user@example.com',
    };

    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      path === '/mock/documents/recovery_sessions/session-empty-import.json' ||
      path === '/mock/documents/recovery_backups/file.aegis',
    );
    (RNFS.readFile as jest.Mock).mockImplementation(async path => {
      if (path === '/mock/documents/recovery_sessions/session-empty-import.json') {
        return JSON.stringify(session);
      }
      return '';
    });
    (BackupModule.importEncryptedAegis as jest.Mock).mockResolvedValue({
      imported: 0,
      skipped: 0,
      total: 0,
      errors: ['decrypt_failed'],
      source: 'aegis_vault',
    });

    const restored = await RecoveryModule.restoreFromRecovery(
      'session-empty-import',
      'token-1',
      'backup-password',
    );

    expect(restored).toBe(false);
    expect(SecurityModule.resetBiometricKeys).not.toHaveBeenCalled();
    expect(RNFS.unlink).not.toHaveBeenCalledWith(
      '/mock/documents/recovery_backups/file.aegis',
    );
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'recovery_restore_failed',
      'success',
      expect.objectContaining({ reason: 'backup_decrypt_failed' }),
    );
  });

  test('verifyBackupIntegrity hashes file contents with SHA-256', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    const fileContent = Buffer.from('encrypted-backup-payload').toString('base64');
    const hash = require('crypto')
      .createHash('sha256')
      .update(fileContent, 'base64')
      .digest('hex');

    (RNFS.readFile as jest.Mock).mockImplementation(async (path, encoding) => {
      if (path.endsWith('.hash')) return hash;
      if (encoding === 'base64') return fileContent;
      return '';
    });

    const ok = await RecoveryModule.verifyBackupIntegrity(
      '/mock/documents/recovery_backups/file.aegis',
    );

    expect(ok).toBe(true);
  });

  test('cleanupExpiredSessions removes only sessions older than expiry buffer', async () => {
    (RNFS.readDir as jest.Mock).mockResolvedValue([
      { name: 'expired.json', path: '/mock/documents/recovery_sessions/expired.json' },
      { name: 'fresh.json', path: '/mock/documents/recovery_sessions/fresh.json' },
      { name: 'notes.txt', path: '/mock/documents/recovery_sessions/notes.txt' },
    ]);
    (RNFS.readFile as jest.Mock).mockImplementation(async path => {
      if (path.endsWith('expired.json')) {
        return JSON.stringify({
          sessionId: 'expired',
          createdAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
          expiresAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
          verificationCode: '',
          status: 'expired',
          userEmail: 'user@example.com',
        });
      }
      if (path.endsWith('fresh.json')) {
        return JSON.stringify({
          sessionId: 'fresh',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          verificationCode: '',
          status: 'initiated',
          userEmail: 'user@example.com',
        });
      }
      return '';
    });

    await RecoveryModule.cleanupExpiredSessions();

    expect(RNFS.unlink).toHaveBeenCalledWith(
      '/mock/documents/recovery_sessions/expired.json',
    );
    expect(RNFS.unlink).not.toHaveBeenCalledWith(
      '/mock/documents/recovery_sessions/fresh.json',
    );
  });
});
