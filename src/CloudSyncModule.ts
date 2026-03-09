import RNFS from 'react-native-fs';
import { NativeModules, Platform } from 'react-native';
import { BackupModule } from './BackupModule';

const { CloudSyncSecure } = NativeModules;

interface CloudSyncSecureBridge {
  uploadFile: (
    apiUrl: string,
    filePath: string,
    authHeader: string,
    certificatePin: string,
  ) => Promise<number>;
  downloadFile: (
    apiUrl: string,
    filePath: string,
    authHeader: string,
    certificatePin: string,
  ) => Promise<number>;
}

/**
 * Encrypted Cloud Sync (Optional)
 * Uploads/Downloads the AES-256-GCM encrypted `.aegis` vault backup
 * to a standard WebDAV or custom HTTP endpoint.
 */
export class CloudSyncModule {
  private static assertHttpsUrl(rawUrl: string): string {
    let parsed: URL;
    try {
      parsed = new URL((rawUrl || '').trim());
    } catch {
      throw new Error('Invalid Cloud Sync URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Cloud Sync requires HTTPS URLs only');
    }
    return parsed.toString();
  }

  private static assertCertificatePin(rawPin: string): string {
    const pin = (rawPin || '').trim();
    if (!pin) throw new Error('Certificate pin is required');

    const normalized = pin.startsWith('sha256/') ? pin : `sha256/${pin}`;
    const isValid = /^sha256\/[A-Za-z0-9+/]{43}=$/.test(normalized);
    if (!isValid) {
      throw new Error('Invalid certificate pin format. Use sha256/<base64>');
    }

    return normalized;
  }

  private static getSecureBridge(): CloudSyncSecureBridge {
    if (Platform.OS !== 'android' || !CloudSyncSecure) {
      throw new Error(
        'CloudSyncSecure native module is unavailable on this device',
      );
    }

    return CloudSyncSecure as CloudSyncSecureBridge;
  }

  static getAuthHeader(token: string, type: 'Bearer' | 'Basic'): string {
    return `${type} ${token}`;
  }

  /**
   * Upload encrypted vault to cloud endpoint via PUT request (standard WebDAV)
   * We orchestrate: Export AES Vault -> Upload -> Delete temporary local backup
   */
  static async syncToCloud(
    apiUrl: string,
    token: string,
    authType: 'Bearer' | 'Basic',
    password: string,
    certificatePin: string,
  ): Promise<boolean> {
    const safeUrl = this.assertHttpsUrl(apiUrl);
    const safePin = this.assertCertificatePin(certificatePin);
    const bridge = this.getSecureBridge();

    // 1. Generate encrypted backup in a temporary file
    const tempExportPath = await BackupModule.exportEncrypted(password);

    try {
      // 2. Upload using RNFS to support large binary payloads without memory bloat
      const statusCode = await bridge.uploadFile(
        safeUrl,
        tempExportPath,
        this.getAuthHeader(token, authType),
        safePin,
      );

      if (statusCode >= 200 && statusCode < 300) {
        console.log('[CloudSync] Successfully uploaded encrypted vault');
        return true;
      } else {
        throw new Error(
          `Cloud server rejected upload: ${statusCode} HTTP error`,
        );
      }
    } finally {
      // 3. Clean up the local temporary backup to preserve zero-footprint pledge
      await RNFS.unlink(tempExportPath).catch(() => {});
    }
  }

  /**
   * Download encrypted vault from cloud endpoint and import it.
   */
  static async syncFromCloud(
    apiUrl: string,
    token: string,
    authType: 'Bearer' | 'Basic',
    password: string,
    certificatePin: string,
  ): Promise<any> {
    const safeUrl = this.assertHttpsUrl(apiUrl);
    const safePin = this.assertCertificatePin(certificatePin);
    const bridge = this.getSecureBridge();

    const tempImportPath = `${RNFS.DocumentDirectoryPath}/aegis_cloud_import_temp.aegis`;

    try {
      // 1. Download file via streaming
      const statusCode = await bridge.downloadFile(
        safeUrl,
        tempImportPath,
        this.getAuthHeader(token, authType),
        safePin,
      );

      if (statusCode >= 200 && statusCode < 300) {
        // 2. Import downloaded AES-256-GCM file
        const importResult = await BackupModule.importEncryptedAegis(
          tempImportPath,
          password,
        );
        console.log(
          '[CloudSync] Sync down completed:',
          importResult.imported,
          'imported',
        );
        return importResult;
      } else {
        throw new Error(`Failed to download from cloud: ${statusCode}`);
      }
    } finally {
      // 3. Clean up generic downloaded file
      await RNFS.unlink(tempImportPath).catch(() => {});
    }
  }
}
