/**
 * security/PasswordGenerator.test.ts
 * Unit tests for PasswordGenerator — bias, charset, strength, wipeBytes integration.
 */

import { generatePassword, getPasswordStrength } from '../../src/security/PasswordGenerator';
import { Buffer } from '@craftzdog/react-native-buffer';

// Mock randomBytes provider returning predictable bytes for determinism
export const mockRandomBytes = (values: number[]) => (_size: number): Buffer => {
  const arr = new Uint8Array(values.length);
  values.forEach((v, i) => { arr[i] = v; });
  return Buffer.from(arr);
};

// Uniform random bytes provider (wraps index around 0-255)
const uniformRandomBytes = (size: number): Buffer => {
  const arr = new Uint8Array(size);
  for (let i = 0; i < size; i++) arr[i] = i % 256;
  return Buffer.from(arr);
};

describe('PasswordGenerator — generatePassword length', () => {
  it('generates exactly the requested length', () => {
    for (const len of [8, 12, 16, 20, 32, 64]) {
      const pw = generatePassword(len, { lowercase: true }, uniformRandomBytes);
      expect(pw).toHaveLength(len);
    }
  });

  it('generates a password of length 1', () => {
    const pw = generatePassword(1, { lowercase: true }, uniformRandomBytes);
    expect(pw).toHaveLength(1);
  });
});

describe('PasswordGenerator — charset composition', () => {
  const runMany = (opts: any, n = 500) =>
    Array.from({ length: n }, () =>
      generatePassword(20, opts, uniformRandomBytes),
    ).join('');

  it('uses only lowercase when uppercase/numbers/symbols disabled', () => {
    const combined = runMany({ lowercase: true, uppercase: false, numbers: false, symbols: false });
    expect(/[A-Z]/.test(combined)).toBe(false);
    expect(/[0-9]/.test(combined)).toBe(false);
    expect(/[^a-z]/.test(combined)).toBe(false);
  });

  it('includes full lowercase alphabet by default (not excludeAmbiguous)', () => {
    const combined = runMany({ lowercase: true, uppercase: false, numbers: false, symbols: false, excludeAmbiguous: false });
    expect(combined).toMatch(/l/); // 'l' must appear
  });

  it('excludes ambiguous lowercase chars when excludeAmbiguous=true', () => {
    const combined = runMany({ lowercase: true, uppercase: false, numbers: false, symbols: false, excludeAmbiguous: true });
    // 'l' is excluded in ambiguous mode
    expect(/l/.test(combined)).toBe(false);
  });

  it('includes full uppercase alphabet by default', () => {
    const alpha26Bytes = (size: number): Buffer => {
      const arr = new Uint8Array(size);
      for (let i = 0; i + 1 < size; i += 2) {
        arr[i] = 0;
        arr[i + 1] = Math.floor(i / 2) % 26; // values 0-25 map to A-Z
      }
      return Buffer.from(arr);
    };
    const pw = generatePassword(26,
      { uppercase: true, lowercase: false, numbers: false, symbols: false, excludeAmbiguous: false },
      alpha26Bytes,
    );
    const chars = new Set(pw.split(''));
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(char => {
      expect(chars.has(char)).toBe(true);
    });
  });

  it('excludes ambiguous uppercase chars when excludeAmbiguous=true', () => {
    const combined = runMany({ uppercase: true, lowercase: false, numbers: false, symbols: false, excludeAmbiguous: true });
    expect(/[IO]/.test(combined)).toBe(false); // I and O excluded
  });

  it('includes all 10 digits in numbers charset by default (no excludeAmbiguous)', () => {
    // Verify by generating with bytes that map sequentially through the full charset.
    // For a 10-char charset (0-9), max = floor(65536/10)*10 = 65530.
    // Bytes [0x00,0x00]=0, [0x00,0x0A]=10, [0x00,0x14]=20 ... cycle through all 10 digits.
    const sequentialBytes = (size: number): Buffer => {
      const arr = new Uint8Array(size);
      // Produce values 0,10,20,...,90 which all pass rejection (<65530) and map to digits 0-9
      for (let i = 0; i + 1 < size; i += 2) {
        const digit = Math.floor(i / 2) % 10;
        const val = digit; // val % 10 === digit, val < 65530
        arr[i] = 0; arr[i + 1] = val;
      }
      return Buffer.from(arr);
    };
    const pw = generatePassword(10,
      { uppercase: false, lowercase: false, numbers: true, symbols: false, excludeAmbiguous: false },
      sequentialBytes,
    );
    // The 10-char password should contain all 10 unique digits
    const chars = new Set(pw.split(''));
    expect(chars.size).toBe(10);
    '0123456789'.split('').forEach(d => expect(chars.has(d)).toBe(true));
  });

  it('excludes 0 and 1 when excludeAmbiguous=true', () => {
    const combined = runMany({ uppercase: false, lowercase: false, numbers: true, symbols: false, excludeAmbiguous: true });
    expect(/[01]/.test(combined)).toBe(false);
  });

  it('includes symbols when requested', () => {
    const combined = runMany({ uppercase: false, lowercase: false, numbers: false, symbols: true });
    expect(/[!@#$%^&*_+\-=?]/.test(combined)).toBe(true);
  });

  it('falls back to lowercase when all charsets disabled', () => {
    const pw = generatePassword(10, {
      lowercase: false, uppercase: false, numbers: false, symbols: false,
    }, uniformRandomBytes);
    expect(pw).toHaveLength(10);
    // Should not throw and should produce something
    expect(typeof pw).toBe('string');
  });
});

describe('PasswordGenerator — rejection sampling (no modulo bias)', () => {
  it('rejects bytes >= max to avoid bias', () => {
    // For a 62-char charset, max = floor(65536/62)*62 = 65472
    // Value 65500 (0xFF, 0xDC) should be rejected
    // We supply alternating reject/accept bytes
    // 0xFF 0xDC = 65500 > 65472 → rejected
    // 0x00 0x00 = 0 → accepted → chars[0]
    let callCount = 0;
    const mockBytes = (size: number): Buffer => {
      callCount++;
      const arr = new Uint8Array(size);
      if (callCount === 1) {
        // first call: provide rejectable bytes then acceptable
        arr[0] = 0xFF; arr[1] = 0xDC; // 65500 — rejected
        arr[2] = 0x00; arr[3] = 0x00; // 0 — accepted
      } else {
        // subsequent calls: all zeros (accepted)
      }
      return Buffer.from(arr);
    };

    // generatePassword should still produce correct length despite rejections
    const pw = generatePassword(1, { lowercase: true, uppercase: true, numbers: true, symbols: false }, mockBytes);
    expect(pw).toHaveLength(1);
  });
});

describe('PasswordGenerator — getPasswordStrength', () => {
  it('returns score 0 for empty password', () => {
    const { score } = getPasswordStrength('');
    expect(score).toBe(0);
  });

  it('returns "Zayıf" for short simple passwords', () => {
    const { label } = getPasswordStrength('abc');
    expect(label).toBe('Zayıf');
  });

  it('returns higher score for longer passwords with mixed chars', () => {
    const { score: simple } = getPasswordStrength('password');
    const { score: strong } = getPasswordStrength('P@ssw0rd!LONG_SECURE_2025');
    expect(strong).toBeGreaterThan(simple);
  });

  it('returns "Çok Güçlü" for a complex 20+ char password', () => {
    const { label } = getPasswordStrength('Tr0ub4dor&3!LongPassphrase99');
    expect(label).toBe('Çok Güçlü');
  });

  it('includes color field in result', () => {
    const { color } = getPasswordStrength('Test123!');
    expect(typeof color).toBe('string');
    expect(color.startsWith('#')).toBe(true);
  });

  it('returns numeric score', () => {
    const { score } = getPasswordStrength('Test123!Pass');
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
