/**
 * FileEncryptionModule - Advanced File Encryption & Decryption
 * 
 * Ek Dosya Şifreleme Modülü - Gelişmiş Dosya Şifreleme ve Deşifreleme
 * Allows users to encrypt arbitrary files on the device using AES-256-GCM.
 */

import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import { SecurityModule } from './SecurityModule';
import { stringToSecureBytes, wipeBytes } from './security/CryptoService';

export interface EncryptedFileMetadata {
  originalName: string;
  size: number;
  encryptedAt: string;
  mimeType: string;
}

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function sanitizeVaultFileName(name: string): string {
  if (!name) return 'decrypted_file';
  const baseName = name.split(/[\\/]+/).filter(Boolean).pop() || '';
  // eslint-disable-next-line no-control-regex
  let sanitized = baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  if (/^\.+$/.test(sanitized)) {
    sanitized = '';
  }
  if (RESERVED_WINDOWS_NAMES.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  return sanitized || 'decrypted_file';
}

const ENCRYPTED_DIR = `${RNFS.DocumentDirectoryPath}/encrypted_vault_files`;

export class FileEncryptionModule {
  /**
   * Encrypt a file at sourcePath and save to encryptedPath
   */
  static async encryptFile(
    sourcePath: string,
    password: string,
    _onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; encryptedPath?: string; error?: string }> {
    try {
      if (!(await RNFS.exists(sourcePath))) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      await RNFS.mkdir(ENCRYPTED_DIR);
      const fileName = sourcePath.split('/').pop() || 'file';
      const encryptedPath = `${ENCRYPTED_DIR}/${fileName}.aegis_enc`;
      const fileStat = await RNFS.stat(sourcePath);
      
      const base64 = await this.readFileBase64(
        sourcePath,
        Number(fileStat.size || 0),
        _onProgress,
      );
      const payload = JSON.stringify({
        originalName: fileName,
        size: fileStat.size,
        encryptedAt: new Date().toISOString(),
        mimeType: 'application/octet-stream',
        data: base64,
      });
      const encrypted = await SecurityModule.encryptAES256GCM(payload, password);
      const envelope = JSON.stringify({
        v: 2,
        ...encrypted,
      });

      await RNFS.writeFile(encryptedPath, envelope, 'utf8');
      if (_onProgress) _onProgress(100);

      return { success: true, encryptedPath };
    } catch (e: any) {
      console.error('[FileEncryption] Encryption failed:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Decrypt a file back to its original state
   */
  static async decryptFile(
    encryptedPath: string,
    password: string,
    targetDir: string = RNFS.TemporaryDirectoryPath
  ): Promise<{ success: boolean; decryptedPath?: string; originalName?: string; error?: string }> {
    try {
      const content = await RNFS.readFile(encryptedPath, 'utf8');
      const obj = JSON.parse(content);

      if (obj.v === 2) {
        const decryptedJson = await SecurityModule.decryptAES256GCM(
          obj.ciphertext,
          password,
          obj.salt,
          obj.iv,
          obj.authTag,
          {
            kdf: obj.kdf,
            iterations: obj.iterations,
            memory: obj.memory,
            parallelism: obj.parallelism,
            hashLength: obj.hashLength,
          },
        );
        const parsed = JSON.parse(decryptedJson);
        const originalName = sanitizeVaultFileName(parsed.originalName);
        const decryptedPath = `${targetDir}/${originalName}`;
        await RNFS.writeFile(decryptedPath, parsed.data, 'base64');
        return { success: true, decryptedPath, originalName };
      }

      if (obj.v === 1) {
        const passwordBytes = stringToSecureBytes(password);
        const key = await SecurityModule.getSyncRootSecret(passwordBytes);
        wipeBytes(passwordBytes);
        const iv = Buffer.from(obj.iv, 'base64');
        const tag = Buffer.from(obj.tag, 'base64');
        const data = Buffer.from(obj.data, 'base64');

        const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
          decipher.update(data),
          decipher.final()
        ]);

        let parsed: any;
        try {
          parsed = JSON.parse(decrypted.toString('utf8'));
        } catch {
          parsed = {
            data: obj.data,
            meta: obj.meta,
            originalName: obj.originalName,
          };
        }
        const originalName = sanitizeVaultFileName(parsed.meta?.originalName || parsed.originalName);
        const decryptedPath = `${targetDir}/${originalName}`;
        await RNFS.writeFile(decryptedPath, parsed.data, 'base64');
        return { success: true, decryptedPath, originalName };
      }

      throw new Error(`Unsupported encryption version: ${obj.v}`);
    } catch (e: any) {
      console.error('[FileEncryption] Decryption failed:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * List all encrypted files in the vault directory
   */
  static async listEncryptedFiles(): Promise<EncryptedFileMetadata[]> {
    try {
      if (!(await RNFS.exists(ENCRYPTED_DIR))) return [];
      const files = await RNFS.readDir(ENCRYPTED_DIR);
      return files
        .filter(f => f.name.endsWith('.aegis_enc'))
        .map(f => ({
          originalName: f.name.replace('.aegis_enc', ''),
          size: f.size,
          encryptedAt: f.mtime?.toISOString() || new Date().toISOString(),
          mimeType: 'application/octet-stream',
        }));
    } catch (e) {
      console.error('[FileEncryption] List failed:', e);
      return [];
    }
  }

  private static async readFileBase64(
    path: string,
    size: number,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    if (size < 10 * 1024 * 1024) {
      return await RNFS.readFile(path, 'base64');
    }
    
    // Chunked read for larger files
    let result = '';
    const chunkSize = 1024 * 1024;
    let offset = 0;
    while (offset < size) {
      const chunk = await RNFS.read(path, chunkSize, offset, 'base64');
      result += chunk;
      offset += chunkSize;
      if (onProgress) onProgress(Math.min(100, Math.floor((offset / size) * 100)));
    }
    return result;
  }
}

export { sanitizeVaultFileName };
