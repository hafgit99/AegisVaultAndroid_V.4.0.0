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
});
