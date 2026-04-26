/**
 * BiometricService — Aegis Vault Android
 * Extracted from SecurityModule.ts.
 * Pure helpers for biometric key material validation and derivation path logic.
 *
 * Biyometrik Servis — Anahtar doğrulama ve türetme yardımcıları.
 * Donanım bağımlılığı olmadan test edilebilir saf fonksiyonlar.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum acceptable public key length (Base64 PEM without headers ~ 200 chars) */
export const MIN_PUBLIC_KEY_LENGTH = 64;

/** Minimum acceptable biometric unlock secret length (hex-encoded 32 bytes) */
export const MIN_SECRET_HEX_LENGTH = 32;

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * Validates that a biometric public key string is well-formed.
 * Does NOT verify cryptographic validity — just structural sanity.
 */
export const isValidPublicKey = (key: unknown): key is string =>
  typeof key === 'string' && key.trim().length >= MIN_PUBLIC_KEY_LENGTH;

/**
 * Validates that a biometric unlock secret is well-formed hex string.
 */
export const isValidBiometricSecret = (secret: unknown): secret is string =>
  typeof secret === 'string' &&
  secret.length >= MIN_SECRET_HEX_LENGTH &&
  /^[0-9a-fA-F]+$/.test(secret);

// ── Derivation input builder ──────────────────────────────────────────────────

export interface BiometricDerivationInput {
  publicKey: string;
  deviceSalt: string;
  /** Distinguishes legacy (pre-v2) key storage paths from new path. */
  version: 'v1_legacy' | 'v2_secure_storage';
}

/**
 * Builds a deterministic, domain-separated derivation input string
 * from public key + device salt. Used as Argon2id password input.
 *
 * Domain separation prevents cross-purpose key reuse.
 */
export const buildBiometricDerivationInput = (
  input: BiometricDerivationInput,
): string => {
  const { publicKey, deviceSalt, version } = input;
  // Domain separator ensures derived key is scoped to biometric unlock only.
  return `aegis_biometric_unlock_${version}:${publicKey.trim()}:${deviceSalt}`;
};

// ── Migration check ───────────────────────────────────────────────────────────

/**
 * Determines if biometric keys need to be migrated from legacy file-based
 * storage to SecureStorage (v2).
 *
 * Migration is required when:
 * 1. A legacy public key file exists on disk, AND
 * 2. No v2 secret exists in SecureStorage.
 */
export const needsBiometricMigration = (
  hasLegacyKeyFile: boolean,
  hasSecureStorageSecret: boolean,
): boolean => hasLegacyKeyFile && !hasSecureStorageSecret;

// ── Key rotation policy ───────────────────────────────────────────────────────

/** Recommend key rotation if the stored key is older than this many days. */
export const BIOMETRIC_KEY_ROTATION_DAYS = 180;

export const isBiometricKeyRotationDue = (storedAtISO: string | null): boolean => {
  if (!storedAtISO) return true; // No timestamp → treat as stale
  const storedAt = new Date(storedAtISO).getTime();
  if (!Number.isFinite(storedAt)) return true;
  const ageDays = (Date.now() - storedAt) / (1000 * 60 * 60 * 24);
  return ageDays >= BIOMETRIC_KEY_ROTATION_DAYS;
};
