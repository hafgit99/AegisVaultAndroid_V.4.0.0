/**
 * security/CryptoService.test.ts
 * Unit tests for CryptoService — PRAGMA builder, wipeBytes, hex key validation.
 */

import {
  buildSqlCipherRawKeyPragma,
  wipeBytes,
  SQLCIPHER_HEX_KEY_PATTERN,
} from '../../src/security/CryptoService';

describe('CryptoService — SQLCIPHER_HEX_KEY_PATTERN', () => {
  it('matches exactly 64 lowercase hex chars', () => {
    expect(SQLCIPHER_HEX_KEY_PATTERN.test('a'.repeat(64))).toBe(true);
  });

  it('matches exactly 64 uppercase hex chars', () => {
    expect(SQLCIPHER_HEX_KEY_PATTERN.test('A'.repeat(64))).toBe(true);
  });

  it('matches mixed-case 64-char hex string', () => {
    const key = 'aAbBcCdDeEfF0123456789abcdef012345678901234567890123456789abcdef';
    expect(SQLCIPHER_HEX_KEY_PATTERN.test(key)).toBe(true);
  });

  it('rejects strings shorter than 64 chars', () => {
    expect(SQLCIPHER_HEX_KEY_PATTERN.test('a'.repeat(63))).toBe(false);
  });

  it('rejects strings longer than 64 chars', () => {
    expect(SQLCIPHER_HEX_KEY_PATTERN.test('a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(SQLCIPHER_HEX_KEY_PATTERN.test('g'.repeat(64))).toBe(false);
    expect(SQLCIPHER_HEX_KEY_PATTERN.test(' '.repeat(64))).toBe(false);
  });
});

describe('CryptoService — buildSqlCipherRawKeyPragma', () => {
  const VALID_KEY = 'a'.repeat(64);

  it('builds correct key PRAGMA', () => {
    const pragma = buildSqlCipherRawKeyPragma('key', VALID_KEY);
    expect(pragma).toBe(`PRAGMA key = "x'${VALID_KEY.toLowerCase()}'";`);
  });

  it('builds correct rekey PRAGMA', () => {
    const pragma = buildSqlCipherRawKeyPragma('rekey', VALID_KEY);
    expect(pragma).toBe(`PRAGMA rekey = "x'${VALID_KEY.toLowerCase()}'";`);
  });

  it('normalizes key to lowercase in output', () => {
    const upperKey = 'A'.repeat(64);
    const pragma = buildSqlCipherRawKeyPragma('key', upperKey);
    expect(pragma).toContain(upperKey.toLowerCase());
    expect(pragma).not.toContain('AAAA');
  });

  it('throws for key shorter than 64 chars', () => {
    expect(() => buildSqlCipherRawKeyPragma('key', 'a'.repeat(63))).toThrow();
  });

  it('throws for key longer than 64 chars', () => {
    expect(() => buildSqlCipherRawKeyPragma('key', 'a'.repeat(65))).toThrow();
  });

  it('throws for non-hex key', () => {
    expect(() => buildSqlCipherRawKeyPragma('key', 'g'.repeat(64))).toThrow();
  });

  it('throws for empty string', () => {
    expect(() => buildSqlCipherRawKeyPragma('key', '')).toThrow();
  });

  it('output wraps key in x-notation preventing SQL string injection', () => {
    const pragma = buildSqlCipherRawKeyPragma('key', VALID_KEY);
    // Must NOT use string quotes around key — that would allow injection
    expect(pragma).toMatch(/x'[0-9a-f]{64}'/);
    // Must NOT contain plain key without x' prefix
    expect(pragma).not.toMatch(/'[0-9a-f]{64}(?<![x]'[0-9a-f]{64})/);
  });
});

describe('CryptoService — wipeBytes', () => {
  it('zeroes all bytes in a Uint8Array', () => {
    const buf = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0xFF]);
    wipeBytes(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0]);
  });

  it('handles null without throwing', () => {
    expect(() => wipeBytes(null)).not.toThrow();
  });

  it('handles undefined without throwing', () => {
    expect(() => wipeBytes(undefined)).not.toThrow();
  });

  it('handles empty buffer', () => {
    const empty = new Uint8Array(0);
    expect(() => wipeBytes(empty)).not.toThrow();
  });

  it('works on Buffer-like objects with .fill()', () => {
    const fakeBuf = { fill: jest.fn(), length: 4 };
    wipeBytes(fakeBuf as any);
    expect(fakeBuf.fill).toHaveBeenCalledWith(0);
  });

  it('zeroes a large 1KB buffer', () => {
    const buf = new Uint8Array(1024).fill(0xFF);
    wipeBytes(buf);
    expect(buf.every(b => b === 0)).toBe(true);
  });
});
