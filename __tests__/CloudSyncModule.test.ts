import RNFS from 'react-native-fs';
import { BackupModule } from '../src/BackupModule';
import { SecurityModule } from '../src/SecurityModule';
import { CloudSyncModule } from '../src/CloudSyncModule';

const mockUploadFile = jest.fn();
const mockDownloadFile = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    CloudSyncSecure: {
      uploadFile: (...args: any[]) => mockUploadFile(...args),
      downloadFile: (...args: any[]) => mockDownloadFile(...args),
    },
  },
  Platform: {
    OS: 'android',
    Version: 34,
  },
}));

jest.mock('react-native-fs', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/mock/documents',
}));

jest.mock('../src/BackupModule', () => ({
  BackupModule: {
    exportEncrypted: jest.fn(),
    importEncryptedAegis: jest.fn(),
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('CloudSyncModule', () => {
  const validPin = 'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadFile.mockResolvedValue(204);
    mockDownloadFile.mockResolvedValue(200);
    (BackupModule.exportEncrypted as jest.Mock).mockResolvedValue(
      '/mock/documents/temp-export.aegis',
    );
    (BackupModule.importEncryptedAegis as jest.Mock).mockResolvedValue({
      imported: 3,
      skipped: 1,
      total: 4,
      errors: [],
      source: 'aegis_vault',
    });
  });

  test('syncToCloud uploads encrypted export and always removes temp file', async () => {
    const result = await CloudSyncModule.syncToCloud(
      'https://sync.example.com/vault.aegis',
      'secret-token',
      'Bearer',
      'vault-password',
      validPin,
    );

    expect(result).toBe(true);
    expect(BackupModule.exportEncrypted).toHaveBeenCalledWith('vault-password');
    expect(mockUploadFile).toHaveBeenCalledWith(
      'https://sync.example.com/vault.aegis',
      '/mock/documents/temp-export.aegis',
      'Bearer secret-token',
      validPin,
    );
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'cloud_sync_upload',
      'success',
      expect.objectContaining({ statusCode: 204 }),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/temp-export.aegis');
  });

  test('syncToCloud rejects non-HTTPS endpoints before exporting vault', async () => {
    await expect(
      CloudSyncModule.syncToCloud(
        'http://sync.example.com/vault.aegis',
        'secret-token',
        'Bearer',
        'vault-password',
        validPin,
      ),
    ).rejects.toThrow('Cloud Sync requires HTTPS URLs only');

    expect(BackupModule.exportEncrypted).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  test('syncToCloud rejects invalid certificate pin format', async () => {
    await expect(
      CloudSyncModule.syncToCloud(
        'https://sync.example.com/vault.aegis',
        'secret-token',
        'Bearer',
        'vault-password',
        'not-a-valid-pin',
      ),
    ).rejects.toThrow('Invalid certificate pin format. Use sha256/<base64>');

    expect(BackupModule.exportEncrypted).not.toHaveBeenCalled();
  });

  test('syncToCloud logs failed uploads and still cleans up temp export', async () => {
    mockUploadFile.mockResolvedValueOnce(500);

    await expect(
      CloudSyncModule.syncToCloud(
        'https://sync.example.com/vault.aegis',
        'secret-token',
        'Bearer',
        'vault-password',
        validPin,
      ),
    ).rejects.toThrow('Cloud server rejected upload: 500 HTTP error');

    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'cloud_sync_upload',
      'failed',
      expect.objectContaining({ statusCode: 500 }),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith('/mock/documents/temp-export.aegis');
  });

  test('syncFromCloud imports downloaded file and removes temp artifact', async () => {
    const result = await CloudSyncModule.syncFromCloud(
      'https://sync.example.com/vault.aegis',
      'base64-creds',
      'Basic',
      'vault-password',
      validPin,
    );

    expect(mockDownloadFile).toHaveBeenCalledWith(
      'https://sync.example.com/vault.aegis',
      '/mock/documents/aegis_cloud_import_temp.aegis',
      'Basic base64-creds',
      validPin,
    );
    expect(BackupModule.importEncryptedAegis).toHaveBeenCalledWith(
      '/mock/documents/aegis_cloud_import_temp.aegis',
      'vault-password',
    );
    expect(result.imported).toBe(3);
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'cloud_sync_download',
      'success',
      expect.objectContaining({ imported: 3, skipped: 1 }),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith(
      '/mock/documents/aegis_cloud_import_temp.aegis',
    );
  });

  test('syncFromCloud fails closed on download errors and removes temp file', async () => {
    mockDownloadFile.mockResolvedValueOnce(404);

    await expect(
      CloudSyncModule.syncFromCloud(
        'https://sync.example.com/vault.aegis',
        'base64-creds',
        'Basic',
        'vault-password',
        validPin,
      ),
    ).rejects.toThrow('Failed to download from cloud: 404');

    expect(BackupModule.importEncryptedAegis).not.toHaveBeenCalled();
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'cloud_sync_download',
      'failed',
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(RNFS.unlink).toHaveBeenCalledWith(
      '/mock/documents/aegis_cloud_import_temp.aegis',
    );
  });
});
