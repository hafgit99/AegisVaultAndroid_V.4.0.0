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

export interface EncryptedFileMetadata {
  originalName: string;
  size: number;
  encryptedAt: string;
  mimeType: string;
}

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const INVALID_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

export const sanitizeVaultFileName = (name?: string): string => {
  const leaf = String(name || '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || 'decrypted_file';
  const cleaned = leaf
    .split('')
    .map(char => (
      char.charCodeAt(0) <= 31 || INVALID_FILENAME_CHARS.has(char)
        ? '_'
        : char
    ))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim();
  const safe = cleaned || 'decrypted_file';
  return RESERVED_WINDOWS_NAMES.test(safe) ? `_${safe}` : safe;
};

export class FileEncryptionModule {
  private static readonly ENCRYPTED_FILES_DIR = `${RNFS.DocumentDirectoryPath}/encrypted_vault_files`;
  private static readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunks for large files
  private static readonly LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

  private static async readFileBase64(
    sourcePath: string,
    fileSize: number,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    if (
      fileSize <= this.LARGE_FILE_THRESHOLD ||
      typeof (RNFS as any).read !== 'function'
    ) {
      return RNFS.readFile(sourcePath, 'base64');
    }

    const segments: string[] = [];
    let position = 0;
    while (position < fileSize) {
      const length = Math.min(this.CHUNK_SIZE, fileSize - position);
      const chunk = await (RNFS as any).read(
        sourcePath,
        length,
        position,
        'base64',
      );
      segments.push(chunk);
      position += length;
      if (onProgress) {
        onProgress(Math.min(99, Math.floor((position / fileSize) * 100)));
      }
    }
    return segments.join('');
  }

  /**
   * Encrypt a file from a local path
   * Yerel yoldaki bir dosyayı şifrele
   */
  static async encryptFile(
    sourcePath: string,
    password: string,
    _onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; encryptedPath?: string; error?: string }> {
    try {
      const exists = await RNFS.exists(sourcePath);
      if (!exists) throw new Error('Source file not found');

      await RNFS.mkdir(this.ENCRYPTED_FILES_DIR).catch(() => {});

      const fileName = sanitizeVaultFileName(sourcePath);
      const encryptedPath = `${this.ENCRYPTED_FILES_DIR}/${fileName}.aegis_enc`;
      
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
        const key = await SecurityModule.getSyncRootSecret(password);
        const iv = Buffer.from(obj.iv, 'base64');
        const tag = Buffer.from(obj.tag, 'base64');
        const data = Buffer.from(obj.data, 'base64');

        const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
          decipher.update(data),
          decipher.final()
        ]);

        const originalName = sanitizeVaultFileName(obj.meta?.originalName);
        const decryptedPath = `${targetDir}/${originalName}`;
        await RNFS.writeFile(decryptedPath, decrypted.toString('base64'), 'base64');
        return { success: true, decryptedPath, originalName };
      }

      throw new Error('Unsupported encryption version');
    } catch (e: any) {
      console.error('[FileEncryption] Decryption failed:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * List all encrypted files in the vault
   */
  static async listEncryptedFiles(): Promise<EncryptedFileMetadata[]> {
    try {
      const exists = await RNFS.exists(this.ENCRYPTED_FILES_DIR);
      if (!exists) return [];

      const files = await RNFS.readDir(this.ENCRYPTED_FILES_DIR);
      const list: EncryptedFileMetadata[] = [];

      for (const file of files) {
        if (file.name.endsWith('.aegis_enc')) {
          try {
            // Read only the first bit or assume from filename
            // For performance, we'll just return basic info from stat for now
            list.push({
              originalName: file.name.replace('.aegis_enc', ''),
              size: file.size,
              encryptedAt: file.mtime?.toISOString() || new Date().toISOString(),
              mimeType: 'application/octet-stream'
            });
          } catch {}
        }
      }
      return list;
    } catch {
      return [];
    }
  }
}

export default FileEncryptionModule;
