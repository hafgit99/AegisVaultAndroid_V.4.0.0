/**
 * SyncCryptoService — Aegis Vault Android v4.2.0
 * E2E Encrypted synchronization crypto primitives.
 * Uses react-native-quick-crypto (Node.js crypto compatible).
 *
 * Sync Şifreleme Servisi — Uçtan uca şifreli senkronizasyon için Kripto temel bileşenleri.
 */

import crypto from 'react-native-quick-crypto';
import { Buffer } from 'buffer';
import base64Js from 'base64-js';

export interface SyncCryptoPackage {
  payload: string; // Base64(AES-GCM-Encrypted + 16-byte Auth Tag)
  iv: string;      // Base64(12-byte IV)
  hmac: string;    // Base64(HMAC-SHA256 of IV + Payload)
  nonce: string;   // Unique session nonce
}

function timingSafeEqualCompat(a: Buffer | Uint8Array, b: Buffer | Uint8Array): boolean {
  const ua = Uint8Array.from(a);
  const ub = Uint8Array.from(b);
  if (ua.length !== ub.length) return false;
  // XOR-based constant-time comparison (works on all RN crypto libs)
  let diff = 0;
  for (let i = 0; i < ua.length; i++) {
    // eslint-disable-next-line no-bitwise
    diff |= ua[i] ^ ub[i];
  }
  return diff === 0;
}

function toBase64(value: Buffer | Uint8Array): string {
  return base64Js.fromByteArray(Uint8Array.from(value));
}

function fromBase64(value: string): Buffer {
  return Buffer.from(base64Js.toByteArray(value));
}

export class SyncCryptoService {
  /**
   * Derive encryption and authentication keys from a root secret using HKDF.
   * SECURITY: The salt parameter should be per-installation unique.
   * The rootSecret itself is already derived with a per-installation salt
   * in SecurityModule.getSyncRootSecret(), providing defense-in-depth.
   *
   * @param rootSecret - The per-installation root secret from Argon2id
   * @param installSalt - Optional per-installation salt; if omitted, a fixed
   *                      domain separator is used (safe because rootSecret
   *                      is already installation-unique).
   */
  static deriveSubKeys(
    rootSecret: Buffer,
    installSalt?: Buffer,
  ): { encryptionKey: Buffer, authKey: Buffer } {
    // Use provided per-installation salt, or fall back to a domain separator.
    // Because rootSecret is already per-installation unique (via device salt
    // in Argon2id), this fixed fallback is safe against cross-user collisions.
    const salt = installSalt ?? Buffer.from('aegis_sync_v2_hkdf');
    
    const hkdfSync = (crypto as any).hkdfSync;
    if (typeof hkdfSync !== 'function') {
      throw new Error('[SyncCrypto] hkdfSync is unavailable on this build.');
    }
    const okm = Buffer.from(
      hkdfSync(
        'sha256',
        rootSecret,
        salt,
        Buffer.from('aegis_sync_subkeys_v1'),
        64,
      ) as ArrayBuffer,
    );
    const encryptionKey = okm.subarray(0, 32);
    const authKey = okm.subarray(32, 64);

    return { encryptionKey: Buffer.from(encryptionKey), authKey: Buffer.from(authKey) };
  }

  /**
   * Encrypt and sign a payload for E2E sync.
   */
  static encryptAndSign(
    data: unknown,
    encryptionKey: Buffer,
    authKey: Buffer
  ): SyncCryptoPackage {
    const iv = crypto.randomBytes(12);
    const nonce = crypto.randomBytes(16).toString('hex');
    const plaintext = JSON.stringify({ data, nonce });

    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
        cipher.getAuthTag()
    ]);

    // HMAC includes IV and Ciphertext (with Tag)
    const hmac = crypto.createHmac('sha256', authKey);
    hmac.update(iv);
    hmac.update(ciphertext);
    const hmacDigest = hmac.digest();

    return {
      payload: toBase64(ciphertext),
      iv: toBase64(iv),
      hmac: toBase64(hmacDigest),
      nonce,
    };
  }

  /**
   * Verify and decrypt a sync package.
   */
  static verifyAndDecrypt<T = unknown>(
    pkg: SyncCryptoPackage,
    encryptionKey: Buffer,
    authKey: Buffer
  ): T | null {
    try {
      const iv = fromBase64(pkg.iv);
      const fullPayload = fromBase64(pkg.payload);
      const hmacKey = fromBase64(pkg.hmac);

      // 1. Verify HMAC (Constant-time comparison)
      const hmac = crypto.createHmac('sha256', authKey);
      hmac.update(iv);
      hmac.update(fullPayload);
      const computedHmac = hmac.digest();

      if (computedHmac.length !== hmacKey.length) {
        return null;
      }

      if (!timingSafeEqualCompat(computedHmac, hmacKey)) {
        console.error('[SyncCrypto] Invalid HMAC signature');
        return null;
      }

      // 2. Decrypt AES-GCM (AuthTag is the last 16 bytes)
      const ciphertext = fullPayload.subarray(0, fullPayload.length - 16);
      const authTag = fullPayload.subarray(fullPayload.length - 16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      const parsed = JSON.parse(decrypted) as { data: T; nonce: string };
      if (pkg.nonce && parsed.nonce !== pkg.nonce) {
        console.error('[SyncCrypto] Nonce mismatch');
        return null;
      }

      return parsed.data;
    } catch (e) {
      console.error('[SyncCrypto] Verification/Decryption failed:', e);
      return null;
    }
  }
}
