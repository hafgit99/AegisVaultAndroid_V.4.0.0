import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';

// ═══════════════════════════════════════════════════════════════
// TOTP Generator – RFC 6238 compliant
// Supports SHA1, SHA256, SHA512 algorithms
// ═══════════════════════════════════════════════════════════════

// ── Base32 Decoder (RFC 4648) ────────────────────────────────
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  // Clean input: remove spaces, dashes, lowercase → uppercase, strip padding
  const cleaned = input.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue; // skip invalid chars

    buffer = (buffer << 5) | val;
    bitsLeft += 5;

    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

// ── TOTP Core Logic ─────────────────────────────────────────
interface TOTPParams {
  secret: string;       // Base32 encoded secret
  period?: number;      // Time step in seconds (default 30)
  digits?: number;      // Number of digits (default 6)
  algorithm?: string;   // Hash algorithm (default 'sha1')
  timestamp?: number;   // Custom timestamp (default Date.now())
}

interface TOTPResult {
  code: string;         // The TOTP code (e.g., "123456")
  remaining: number;    // Seconds remaining until next code
  period: number;       // Time step period
  progress: number;     // Progress 0-1 (how much time elapsed)
}

/**
 * Generate a TOTP code from a base32-encoded secret.
 * Implements RFC 6238 / RFC 4226 (HOTP).
 */
export function generateTOTP(params: TOTPParams): TOTPResult {
  const {
    secret,
    period = 30,
    digits = 6,
    algorithm = 'sha1',
    timestamp = Date.now(),
  } = params;

  // 1. Decode base32 secret to raw bytes
  const key = base32Decode(secret);

  // 2. Calculate counter (time-based)
  const epoch = Math.floor(timestamp / 1000);
  const counter = Math.floor(epoch / period);

  // 3. Convert counter to 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  // 4. HMAC-SHA1/SHA256/SHA512
  const alg = algorithm.toLowerCase().replace('-', '');
  const hmac = QuickCrypto.createHmac(alg === 'sha256' ? 'sha256' : alg === 'sha512' ? 'sha512' : 'sha1', key);
  hmac.update(counterBuf);
  const hash = Buffer.from(hmac.digest());

  // 5. Dynamic Truncation (RFC 4226 Section 5.4)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  // 6. Generate code with specified digits
  const mod = Math.pow(10, digits);
  const code = (binary % mod).toString().padStart(digits, '0');

  // 7. Calculate remaining time
  const elapsed = epoch % period;
  const remaining = period - elapsed;
  const progress = elapsed / period;

  return { code, remaining, period, progress };
}

/**
 * Parse an otpauth:// URI into TOTP parameters.
 * Format: otpauth://totp/Label?secret=XXX&issuer=YYY&period=30&digits=6&algorithm=SHA1
 */
export function parseOtpauthURI(uri: string): {
  secret: string;
  issuer: string;
  account: string;
  period: number;
  digits: number;
  algorithm: string;
} | null {
  try {
    if (!uri.startsWith('otpauth://totp/')) return null;

    const path = uri.substring('otpauth://totp/'.length);
    const [labelPart, queryPart] = path.split('?');
    const label = decodeURIComponent(labelPart || '');
    const params = new URLSearchParams(queryPart || '');

    let issuer = params.get('issuer') || '';
    let account = label;

    // Label format can be "issuer:account" or just "account"
    if (label.includes(':')) {
      const parts = label.split(':');
      if (!issuer) issuer = parts[0].trim();
      account = parts.slice(1).join(':').trim();
    }

    return {
      secret: params.get('secret') || '',
      issuer,
      account,
      period: parseInt(params.get('period') || '30') || 30,
      digits: parseInt(params.get('digits') || '6') || 6,
      algorithm: (params.get('algorithm') || 'SHA1').toUpperCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Validate if a string is a valid base32 TOTP secret.
 */
export function isValidTOTPSecret(secret: string): boolean {
  if (!secret || secret.trim().length < 8) return false;
  const cleaned = secret.replace(/[\s-=]/g, '').toUpperCase();
  return /^[A-Z2-7]+$/.test(cleaned);
}
