export const SQLCIPHER_HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export const wipeBytes = (value?: Uint8Array | Buffer | null): void => {
  if (!value) return;
  if (typeof (value as any).fill === 'function') {
    (value as any).fill(0);
    return;
  }
  for (let i = 0; i < value.length; i++) value[i] = 0;
};

export const buildSqlCipherRawKeyPragma = (
  operation: 'key' | 'rekey',
  keyHex: string,
): string => {
  if (!SQLCIPHER_HEX_KEY_PATTERN.test(keyHex)) {
    throw new Error(`Invalid SQLCipher ${operation} key format`);
  }
  return `PRAGMA ${operation} = "x'${keyHex.toLowerCase()}'";`;
};

// ── Secure Memory Utilities ──────────────────────────────────────────────────
// Bellekte güvenli anahtar yönetimi yardımcıları.
// JavaScript string'leri immutable olduğundan sıfırlanamaz.
// Bu yardımcılar hassas verileri Uint8Array'e dönüştürerek
// kullanım sonrası wipeBytes ile sıfırlanabilir hale getirir.

/**
 * Converts a hex string to a Uint8Array for secure in-memory storage.
 * Unlike strings, Uint8Array contents can be zeroed after use.
 *
 * Hex string'i güvenli bellek depolama için Uint8Array'e dönüştürür.
 * String'lerin aksine, Uint8Array içeriği kullanım sonrası sıfırlanabilir.
 */
export const stringToSecureBytes = (hexOrUtf8: string): Uint8Array => {
  if (!hexOrUtf8) return new Uint8Array(0);
  // If it looks like a hex string (even length, only hex chars), decode as hex
  if (/^[0-9a-f]+$/i.test(hexOrUtf8) && hexOrUtf8.length % 2 === 0) {
    const bytes = new Uint8Array(hexOrUtf8.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hexOrUtf8.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  // Otherwise encode as UTF-8
  const encoder = new TextEncoder();
  return encoder.encode(hexOrUtf8);
};

/**
 * Converts a Uint8Array back to a hex string (for passing to APIs that need strings).
 * The caller should wipeBytes() the source array after this call.
 *
 * Uint8Array'i hex string'e dönüştürür. Çağıran taraf, bu çağrıdan sonra
 * kaynak diziyi wipeBytes() ile sıfırlamalıdır.
 */
export const secureBytesToHex = (bytes: Uint8Array): string => {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

