/**
 * SyncCryptoService — Aegis Vault Android v4.02
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

function timingSafeEqualCompat(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  if (typeof crypto.timingSafeEqual === 'function') {
    return crypto.timingSafeEqual(a, b);
  }
  return a.every((value, index) => value === b[index]);
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
   */
  static deriveSubKeys(rootSecret: Buffer): { encryptionKey: Buffer, authKey: Buffer } {
    const salt = Buffer.from('aegis_sync_v1_hkdf');
    
    // Manual HKDF-Extract and Expand if hkdfSync is missing
    const hmacExtract = crypto.createHmac('sha256', salt);
    hmacExtract.update(rootSecret);
    const prk = hmacExtract.digest();

    const derive = (info: string) => {
        const hmacExpand = crypto.createHmac('sha256', prk);
        hmacExpand.update(Buffer.concat([Buffer.from(info), Buffer.from([1])]));
        return hmacExpand.digest().subarray(0, 32);
    };

    const encryptionKey = derive('encryption');
    const authKey = derive('authentication');

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
        console.warn('[SyncCrypto] Nonce mismatch');
      }

      return parsed.data;
    } catch (e) {
      console.error('[SyncCrypto] Verification/Decryption failed:', e);
      return null;
    }
  }
}
