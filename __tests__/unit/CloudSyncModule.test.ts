import { CloudSyncModule } from '../../src/CloudSyncModule';
import { BackupModule } from '../../src/BackupModule';
import RNFS from 'react-native-fs';

// Mock dependencies
jest.mock('../../src/BackupModule', () => ({
  BackupModule: {
    exportEncrypted: jest.fn().mockResolvedValue('/tmp/exported.aegis'),
    importEncryptedAegis: jest.fn().mockResolvedValue({ imported: 5, total: 5 }),
  }
}));

describe('CloudSyncModule Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncToCloud', () => {
    test('enforces HTTPS protocol', async () => {
      await expect(
        CloudSyncModule.syncToCloud('http://unsecure.com', 'token', 'Bearer', 'pass')
      ).rejects.toThrow('HTTPS is required');
    });

    test('successfully uploads file and cleans up temp file', async () => {
      const mockUpload = {
        promise: Promise.resolve({ statusCode: 200 })
      };
      (RNFS.uploadFiles as jest.Mock).mockReturnValue(mockUpload);

      const result = await CloudSyncModule.syncToCloud('https://secure.com', 'token', 'Bearer', 'pass');

      expect(result).toBe(true);
      expect(BackupModule.exportEncrypted).toHaveBeenCalledWith('pass');
      expect(RNFS.uploadFiles).toHaveBeenCalledWith(expect.objectContaining({
        toUrl: 'https://secure.com',
        headers: { Authorization: 'Bearer token' }
      }));
      expect(RNFS.unlink).toHaveBeenCalledWith('/tmp/exported.aegis');
    });

    test('throws error on server failure (404)', async () => {
      const mockUpload = {
        promise: Promise.resolve({ statusCode: 404 })
      };
      (RNFS.uploadFiles as jest.Mock).mockReturnValue(mockUpload);

      await expect(
        CloudSyncModule.syncToCloud('https://secure.com', 'token', 'Bearer', 'pass')
      ).rejects.toThrow('Cloud server rejected upload: 404');
      
      expect(RNFS.unlink).toHaveBeenCalled(); // Should still cleanup
    });
  });

  describe('syncFromCloud', () => {
    test('enforces HTTPS protocol', async () => {
      await expect(
        CloudSyncModule.syncFromCloud('http://unsecure.com', 'token', 'Bearer', 'pass')
      ).rejects.toThrow('HTTPS is required');
    });

    test('successfully downloads and imports file', async () => {
      const mockDownload = {
        promise: Promise.resolve({ statusCode: 200 })
      };
      (RNFS.downloadFile as jest.Mock).mockReturnValue(mockDownload);

      const result = await CloudSyncModule.syncFromCloud('https://secure.com', 'token', 'Basic', 'pass');

      expect(result.imported).toBe(5);
      expect(RNFS.downloadFile).toHaveBeenCalledWith(expect.objectContaining({
        fromUrl: 'https://secure.com',
        headers: { Authorization: 'Basic token' }
      }));
      expect(BackupModule.importEncryptedAegis).toHaveBeenCalledWith(expect.any(String), 'pass');
      expect(RNFS.unlink).toHaveBeenCalled();
    });

    test('handles download 500 error', async () => {
      const mockDownload = {
        promise: Promise.resolve({ statusCode: 500 })
      };
      (RNFS.downloadFile as jest.Mock).mockReturnValue(mockDownload);

      await expect(
        CloudSyncModule.syncFromCloud('https://secure.com', 'token', 'Bearer', 'pass')
      ).rejects.toThrow('Failed to download from cloud: 500');
    });
  });

  test('getAuthHeader formats correctly', () => {
    expect(CloudSyncModule.getAuthHeader('abc', 'Bearer')).toBe('Bearer abc');
    expect(CloudSyncModule.getAuthHeader('xyz', 'Basic')).toBe('Basic xyz');
  });
});
