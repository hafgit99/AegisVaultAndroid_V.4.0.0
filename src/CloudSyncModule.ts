import RNFS from 'react-native-fs';
import { SecurityModule } from './SecurityModule';
import { BackupModule } from './BackupModule';

/**
 * Encrypted Cloud Sync (Optional)
 * Uploads/Downloads the AES-256-GCM encrypted `.aegis` vault backup 
 * to a standard WebDAV or custom HTTP endpoint.
 */
export class CloudSyncModule {

  static getAuthHeader(token: string, type: 'Bearer' | 'Basic'): string {
    return `${type} ${token}`;
  }

  /**
   * Upload encrypted vault to cloud endpoint via PUT request (standard WebDAV)
   * We orchestrate: Export AES Vault -> Upload -> Delete temporary local backup
   */
  static async syncToCloud(apiUrl: string, token: string, authType: 'Bearer' | 'Basic', password: string): Promise<boolean> {
    if (!apiUrl || !apiUrl.startsWith('http')) throw new Error('Invalid Cloud Sync URL');
    
    // 1. Generate encrypted backup in a temporary file
    const tempExportPath = await BackupModule.exportEncrypted(password);
    
    try {
      // 2. Upload using RNFS to support large binary payloads without memory bloat
      const upload = RNFS.uploadFiles({
        toUrl: apiUrl,
        files: [{
          name: 'backup',
          filename: 'aegis_cloud_sync.aegis',
          filepath: tempExportPath,
          filetype: 'application/octet-stream' // Binary payload
        }],
        method: 'PUT',
        headers: {
          'Authorization': this.getAuthHeader(token, authType),
        },
        beginCallback: () => console.log(`[CloudSync] Starting upload to ${apiUrl}...`)
      });

      const result = await upload.promise;
      if (result.statusCode >= 200 && result.statusCode < 300) {
        console.log('[CloudSync] Successfully uploaded encrypted vault');
        return true;
      } else {
        throw new Error(`Cloud server rejected upload: ${result.statusCode} HTTP error`);
      }
    } finally {
      // 3. Clean up the local temporary backup to preserve zero-footprint pledge
      await RNFS.unlink(tempExportPath).catch(() => {});
    }
  }

  /**
   * Download encrypted vault from cloud endpoint and import it.
   */
  static async syncFromCloud(apiUrl: string, token: string, authType: 'Bearer' | 'Basic', password: string): Promise<any> {
    if (!apiUrl || !apiUrl.startsWith('http')) throw new Error('Invalid Cloud Sync URL');

    const tempImportPath = `${RNFS.DocumentDirectoryPath}/aegis_cloud_import_temp.aegis`;
    
    try {
      // 1. Download file via streaming
      const download = RNFS.downloadFile({
        fromUrl: apiUrl,
        toFile: tempImportPath,
        headers: {
          'Authorization': this.getAuthHeader(token, authType),
        }
      });

      const result = await download.promise;
      
      if (result.statusCode >= 200 && result.statusCode < 300) {
        // 2. Import downloaded AES-256-GCM file
        const importResult = await BackupModule.importEncryptedAegis(tempImportPath, password);
        console.log('[CloudSync] Sync down completed:', importResult.imported, 'imported');
        return importResult;
      } else {
        throw new Error(`Failed to download from cloud: ${result.statusCode}`);
      }
    } finally {
      // 3. Clean up generic downloaded file
      await RNFS.unlink(tempImportPath).catch(() => {});
    }
  }
}
