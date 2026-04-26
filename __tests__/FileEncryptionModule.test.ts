/**
 * FileEncryptionModule.test.ts — Aegis Vault Android v4.2.0
 * Hardened mutation-killing tests for file encryption/decryption.
 *
 * Covers: encryptFile (v2), decryptFile (v1 + v2), listEncryptedFiles,
 * chunked reading, error paths, progress callbacks, and edge cases.
 */

import {
  FileEncryptionModule,
  sanitizeVaultFileName,
} from '../src/FileEncryptionModule';
import RNFS from 'react-native-fs';

// ═══════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1024 }),
  readFile: jest.fn().mockResolvedValue('mock-base64-content'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([
    { name: 'photo.aegis_enc', size: 2048, mtime: new Date('2026-03-30T12:00:00Z') },
    { name: 'doc.aegis_enc', size: 512, mtime: new Date('2026-04-01T08:00:00Z') },
    { name: 'readme.txt', size: 100, mtime: new Date('2026-04-01T09:00:00Z') },
  ]),
  DocumentDirectoryPath: '/doc',
  TemporaryDirectoryPath: '/tmp',
}));

jest.mock('react-native-quick-crypto', () => ({
  randomBytes: jest.fn(() => Buffer.alloc(32)),
  createCipheriv: jest.fn(() => ({
    update: jest.fn((d: any) => Buffer.from(d)),
    final: jest.fn(() => Buffer.alloc(0)),
    getAuthTag: jest.fn(() => Buffer.alloc(16)),
  })),
  createDecipheriv: jest.fn(() => ({
    update: jest.fn((d: any) => Buffer.from(d)),
    final: jest.fn(() => Buffer.alloc(0)),
    setAuthTag: jest.fn(),
  })),
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    getSyncRootSecret: jest.fn().mockResolvedValue(Buffer.alloc(32, 0xaa)),
    encryptAES256GCM: jest.fn().mockResolvedValue({
      salt: 'bW9jay1zYWx0', iv: 'bW9jay1pdg==',
      authTag: 'bW9jay1hdXRoLXRhZw==', ciphertext: 'bW9jay1jaXBoZXJ0ZXh0',
      kdf: 'Argon2id', memory: 32768, iterations: 4, parallelism: 2, hashLength: 32,
    }),
    decryptAES256GCM: jest.fn().mockResolvedValue(
      JSON.stringify({ originalName: 'test.txt', data: 'ZGF0YQ==' }),
    ),
  },
}));

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('FileEncryptionModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeVaultFileName', () => {
    it('removes path traversal and reserved filename characters', () => {
      expect(sanitizeVaultFileName('../secret/pass:word?.txt')).toBe(
        'pass_word_.txt',
      );
      expect(sanitizeVaultFileName('..\\..\\CON')).toBe('_CON');
      expect(sanitizeVaultFileName('...')).toBe('decrypted_file');
    });
  });

  // ── encryptFile ─────────────────────────────────────────────

  describe('encryptFile', () => {
    it('encrypts a file successfully and returns correct path', async () => {
      const result = await FileEncryptionModule.encryptFile('/storage/photo.jpg', 'secret');

      expect(result.success).toBe(true);
      expect(result.encryptedPath).toBeDefined();
      expect(result.encryptedPath).toContain('.aegis_enc');
      expect(result.encryptedPath).toContain('photo.jpg');
      expect(result.error).toBeUndefined();
    });

    it('writes encrypted envelope to disk', async () => {
      await FileEncryptionModule.encryptFile('/storage/file.txt', 'pw');

      expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
      const [path, content, encoding] = (RNFS.writeFile as jest.Mock).mock.calls[0];
      expect(path).toContain('.aegis_enc');
      expect(encoding).toBe('utf8');

      // Content should be valid JSON with v:2
      const parsed = JSON.parse(content);
      expect(parsed.v).toBe(2);
      expect(parsed.salt).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.authTag).toBeDefined();
      expect(parsed.ciphertext).toBeDefined();
      expect(parsed.kdf).toBe('Argon2id');
    });

    it('creates encrypted files directory', async () => {
      await FileEncryptionModule.encryptFile('/storage/file.txt', 'pw');
      expect(RNFS.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('encrypted_vault_files'),
      );
    });

    it('checks source file exists before encryption', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);
      const result = await FileEncryptionModule.encryptFile('/missing/file.txt', 'pw');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('reads file stat for size information', async () => {
      await FileEncryptionModule.encryptFile('/storage/doc.pdf', 'pw');
      expect(RNFS.stat).toHaveBeenCalledWith('/storage/doc.pdf');
    });

    it('calls progress callback with 100 on completion', async () => {
      const onProgress = jest.fn();
      await FileEncryptionModule.encryptFile('/storage/file.txt', 'pw', onProgress);
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('extracts filename from full path', async () => {
      await FileEncryptionModule.encryptFile('/deep/nested/path/myfile.doc', 'pw');

      const writePath = (RNFS.writeFile as jest.Mock).mock.calls[0][0] as string;
      expect(writePath).toContain('myfile.doc.aegis_enc');
      expect(writePath).not.toContain('deep');
    });

    it('handles encryption error gracefully', async () => {
      const { SecurityModule: SM } = require('../src/SecurityModule');
      SM.encryptAES256GCM.mockRejectedValueOnce(new Error('crypto fail'));

      const result = await FileEncryptionModule.encryptFile('/storage/x.txt', 'pw');
      expect(result.success).toBe(false);
      expect(result.error).toBe('crypto fail');
    });

    it('passes file content as base64 in the payload to encrypt', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue('dGVzdA=='); // "test" in base64
      const { SecurityModule: SM } = require('../src/SecurityModule');

      await FileEncryptionModule.encryptFile('/storage/file.bin', 'pw');

      // The payload passed to encryptAES256GCM should be a JSON string
      const payloadArg = SM.encryptAES256GCM.mock.calls[0][0];
      const parsed = JSON.parse(payloadArg);
      expect(parsed.data).toBe('dGVzdA==');
      expect(parsed.originalName).toBe('file.bin');
      expect(parsed.mimeType).toBe('application/octet-stream');
      expect(typeof parsed.encryptedAt).toBe('string');
      expect(typeof parsed.size).toBeDefined();
    });
  });

  // ── decryptFile (v2 format) ─────────────────────────────────

  describe('decryptFile v2', () => {
    const v2Envelope = JSON.stringify({
      v: 2,
      salt: 'bW9jay1zYWx0', iv: 'bW9jay1pdg==',
      authTag: 'bW9jay1hdXRoLXRhZw==', ciphertext: 'bW9jay1jaXBoZXJ0ZXh0',
      kdf: 'Argon2id', memory: 32768, iterations: 4, parallelism: 2, hashLength: 32,
    });

    it('decrypts v2 file successfully', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(v2Envelope);
      const result = await FileEncryptionModule.decryptFile('/enc/test.txt.aegis_enc', 'pw');

      expect(result.success).toBe(true);
      expect(result.originalName).toBe('test.txt');
      expect(result.decryptedPath).toContain('test.txt');
    });

    it('passes correct kdf metadata to decryptAES256GCM', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(v2Envelope);
      const { SecurityModule: SM } = require('../src/SecurityModule');

      await FileEncryptionModule.decryptFile('/enc/file.aegis_enc', 'pw');

      expect(SM.decryptAES256GCM).toHaveBeenCalledWith(
        'bW9jay1jaXBoZXJ0ZXh0', 'pw', 'bW9jay1zYWx0', 'bW9jay1pdg==',
        'bW9jay1hdXRoLXRhZw==',
        expect.objectContaining({
          kdf: 'Argon2id', memory: 32768, iterations: 4, parallelism: 2, hashLength: 32,
        }),
      );
    });

    it('writes decrypted content as base64', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(v2Envelope);
      await FileEncryptionModule.decryptFile('/enc/file.aegis_enc', 'pw');

      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        'ZGF0YQ==',
        'base64',
      );
    });

    it('uses targetDir for output path', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(v2Envelope);
      const result = await FileEncryptionModule.decryptFile('/enc/x.aegis_enc', 'pw', '/custom/dir');

      expect(result.decryptedPath).toContain('/custom/dir');
    });

    it('falls back to "decrypted_file" if originalName is missing', async () => {
      const { SecurityModule: SM } = require('../src/SecurityModule');
      SM.decryptAES256GCM.mockResolvedValueOnce(JSON.stringify({ data: 'ZGF0YQ==' }));
      (RNFS.readFile as jest.Mock).mockResolvedValue(v2Envelope);

      const result = await FileEncryptionModule.decryptFile('/enc/x.aegis_enc', 'pw');
      expect(result.originalName).toBe('decrypted_file');
    });

    it('sanitizes decrypted v2 output names before writing', async () => {
      const { SecurityModule: SM } = require('../src/SecurityModule');
      SM.decryptAES256GCM.mockResolvedValueOnce(
        JSON.stringify({ originalName: '../evil/passwords.txt', data: 'ZGF0YQ==' }),
      );
      (RNFS.readFile as jest.Mock).mockResolvedValue(v2Envelope);

      const result = await FileEncryptionModule.decryptFile(
        '/enc/x.aegis_enc',
        'pw',
        '/safe',
      );

      expect(result.decryptedPath).toBe('/safe/passwords.txt');
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        '/safe/passwords.txt',
        'ZGF0YQ==',
        'base64',
      );
    });
  });

  // ── decryptFile (v1 legacy format) ──────────────────────────

  describe('decryptFile v1', () => {
    it('decrypts v1 format with meta.originalName', async () => {
      const v1Data = JSON.stringify({
        v: 1,
        iv: Buffer.alloc(12).toString('base64'),
        tag: Buffer.alloc(16).toString('base64'),
        data: Buffer.from('hello').toString('base64'),
        meta: { originalName: 'legacy.txt' },
      });
      (RNFS.readFile as jest.Mock).mockResolvedValue(v1Data);

      const result = await FileEncryptionModule.decryptFile('/enc/legacy.aegis_enc', 'pw');

      expect(result.success).toBe(true);
      expect(result.originalName).toBe('legacy.txt');
    });

    it('uses "decrypted_file" fallback for v1 without meta', async () => {
      const v1Data = JSON.stringify({
        v: 1,
        iv: Buffer.alloc(12).toString('base64'),
        tag: Buffer.alloc(16).toString('base64'),
        data: Buffer.from('hello').toString('base64'),
      });
      (RNFS.readFile as jest.Mock).mockResolvedValue(v1Data);

      const result = await FileEncryptionModule.decryptFile('/enc/noname.aegis_enc', 'pw');
      expect(result.success).toBe(true);
      expect(result.originalName).toBe('decrypted_file');
    });
  });

  // ── decryptFile error handling ──────────────────────────────

  describe('decryptFile errors', () => {
    it('returns error for unsupported encryption version', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ v: 99 }));
      const result = await FileEncryptionModule.decryptFile('/enc/future.aegis_enc', 'pw');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('returns error for malformed JSON', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue('not-json');
      const result = await FileEncryptionModule.decryptFile('/enc/bad.aegis_enc', 'pw');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when decryption throws', async () => {
      const { SecurityModule: SM } = require('../src/SecurityModule');
      SM.decryptAES256GCM.mockRejectedValueOnce(new Error('wrong password'));
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        v: 2, salt: 's', iv: 'i', authTag: 'a', ciphertext: 'c',
      }));

      const result = await FileEncryptionModule.decryptFile('/enc/x.aegis_enc', 'bad');
      expect(result.success).toBe(false);
      expect(result.error).toBe('wrong password');
    });
  });

  // ── listEncryptedFiles ──────────────────────────────────────

  describe('listEncryptedFiles', () => {
    it('lists only .aegis_enc files', async () => {
      const files = await FileEncryptionModule.listEncryptedFiles();

      expect(files).toHaveLength(2);
      expect(files[0].originalName).toBe('photo');
      expect(files[1].originalName).toBe('doc');
    });

    it('strips .aegis_enc extension from originalName', async () => {
      const files = await FileEncryptionModule.listEncryptedFiles();
      files.forEach(f => {
        expect(f.originalName).not.toContain('.aegis_enc');
      });
    });

    it('populates size and encryptedAt from file stat', async () => {
      const files = await FileEncryptionModule.listEncryptedFiles();

      expect(files[0].size).toBe(2048);
      expect(files[0].encryptedAt).toBe('2026-03-30T12:00:00.000Z');
      expect(files[1].size).toBe(512);
    });

    it('sets mimeType to application/octet-stream', async () => {
      const files = await FileEncryptionModule.listEncryptedFiles();
      files.forEach(f => {
        expect(f.mimeType).toBe('application/octet-stream');
      });
    });

    it('returns empty array when directory does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      const files = await FileEncryptionModule.listEncryptedFiles();
      expect(files).toEqual([]);
    });

    it('returns empty array on error', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readDir as jest.Mock).mockRejectedValue(new Error('read err'));
      const files = await FileEncryptionModule.listEncryptedFiles();
      expect(files).toEqual([]);
    });

    it('returns empty array when directory contains no .aegis_enc files', async () => {
      (RNFS.readDir as jest.Mock).mockResolvedValue([
        { name: 'readme.txt', size: 100, mtime: new Date() },
        { name: 'photo.jpg', size: 5000, mtime: new Date() },
      ]);
      const files = await FileEncryptionModule.listEncryptedFiles();
      expect(files).toEqual([]);
    });
  });

  // ── readFileBase64 (chunked reading) ────────────────────────

  describe('readFileBase64 chunked reading', () => {
    it('reads small files in one shot without chunking', async () => {
      (RNFS.stat as jest.Mock).mockResolvedValue({ size: 1024 });
      (RNFS.readFile as jest.Mock).mockResolvedValue('base64data');

      await FileEncryptionModule.encryptFile('/storage/small.txt', 'pw');

      expect(RNFS.readFile).toHaveBeenCalledWith('/storage/small.txt', 'base64');
    });
  });
});
