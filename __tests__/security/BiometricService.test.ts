/**
 * security/BiometricService.test.ts
 * Unit tests for BiometricService — validation, derivation input, migration, rotation policy.
 */

import {
  isValidPublicKey,
  isValidBiometricSecret,
  buildBiometricDerivationInput,
  needsBiometricMigration,
  isBiometricKeyRotationDue,
  BIOMETRIC_KEY_ROTATION_DAYS,
  MIN_PUBLIC_KEY_LENGTH,
  MIN_SECRET_HEX_LENGTH,
} from '../../src/security/BiometricService';

describe('BiometricService — isValidPublicKey', () => {
  it('accepts a valid base64-encoded RSA public key', () => {
    const key = 'A'.repeat(MIN_PUBLIC_KEY_LENGTH);
    expect(isValidPublicKey(key)).toBe(true);
  });

  it('accepts a real PEM-like key', () => {
    const pem = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA`.repeat(2);
    expect(isValidPublicKey(pem)).toBe(true);
  });

  it('rejects short strings', () => {
    expect(isValidPublicKey('abc')).toBe(false);
    expect(isValidPublicKey('A'.repeat(MIN_PUBLIC_KEY_LENGTH - 1))).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidPublicKey(null)).toBe(false);
    expect(isValidPublicKey(undefined)).toBe(false);
    expect(isValidPublicKey(123)).toBe(false);
    expect(isValidPublicKey({})).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPublicKey('')).toBe(false);
  });
});

describe('BiometricService — isValidBiometricSecret', () => {
  it('accepts valid 64-char hex (32 bytes)', () => {
    const secret = 'a'.repeat(64);
    expect(isValidBiometricSecret(secret)).toBe(true);
  });

  it('accepts mixed-case hex', () => {
    const secret = 'aAbBcCdDeEfF0123456789abcdef012345678901234567890123456789012345';
    expect(isValidBiometricSecret(secret)).toBe(true);
  });

  it('rejects secrets shorter than minimum', () => {
    expect(isValidBiometricSecret('a'.repeat(MIN_SECRET_HEX_LENGTH - 1))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidBiometricSecret('g'.repeat(64))).toBe(false);
    expect(isValidBiometricSecret('xyz'.repeat(20))).toBe(false);
    expect(isValidBiometricSecret('!!@@##$$'.repeat(8))).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidBiometricSecret(null)).toBe(false);
    expect(isValidBiometricSecret(undefined)).toBe(false);
    expect(isValidBiometricSecret(42)).toBe(false);
  });
});

describe('BiometricService — buildBiometricDerivationInput', () => {
  const publicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA';
  const deviceSalt = 'aabbccdd1122334455667788aabbccdd';

  it('includes domain separator, version, publicKey, and salt', () => {
    const input = buildBiometricDerivationInput({
      publicKey,
      deviceSalt,
      version: 'v2_secure_storage',
    });
    expect(input).toContain('aegis_biometric_unlock_');
    expect(input).toContain('v2_secure_storage');
    expect(input).toContain(publicKey.trim());
    expect(input).toContain(deviceSalt);
  });

  it('produces different output for different versions (domain separation)', () => {
    const v1 = buildBiometricDerivationInput({ publicKey, deviceSalt, version: 'v1_legacy' });
    const v2 = buildBiometricDerivationInput({ publicKey, deviceSalt, version: 'v2_secure_storage' });
    expect(v1).not.toBe(v2);
  });

  it('produces different output for different salts', () => {
    const salt1 = buildBiometricDerivationInput({ publicKey, deviceSalt: 'salt1', version: 'v2_secure_storage' });
    const salt2 = buildBiometricDerivationInput({ publicKey, deviceSalt: 'salt2', version: 'v2_secure_storage' });
    expect(salt1).not.toBe(salt2);
  });

  it('produces different output for different public keys', () => {
    const key1 = buildBiometricDerivationInput({ publicKey: 'AAAA', deviceSalt, version: 'v2_secure_storage' });
    const key2 = buildBiometricDerivationInput({ publicKey: 'BBBB', deviceSalt, version: 'v2_secure_storage' });
    expect(key1).not.toBe(key2);
  });

  it('is deterministic — same input always produces same output', () => {
    const params = { publicKey, deviceSalt, version: 'v2_secure_storage' as const };
    expect(buildBiometricDerivationInput(params)).toBe(buildBiometricDerivationInput(params));
  });

  it('trims whitespace from publicKey', () => {
    const withSpaces = buildBiometricDerivationInput({ publicKey: `  ${publicKey}  `, deviceSalt, version: 'v2_secure_storage' });
    const without = buildBiometricDerivationInput({ publicKey, deviceSalt, version: 'v2_secure_storage' });
    expect(withSpaces).toBe(without);
  });
});

describe('BiometricService — needsBiometricMigration', () => {
  it('returns true when legacy key exists and no secure storage secret', () => {
    expect(needsBiometricMigration(true, false)).toBe(true);
  });

  it('returns false when secure storage secret already exists', () => {
    expect(needsBiometricMigration(true, true)).toBe(false);
  });

  it('returns false when no legacy key exists', () => {
    expect(needsBiometricMigration(false, false)).toBe(false);
    expect(needsBiometricMigration(false, true)).toBe(false);
  });
});

describe('BiometricService — isBiometricKeyRotationDue', () => {
  it('returns true for null stored date', () => {
    expect(isBiometricKeyRotationDue(null)).toBe(true);
  });

  it('returns true for invalid date string', () => {
    expect(isBiometricKeyRotationDue('not-a-date')).toBe(true);
    expect(isBiometricKeyRotationDue('')).toBe(true);
  });

  it('returns false for a key stored recently', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isBiometricKeyRotationDue(yesterday)).toBe(false);
  });

  it('returns false for a key stored just under the rotation threshold', () => {
    const almostDue = new Date(
      Date.now() - (BIOMETRIC_KEY_ROTATION_DAYS - 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isBiometricKeyRotationDue(almostDue)).toBe(false);
  });

  it('returns true for a key stored exactly at the rotation threshold', () => {
    const exactlyDue = new Date(
      Date.now() - BIOMETRIC_KEY_ROTATION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isBiometricKeyRotationDue(exactlyDue)).toBe(true);
  });

  it('returns true for an old key stored over a year ago', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(isBiometricKeyRotationDue(old)).toBe(true);
  });
});
