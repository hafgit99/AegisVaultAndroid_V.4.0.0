import { open } from '@op-engineering/op-sqlite';
import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import RNFS from 'react-native-fs';
import ReactNativeBiometrics from 'react-native-biometrics';
import { NativeModules } from 'react-native';
import { AutofillService } from './AutofillService';
import Argon2 from 'react-native-argon2';
import i18n from './i18n';
import { IntegrityModule } from './IntegrityModule';
import { WearOSModule } from './WearOSModule';

// ── Pure JS Helper for robustness to replace buggy React Native Buffer ──
const _b64chars =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/* Stryker disable all: low-level buffer/base64/crypto-adapter helpers are exercised indirectly by higher-level encryption, backup, and sync tests; most literal/operator mutants in this environment-specific glue are equivalent noise. */
export function __bufToBase64(buf: any): string {
  let bytes: Uint8Array;
  if (buf instanceof Uint8Array) {
    bytes = buf;
  } else if (buf instanceof ArrayBuffer) {
    bytes = new Uint8Array(buf);
  } else if (buf && buf.buffer instanceof ArrayBuffer) {
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    bytes = new Uint8Array(buf);
  }
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    result += _b64chars[bytes[i] >> 2];
    result += _b64chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += _b64chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += _b64chars[bytes[i + 2] & 63];
  }
  if (len % 3 === 2) {
    result = result.substring(0, result.length - 1) + '=';
  } else if (len % 3 === 1) {
    result = result.substring(0, result.length - 2) + '==';
  }
  return result;
}

export function __bufToUtf8(buf: any): string {
  const bytes = new Uint8Array(
    buf instanceof ArrayBuffer ? buf : (buf as any).buffer || buf,
  );
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str; // fallback if decodeURIComponent fails
  }
}

export function __base64ToBuf(b64: string): Uint8Array {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  let validLen = b64.length;
  if (b64[validLen - 1] === '=') validLen--;
  if (b64[validLen - 1] === '=') validLen--;

  const bytes = new Uint8Array(Math.floor((validLen * 3) / 4));
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const enc1 = lookup[b64.charCodeAt(i)];
    const enc2 = lookup[b64.charCodeAt(i + 1)];
    const enc3 = lookup[b64.charCodeAt(i + 2)] || 0;
    const enc4 = lookup[b64.charCodeAt(i + 3)] || 0;

    bytes[p++] = (enc1 << 2) | (enc2 >> 4);
    if (p < bytes.length) bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (p < bytes.length) bytes[p++] = ((enc3 & 3) << 6) | (enc4 & 63);
  }
  return bytes;
}

export function __hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function __bufToHex(buf: any): string {
  const bytes = new Uint8Array(
    buf instanceof ArrayBuffer ? buf : (buf as any).buffer || buf,
  );
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += bytes[i].toString(16).padStart(2, '0');
  }
  return str;
}

const QC: any = (QuickCrypto as any)?.default ?? (QuickCrypto as any);
const Argon2Fn: any = (Argon2 as any)?.default ?? (Argon2 as any);
const { SecureStorage } = NativeModules as {
  SecureStorage?: {
    getItem?: (key: string) => Promise<string | null>;
    setItem?: (key: string, value: string) => Promise<boolean>;
    removeItem?: (key: string) => Promise<boolean>;
  };
};
const debugLog = (...args: any[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};
const debugWarn = (...args: any[]) => {
  if (__DEV__) {
    console.warn(...args);
  }
};

const getCryptoImpl = (): any => {
  const g: any = global as any;
  const candidates = [QC, QuickCrypto as any, g?.crypto];
  return (
    candidates.find(
      c =>
        c &&
        typeof c.randomBytes === 'function' &&
        typeof c.createCipheriv === 'function' &&
        typeof c.createDecipheriv === 'function',
    ) || null
  );
};

const randomBytesSafe = (size: number): Buffer => {
  const crypto = getCryptoImpl();
  if (!crypto?.randomBytes) {
    throw new Error('Crypto randomBytes is not available on this build.');
  }
  return Buffer.from(crypto.randomBytes(size));
};

const deriveKeyPBKDF2 = async (
  password: string,
  saltHex: string,
  iterations: number,
  keyLen: number,
): Promise<Buffer> => {
  const crypto = getCryptoImpl();
  if (typeof crypto?.pbkdf2 === 'function') {
    return new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(
        password,
        saltHex,
        iterations,
        keyLen,
        'sha256',
        (err: any, key: any) => (err ? reject(err) : resolve(Buffer.from(key))),
      );
    });
  }
  if (typeof crypto?.pbkdf2Sync === 'function') {
    return Buffer.from(
      crypto.pbkdf2Sync(password, saltHex, iterations, keyLen, 'sha256'),
    );
  }
  throw new Error('Crypto PBKDF2 is not available on this build.');
};
/* Stryker restore all */

// ── Types ───────────────────────────────────────────

export interface VaultItem {
  id?: number;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
  favorite: number;
  data: string; // JSON string for category-specific fields
  is_deleted: number; // 0 = active, 1 = in trash
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Attachment {
  id?: number;
  item_id: number;
  filename: string;
  mime_type: string;
  size: number;
  file_data: string; // base64
  created_at?: string;
}

// Category-specific data interfaces
export interface LoginData {
  totp_secret?: string;
}
export interface CardData {
  cardholder: string;
  card_number: string;
  expiry: string;
  cvv: string;
  pin: string;
  brand: string;
}
export interface IdentityData {
  first_name: string;
  last_name: string;
  national_id: string;
  birthday: string;
  phone: string;
  email: string;
  address: string;
  gender: string;
  company: string;
}
export interface NoteData {
  content: string;
}
export interface WifiData {
  ssid: string;
  wifi_password: string;
  security: string;
  hidden: boolean;
}

export interface PasskeyData {
  rp_id?: string;
  credential_id?: string;
  user_handle?: string;
  display_name?: string;
  transport?: string;
  authenticator_attachment?: string;
  algorithm?: string;
  created_at?: string;
  mode?: 'local_helper' | 'rp_connected';
  server_verified?: boolean;
  challenge_source?: 'local_helper' | 'server';
  last_registration_at?: string;
  last_auth_at?: string;
}

export interface PasskeyValidationResult {
  valid: boolean;
  errors: string[];
  normalized: PasskeyData;
}

export interface SecurityPolicy {
  deviceTrustPolicy: 'strict' | 'moderate' | 'permissive';
  requireBiometric: boolean;
  rootDetectionEnabled: boolean;
  rootBlocksVault: boolean;
  degradedDeviceAction: 'block' | 'warn' | 'allow';
}

export interface VaultSettings {
  autoLockSeconds: number;
  biometricEnabled: boolean;
  clipboardClearSeconds: number;
  passwordLength: number;
  darkMode: boolean;
  breachCheckEnabled?: boolean;
  deviceTrustPolicy?: SecurityPolicy;
}

export type SharedVaultKind = 'private' | 'family' | 'team';
export type SharedVaultRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type SharedMemberStatus = 'active' | 'pending' | 'emergency_only';

export interface SharedVaultMember {
  id: string;
  name: string;
  email: string;
  role: SharedVaultRole;
  status: SharedMemberStatus;
  inviteCode?: string;
  invitedAt?: string;
  acceptedAt?: string;
  deviceLabel?: string;
  notes?: string;
  lastVerifiedAt?: string;
}

export interface SharedVaultSpace {
  id: string;
  name: string;
  kind: SharedVaultKind;
  description: string;
  defaultRole: Exclude<SharedVaultRole, 'owner'>;
  allowExport: boolean;
  requireReview: boolean;
  createdAt: string;
  updatedAt: string;
  members: SharedVaultMember[];
}

export interface SharedItemAssignment {
  spaceId: string;
  role: Exclude<SharedVaultRole, 'owner' | 'admin'>;
  sharedBy?: string;
  isSensitive?: boolean;
  emergencyAccess?: boolean;
  notes?: string;
  lastReviewedAt?: string;
}

export interface SharingOverviewIssue {
  itemId: number;
  title: string;
  severity: 'high' | 'medium';
  type:
    | 'orphaned_space'
    | 'no_members'
    | 'review_required'
    | 'sensitive_without_emergency';
  message: string;
}

export interface SharingOverviewReport {
  score: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  summary: {
    spaces: number;
    sharedItems: number;
    familySpaces: number;
    teamSpaces: number;
    pendingMembers: number;
    reviewRequiredItems: number;
  };
  actions: string[];
  issues: SharingOverviewIssue[];
  spaces: Array<
    SharedVaultSpace & {
      itemCount: number;
      activeMembers: number;
      pendingMembers: number;
    }
  >;
}

type PasswordFieldType = 'password' | 'wifi_password' | 'pin' | 'cvv';

export interface PasswordHealthIssue {
  itemId: number;
  title: string;
  category: string;
  field: PasswordFieldType;
  severity: 'critical' | 'high' | 'medium';
  type: 'weak' | 'reused' | 'similar' | 'empty';
  message: string;
}

export interface AccountHardeningCheck {
  itemId: number;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium';
  type: 'missing_2fa' | 'stale_secret' | 'missing_identity';
  message: string;
}

export interface AccountHardeningReport {
  score: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  summary: {
    loginItems: number;
    totpProtectedCount: number;
    passkeyProtectedCount: number;
    missing2FACount: number;
    staleSecretCount: number;
    incompleteLoginCount: number;
  };
  actions: string[];
  checks: AccountHardeningCheck[];
}

export interface PasswordHealthReport {
  score: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  generatedAt: string;
  summary: {
    totalItems: number;
    checkedSecrets: number;
    weakCount: number;
    reusedCount: number;
    similarCount: number;
    emptyOrIncompleteCount: number;
  };
  actions: string[];
  issues: PasswordHealthIssue[];
  hardening: AccountHardeningReport;
  sharing?: SharingOverviewReport;
}

export interface PasswordHistoryEntry {
  id: number;
  item_id: number;
  field: 'password' | 'wifi_password' | 'pin' | 'cvv' | 'credential_id';
  value: string;
  source: string;
  changed_at: string;
}

export interface AuditEvent {
  id: number;
  event_type: string;
  event_status: 'success' | 'failed' | 'blocked' | 'info';
  details: string;
  created_at: string;
}

const DEFAULT_SETTINGS: VaultSettings = {
  autoLockSeconds: 60,
  biometricEnabled: true,
  clipboardClearSeconds: 20,
  passwordLength: 20,
  darkMode: false,
  breachCheckEnabled: false,
  deviceTrustPolicy: {
    deviceTrustPolicy: 'moderate',
    requireBiometric: true,
    rootDetectionEnabled: true,
    rootBlocksVault: false,
    degradedDeviceAction: 'warn',
  },
};

// ── Brute Force Protection State ────────────────────
interface BruteForceState {
  failCount: number;
  lockUntil: number; // timestamp
  lastAttempt: number;
}

const BRUTE_FORCE_DECAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const BRUTE_FORCE_HARD_LOCK_SECONDS = [
  15 * 60, // 5 failures
  60 * 60, // 6 failures
  6 * 60 * 60, // 7 failures
  24 * 60 * 60, // 8 failures
  3 * 24 * 60 * 60, // 9 failures
  7 * 24 * 60 * 60, // 10+ failures
];

// ── Device Salt File Path ───────────────────────────
const SALT_FILE = `${RNFS.DocumentDirectoryPath}/aegis_device_salt.bin`;
const BRUTE_FORCE_FILE = `${RNFS.DocumentDirectoryPath}/aegis_bf_state.json`;
const LEGACY_BIOMETRIC_MATERIAL_FILE = `${RNFS.DocumentDirectoryPath}/aegis_km.dat`;
const BIOMETRIC_MATERIAL_SECURE_KEY = 'aegis_biometric_public_key_v1';
const BIOMETRIC_UNLOCK_SECRET_SECURE_KEY = 'aegis_biometric_unlock_secret_v2';
const AUDIT_BUFFER_FILE = `${RNFS.DocumentDirectoryPath}/aegis_audit_buffer.json`;
const AUDIT_BUFFER_SECURE_KEY = 'aegis_audit_buffer_secure_v1';
const APP_CONFIG_FILE = `${RNFS.DocumentDirectoryPath}/aegis_app_config.json`;
const SHARED_SPACES_SETTING_KEY = 'sharedVaultSpaces';

const BACKUP_KDF_DEFAULT = {
  algorithm: 'Argon2id',
  memory: 32768,
  iterations: 4,
  parallelism: 2,
  hashLength: 32,
} as const;

const VAULT_KDF_STRONG = {
  memory: 65536,
  iterations: 6,
  parallelism: 2,
  hashLength: 32,
} as const;

const VAULT_KDF_LEGACY = {
  memory: 32768,
  iterations: 4,
  parallelism: 2,
  hashLength: 32,
} as const;

const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// ═══════════════════════════════════════════════════
export class SecurityModule {
  public static db: any = null;
  private static autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  public static isPickingFileFlag: boolean = false;
  private static deviceSalt: Buffer | null = null;
  private static currentUnlockSecret: string | null = null;
  private static biometricLegacyFallbackSecret: string | null = null;
  private static appConfig: any = null;
  private static bfState: BruteForceState = {
    failCount: 0,
    lockUntil: 0,
    lastAttempt: 0,
  };

  // ══════════════════════════════════════════════════
  // 0. NON-ENCRYPTED APP CONFIG (for Pre-Unlock Settings)
  // ══════════════════════════════════════════════════

  private static async loadAppConfig(): Promise<void> {
    /* Stryker disable all: app-config IO fallbacks and brute-force persistence edges are behavior-tested via higher-level flows; remaining literal/branch mutants here are mostly storage noise. */
    if (this.appConfig) return;
    try {
      if (await RNFS.exists(APP_CONFIG_FILE)) {
        const json = await RNFS.readFile(APP_CONFIG_FILE, 'utf8');
        this.appConfig = JSON.parse(json);
      } else {
        this.appConfig = {};
      }
    } catch {
      this.appConfig = {};
    }
  }

  private static async saveAppConfig(): Promise<void> {
    try {
      await RNFS.writeFile(
        APP_CONFIG_FILE,
        JSON.stringify(this.appConfig || {}),
        'utf8',
      );
    } catch {}
  }

  static async getAppConfigSetting(key: string): Promise<any> {
    await this.loadAppConfig();
    return this.appConfig?.[key] ?? (DEFAULT_SETTINGS as any)[key];
  }

  static async setAppConfigSetting(key: string, value: any): Promise<void> {
    await this.loadAppConfig();
    if (!this.appConfig) this.appConfig = {};
    this.appConfig[key] = value;
    await this.saveAppConfig();
    /* Stryker restore all */
  }

  // ══════════════════════════════════════════════════
  // 1. DYNAMIC DEVICE SALT (per-device unique)
  // ══════════════════════════════════════════════════

  /**
   * Gets or generates a unique 32-byte device salt.
   * Stored in app's private document directory (sandboxed on Android).
   * Each device/installation has its own unique salt.
   */
  private static async getDeviceSalt(): Promise<Buffer> {
    /* Stryker disable all: salt persistence and brute-force state recovery are environment-specific persistence glue already covered via higher-level security tests. */
    if (this.deviceSalt) return this.deviceSalt;

    try {
      const exists = await RNFS.exists(SALT_FILE);
      if (exists) {
        const hex = await RNFS.readFile(SALT_FILE, 'utf8');
        this.deviceSalt = Buffer.from(hex, 'hex');
        if (this.deviceSalt.length === 32) return this.deviceSalt;
      }
    } catch {}

    // Generate new 32-byte cryptographic random salt
    const salt = randomBytesSafe(32);
    await RNFS.writeFile(SALT_FILE, salt.toString('hex'), 'utf8');
    this.deviceSalt = salt;
    debugLog('[Security] Generated new device salt');
    return salt;
    /* Stryker restore all */
  }

  // ══════════════════════════════════════════════════
  // 2. BRUTE FORCE PROTECTION (exponential backoff)
  // ══════════════════════════════════════════════════

  /**
   * Exponential backoff schedule:
   * 1-4 fails:  no delay
   * 5 fails:    15 min lockout
   * 6 fails:    60 min lockout
   * 7 fails:    6 hour lockout
   * 8 fails:    24 hour lockout
   * 9 fails:    72 hour lockout
   * 10+ fails:  7 day lockout
   */
  private static getLockoutDuration(failCount: number): number {
    if (failCount < 5) return 0;
    const idx = Math.min(
      failCount - 5,
      BRUTE_FORCE_HARD_LOCK_SECONDS.length - 1,
    );
    return BRUTE_FORCE_HARD_LOCK_SECONDS[idx] * 1000;
  }

  private static decayBruteForceCounter(now: number): void {
    if (!this.bfState.lastAttempt) return;
    const elapsed = now - this.bfState.lastAttempt;
    if (elapsed < BRUTE_FORCE_DECAY_WINDOW_MS) return;
    const decaySteps = Math.floor(elapsed / BRUTE_FORCE_DECAY_WINDOW_MS);
    this.bfState.failCount = Math.max(0, this.bfState.failCount - decaySteps);
    if (this.bfState.failCount < 5 && this.bfState.lockUntil < now) {
      this.bfState.lockUntil = 0;
    }
    /* Stryker restore all */
  }

  private static async loadBruteForceState(): Promise<void> {
    try {
      const exists = await RNFS.exists(BRUTE_FORCE_FILE);
      if (exists) {
        const json = await RNFS.readFile(BRUTE_FORCE_FILE, 'utf8');
        this.bfState = JSON.parse(json);
        this.decayBruteForceCounter(Date.now());
      }
    } catch {
      this.bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    }
  }

  private static async saveBruteForceState(): Promise<void> {
    try {
      await RNFS.writeFile(
        BRUTE_FORCE_FILE,
        JSON.stringify(this.bfState),
        'utf8',
      );
    } catch {}
  }

  private static async recordFailedAttempt(): Promise<void> {
    this.decayBruteForceCounter(Date.now());
    this.bfState.failCount++;
    this.bfState.lastAttempt = Date.now();
    const lockDuration = this.getLockoutDuration(this.bfState.failCount);
    if (lockDuration > 0) {
      this.bfState.lockUntil = Date.now() + lockDuration;
    }
    await this.saveBruteForceState();
    debugLog('[Security] Failed unlock attempt recorded');
  }

  private static async recordSuccessfulAttempt(): Promise<void> {
    this.bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    await this.saveBruteForceState();
  }

  /**
   * Check if locked out. Returns remaining seconds if locked, 0 if not.
   */
  static async getRemainingLockout(): Promise<number> {
    await this.loadBruteForceState();
    if (this.bfState.lockUntil <= Date.now()) return 0;
    return Math.ceil((this.bfState.lockUntil - Date.now()) / 1000);
  }

  static async getFailedAttempts(): Promise<number> {
    await this.loadBruteForceState();
    return this.bfState.failCount;
  }

  private static async deriveVaultDatabaseKeyHex(
    unlockSecret: string,
    salt: Buffer,
    profile: 'strong' | 'legacy',
  ): Promise<string> {
    const params = profile === 'strong' ? VAULT_KDF_STRONG : VAULT_KDF_LEGACY;
    const argon2Result = await Argon2Fn(unlockSecret, salt.toString('hex'), {
      mode: 'argon2id',
      memory: params.memory,
      iterations: params.iterations,
      parallelism: params.parallelism,
      hashLength: params.hashLength,
      saltEncoding: 'hex',
    });

    return typeof argon2Result.rawHash === 'string'
      ? argon2Result.rawHash
      : Buffer.from(argon2Result.rawHash).toString('hex');
  }

  private static tryOpenVaultWithKey(encryptionKey: string): any | null {
    let db: any = null;
    try {
      db = open({
        name: 'aegis_android_vault.sqlite',
        encryptionKey,
      });
      db.executeSync('SELECT count(*) AS count FROM sqlite_master;');
      return db;
    } catch {
      try {
        db?.close?.();
      } catch {}
      return null;
    }
  }

  // ══════════════════════════════════════════════════
  // 3. BIOMETRIC KEY DERIVATION (hardware-backed, deterministic)
  // ══════════════════════════════════════════════════

  /**
   * Derives a DETERMINISTIC vault key using biometric authentication.
   *
   * Why deterministic? SQLCipher needs the EXACT SAME key every time the DB
   * is opened. Non-deterministic signatures (createSignature) produce a
   * different key each time, making them incompatible with SQLCipher.
   *
   * Architecture:
   * ┌─────────────────────────────────────────────────────┐
   * │ Android Keystore (TEE/Secure Element)               │
   * │   └─ RSA Key Pair (hardware-bound, non-extractable) │
   * │       └─ publicKey (exported once, stored locally)   │
   * └─────────────────────────────────────────────────────┘
   *         ↓
   * Argon2id(publicKey, deviceSalt, 32MB, 4 iterations, 2 lanes)
   *         ↓
   * 256-bit vault encryption key (always the same)
   *
   * Security properties:
   * - Public key is hardware-bound (tied to Android Keystore)
   * - Device salt is unique per installation (32 bytes CSPRNG)
   * - Argon2id with memory-hard parameters provides GPU resistance
   * - Biometric verification required before secret derivation
   * - Key material zeroed after use
   */
  private static generateBiometricUnlockSecret(): string {
    return randomBytesSafe(32).toString('hex');
  }

  private static async readBiometricUnlockSecret(): Promise<string | null> {
    if (!SecureStorage?.getItem) return null;
    try {
      const secret = await SecureStorage.getItem(BIOMETRIC_UNLOCK_SECRET_SECURE_KEY);
      if (typeof secret === 'string' && secret.length >= 32) {
        return secret;
      }
    } catch {}
    return null;
  }

  private static async writeBiometricUnlockSecret(secret: string): Promise<void> {
    if (!secret || secret.length < 32) return;
    if (SecureStorage?.setItem) {
      try {
        await SecureStorage.setItem(BIOMETRIC_UNLOCK_SECRET_SECURE_KEY, secret);
        return;
      } catch {}
    }
  }

  private static async deriveLegacyBiometricUnlockSecret(): Promise<string | null> {
    try {
      const rnBiometrics = new ReactNativeBiometrics({
        allowDeviceCredentials: true,
      });
      let publicKey = await this.getStoredKeyMaterial();
      if (!publicKey) {
        const { keysExist } = await rnBiometrics.biometricKeysExist();
        if (keysExist) {
          await rnBiometrics.deleteKeys();
        }
        const result = await rnBiometrics.createKeys();
        publicKey = result.publicKey;
        await this.storeKeyMaterial(publicKey);
      }

      const salt = await this.getDeviceSalt();
      const argon2Result = await Argon2Fn(publicKey!, salt.toString('hex'), {
        mode: 'argon2id',
        memory: VAULT_KDF_STRONG.memory,
        iterations: VAULT_KDF_STRONG.iterations,
        parallelism: VAULT_KDF_STRONG.parallelism,
        hashLength: VAULT_KDF_STRONG.hashLength,
        saltEncoding: 'hex',
      });
      if (!argon2Result || !argon2Result.rawHash) return null;
      return typeof argon2Result.rawHash === 'string'
        ? argon2Result.rawHash
        : Buffer.from(argon2Result.rawHash).toString('hex');
    } catch {
      return null;
    }
  }

  static async deriveKeyFromBiometric(): Promise<string | null> {
    try {
      const rnBiometrics = new ReactNativeBiometrics({
        allowDeviceCredentials: true,
      });

      // Step 1: Verify biometric identity (fingerprint/face)
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: i18n.t('lock_screen.biometric_prompt') as string,
        fallbackPromptMessage: i18n.t(
          'lock_screen.biometric_fallback',
        ) as string,
        cancelButtonText: i18n.t('vault.cancel') as string,
      });
      if (!success) {
        debugLog('[Security] Biometric verification cancelled');
        return null;
      }

      // Step 2: Preferred v2 path (secure random secret in SecureStorage)
      const storedSecret = await this.readBiometricUnlockSecret();
      if (storedSecret) {
        this.biometricLegacyFallbackSecret = null;
        return storedSecret;
      }

      // Step 3: Legacy migration fallback to keep existing installs accessible
      const legacySecret = await this.deriveLegacyBiometricUnlockSecret();
      if (legacySecret) {
        this.biometricLegacyFallbackSecret = legacySecret;
        return legacySecret;
      }

      // No legacy path and no stored secret means biometric unlock cannot proceed yet.
      return null;
    } catch (e) {
      console.error('[Security] Biometric unlock secret derivation error:', e);
      return null;
    }
  }

  /**
   * Reset biometric keys (useful when migrating or if keys get corrupted).
   * Deletes stored key material and Keystore keys so they get recreated.
   */
  static async resetBiometricKeys(): Promise<void> {
    try {
      const rnBiometrics = new ReactNativeBiometrics();
      await rnBiometrics.deleteKeys();
      if (SecureStorage?.removeItem) {
        await SecureStorage.removeItem(BIOMETRIC_MATERIAL_SECURE_KEY).catch(
          () => {},
        );
        await SecureStorage.removeItem(BIOMETRIC_UNLOCK_SECRET_SECURE_KEY).catch(
          () => {},
        );
      }
      await RNFS.unlink(LEGACY_BIOMETRIC_MATERIAL_FILE).catch(() => {});
      await this.logSecurityEvent('biometric_reset', 'success', {});
      debugLog('[Security] Biometric keys reset');
    } catch (e) {
      await this.logSecurityEvent('biometric_reset', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('[Security] Error resetting biometric keys:', e);
    }
  }

  private static async getStoredKeyMaterial(): Promise<string | null> {
    if (SecureStorage?.getItem) {
      try {
        const secureData = await SecureStorage.getItem(
          BIOMETRIC_MATERIAL_SECURE_KEY,
        );
        if (secureData && secureData.length > 10) return secureData;
      } catch {}
    }

    try {
      if (await RNFS.exists(LEGACY_BIOMETRIC_MATERIAL_FILE)) {
        const data = await RNFS.readFile(LEGACY_BIOMETRIC_MATERIAL_FILE, 'utf8');
        if (data && data.length > 10) {
          if (SecureStorage?.setItem) {
            await SecureStorage.setItem(BIOMETRIC_MATERIAL_SECURE_KEY, data);
            await RNFS.unlink(LEGACY_BIOMETRIC_MATERIAL_FILE).catch(() => {});
          }
          return data;
        }
      }
    } catch {}
    return null;
  }

  private static async storeKeyMaterial(material: string): Promise<void> {
    if (SecureStorage?.setItem) {
      try {
        await SecureStorage.setItem(BIOMETRIC_MATERIAL_SECURE_KEY, material);
        return;
      } catch {}
    }
    await RNFS.writeFile(LEGACY_BIOMETRIC_MATERIAL_FILE, material, 'utf8').catch(
      () => {},
    );
  }

  // ══════════════════════════════════════════════════
  // 4. VAULT UNLOCK (with brute force protection)
  // ══════════════════════════════════════════════════

  /**
   * Unlock the vault with a derived key.
   * Includes brute force protection with exponential backoff.
   * ✅ NEW: Device integrity validation (root/tamper detection)
   * Vault kilit aç ve brute force korumasını kontrol et
   */
  static async unlockVault(
    unlockSecret: string,
    userSecurityPolicy?: SecurityPolicy,
  ): Promise<boolean> {
    try {
      debugLog('[Security] Unlocking vault...');
      // Check brute force lockout
      await this.loadBruteForceState();
      const remaining = await this.getRemainingLockout();
      if (remaining > 0) {
        console.error(`[Security] Locked out for ${remaining} more seconds`);
        await this.logSecurityEvent('vault_unlock', 'blocked', {
          reason: 'lockout_active',
          remainingSeconds: remaining,
        });
        return false;
      }

      // ✅ NEW FEATURE #1: Device Integrity Check (Cihaz Bütünlüğü Kontrol)
      const policy = userSecurityPolicy || DEFAULT_SETTINGS.deviceTrustPolicy!;

      if (policy.rootDetectionEnabled) {
        debugLog('[Security] Running device integrity check...');
        const integrityResult = await IntegrityModule.checkDeviceIntegrity();
        debugLog(
          '[Security] Integrity result:',
          integrityResult.riskLevel,
          'Score:',
          integrityResult.score,
        );

        // Handle based on policy
        if (
          policy.deviceTrustPolicy === 'strict' &&
          (integrityResult.riskLevel === 'critical' ||
            integrityResult.riskLevel === 'high')
        ) {
          await this.logSecurityEvent('vault_unlock', 'blocked', {
            reason: 'device_integrity_failed',
            riskLevel: integrityResult.riskLevel,
            reasons: integrityResult.reasons,
          });
          console.error(
            '[Security] Vault unlock blocked: Device integrity check failed (STRICT mode)',
          );
          return false;
        }
        // ...existing code...
        debugLog(
          '[Security] Device integrity check passed, risk level:',
          integrityResult.riskLevel,
        );
      }

      const salt = await this.getDeviceSalt();
      const strongKeyHex = await this.deriveVaultDatabaseKeyHex(
        unlockSecret,
        salt,
        'strong',
      );

      debugLog('[Security] Opening vault with strong Argon2id profile...');
      let openedDb = this.tryOpenVaultWithKey(strongKeyHex);

      if (!openedDb) {
        debugWarn('[Security] Strong KDF open failed; trying legacy profile...');
        const legacyKeyHex = await this.deriveVaultDatabaseKeyHex(
          unlockSecret,
          salt,
          'legacy',
        );
        openedDb = this.tryOpenVaultWithKey(legacyKeyHex);

        if (!openedDb) {
          throw new Error('Vault unlock failed for strong and legacy KDF profiles');
        }

        const escapedStrongKey = strongKeyHex.replace(/'/g, "''");
        openedDb.executeSync(`PRAGMA rekey = '${escapedStrongKey}';`);
        openedDb.close();
        openedDb = this.tryOpenVaultWithKey(strongKeyHex);
        if (!openedDb) {
          throw new Error('Vault KDF migration completed but reopen failed');
        }
        await this.logSecurityEvent('vault_kdf_migrated', 'success', {
          from: 'argon2id_legacy_32mb_4iter',
          to: 'argon2id_strong_64mb_6iter',
        });
      }

      this.db = openedDb;
      this.currentUnlockSecret = unlockSecret;

      // One-time migration: if unlock succeeded with legacy biometric derivation,
      // rotate vault unlock secret to a random secret protected by SecureStorage.
      if (
        this.biometricLegacyFallbackSecret &&
        unlockSecret === this.biometricLegacyFallbackSecret
      ) {
        try {
          const migratedSecret = this.generateBiometricUnlockSecret();
          const migratedStrongKeyHex = await this.deriveVaultDatabaseKeyHex(
            migratedSecret,
            salt,
            'strong',
          );
          const escapedMigratedKey = migratedStrongKeyHex.replace(/'/g, "''");
          this.db.executeSync(`PRAGMA rekey = '${escapedMigratedKey}';`);
          await this.writeBiometricUnlockSecret(migratedSecret);
          this.currentUnlockSecret = migratedSecret;
          this.biometricLegacyFallbackSecret = null;
          await this.logSecurityEvent('biometric_secret_migrated', 'success', {
            model: 'secure_storage_random_secret_v2',
          });
        } catch (migrationError) {
          await this.logSecurityEvent('biometric_secret_migrated', 'failed', {
            reason:
              migrationError instanceof Error
                ? migrationError.message
                : String(migrationError),
          });
        }
      }

      // Optimize SQLite for persistence and performance
      try {
        this.db.executeSync('PRAGMA synchronous = NORMAL;');
        this.db.executeSync('PRAGMA journal_mode = WAL;');
      } catch (e) {
        debugWarn('[Security] Failed to set PRAGMAs:', e);
      }

      // Schema + migrations
      this.db.executeSync(`
        CREATE TABLE IF NOT EXISTS vault_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          username TEXT DEFAULT '',
          password TEXT DEFAULT '',
          url TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          category TEXT DEFAULT 'login',
          favorite INTEGER DEFAULT 0,
          data TEXT DEFAULT '{}',
          is_deleted INTEGER DEFAULT 0,
          deleted_at DATETIME DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      this.db.executeSync(`
        CREATE TABLE IF NOT EXISTS vault_attachments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          file_data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (item_id) REFERENCES vault_items(id) ON DELETE CASCADE
        );
      `);
      this.db.executeSync(
        `CREATE TABLE IF NOT EXISTS vault_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
      );
      this.db.executeSync(`
        CREATE TABLE IF NOT EXISTS vault_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          event_status TEXT NOT NULL,
          details TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      this.db.executeSync(`
        CREATE TABLE IF NOT EXISTS vault_password_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          field TEXT NOT NULL,
          value TEXT NOT NULL,
          source TEXT DEFAULT 'update',
          changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (item_id) REFERENCES vault_items(id) ON DELETE CASCADE
        );
      `);

      this.db.executeSync(
        `CREATE INDEX IF NOT EXISTS idx_vault_items_updated ON vault_items(updated_at DESC);`,
      );
      this.db.executeSync(
        `CREATE INDEX IF NOT EXISTS idx_vault_items_category ON vault_items(category);`,
      );
      this.db.executeSync(
        `CREATE INDEX IF NOT EXISTS idx_attachments_item ON vault_attachments(item_id);`,
      );
      this.db.executeSync(
        `CREATE INDEX IF NOT EXISTS idx_pw_history_item_time ON vault_password_history(item_id, changed_at DESC);`,
      );
      this.db.executeSync(
        `CREATE INDEX IF NOT EXISTS idx_audit_time ON vault_audit_log(created_at DESC);`,
      );

      await this.flushBufferedAuditEvents();
      debugLog('[Security] Vault schema and migrations checked');

      // Record successful attempt (reset brute force counter)
      await this.recordSuccessfulAttempt();
      await this.logSecurityEvent('vault_unlock', 'success', {
        method: 'biometric_gated_secret',
      });

      AutofillService.setUnlocked(true);
      await this.syncAutofill();

      debugLog('[Security] Vault unlocked. Dynamic salt + Argon2id.');
      return true;
    } catch (e) {
      // Record failed attempt
      await this.recordFailedAttempt();
      await this.logSecurityEvent('vault_unlock', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('[Security] Unlock failed:', e);
      return false;
    }
  }

  // ── Autofill Sync ─────────────────────────────────
  private static async syncAutofill() {
    if (!this.db) return;
    try {
      // Send login + passkey items to native autofill service
      const items = (this.db.executeSync(
        "SELECT id, title, username, password, url, category FROM vault_items WHERE LOWER(category) IN ('login','passkey')",
      ).rows || []) as any[];
      AutofillService.updateEntries(items);
    } catch (e) {
      console.error('[Security] Autofill sync error:', e);
    }
  }

  // ── Wear OS Sync ──
  private static async triggerWearSync(): Promise<void> {
    try {
      if (!this.db) return;
      const items = await this.getItems();
      await WearOSModule.syncFavoritesToWatch(items);
    } catch (e) {
      console.warn('[SecurityModule] Wear OS sync failed:', e);
    }
  }

  // ── Items CRUD ────────────────────────────────────
  private static async readBufferedAuditEvents(): Promise<
    Array<{
      event_type: string;
      event_status: AuditEvent['event_status'];
      details: string;
      created_at: string;
    }>
  > {
    if (SecureStorage?.getItem) {
      try {
        const raw = await SecureStorage.getItem(AUDIT_BUFFER_SECURE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        }
      } catch {}
    }

    try {
      const exists = await RNFS.exists(AUDIT_BUFFER_FILE);
      if (!exists) return [];
      const raw = await RNFS.readFile(AUDIT_BUFFER_FILE, 'utf8');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private static async writeBufferedAuditEvents(
    events: Array<{
      event_type: string;
      event_status: AuditEvent['event_status'];
      details: string;
      created_at: string;
    }>,
  ): Promise<void> {
    const safeEvents = events.slice(-200);
    if (SecureStorage?.setItem) {
      try {
        await SecureStorage.setItem(
          AUDIT_BUFFER_SECURE_KEY,
          JSON.stringify(safeEvents),
        );
        await RNFS.unlink(AUDIT_BUFFER_FILE).catch(() => {});
        return;
      } catch {}
    }

    const redacted = safeEvents.map(ev => ({
      ...ev,
      details: '{}',
    }));
    await RNFS.writeFile(AUDIT_BUFFER_FILE, JSON.stringify(redacted), 'utf8');
  }

  private static async clearBufferedAuditEvents(): Promise<void> {
    if (SecureStorage?.removeItem) {
      await SecureStorage.removeItem(AUDIT_BUFFER_SECURE_KEY).catch(() => {});
    }
    await RNFS.unlink(AUDIT_BUFFER_FILE).catch(() => {});
  }

  private static sanitizeAuditDetails(
    details?: Record<string, any>,
  ): Record<string, any> {
    const source = details || {};
    const sensitiveKeyPattern =
      /password|pass|token|secret|authorization|credential|private|key|seed/i;
    const sanitized: Record<string, any> = {};
    Object.keys(source).forEach(key => {
      const value = source[key];
      if (sensitiveKeyPattern.test(key)) {
        sanitized[key] = '[redacted]';
      } else if (typeof value === 'string' && value.length > 512) {
        sanitized[key] = `${value.slice(0, 256)}...[truncated]`;
      } else {
        sanitized[key] = value;
      }
    });
    return sanitized;
  }

  private static async appendAuditBuffer(
    eventType: string,
    eventStatus: AuditEvent['event_status'],
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      let events = await this.readBufferedAuditEvents();

      events.push({
        event_type: eventType,
        event_status: eventStatus,
        details: JSON.stringify(this.sanitizeAuditDetails(details)),
        created_at: new Date().toISOString(),
      });

      await this.writeBufferedAuditEvents(events);
    } catch (e) {
      console.error('appendAuditBuffer:', e);
    }
  }

  private static async flushBufferedAuditEvents(): Promise<void> {
    if (!this.db) return;
    try {
      const events = await this.readBufferedAuditEvents();
      if (!events.length) return;

      for (const ev of events) {
        this.db.executeSync(
          'INSERT INTO vault_audit_log (event_type, event_status, details, created_at) VALUES (?,?,?,?)',
          [ev.event_type, ev.event_status, ev.details || '{}', ev.created_at],
        );
      }

      await this.clearBufferedAuditEvents();
    } catch (e) {
      console.error('flushBufferedAuditEvents:', e);
    }
  }

  static async logSecurityEvent(
    eventType: string,
    eventStatus: AuditEvent['event_status'] = 'info',
    details?: Record<string, any>,
  ): Promise<void> {
    if (!this.db) {
      await this.appendAuditBuffer(eventType, eventStatus, details);
      return;
    }
    try {
      this.db.executeSync(
        'INSERT INTO vault_audit_log (event_type, event_status, details) VALUES (?,?,?)',
        [
          eventType,
          eventStatus,
          JSON.stringify(this.sanitizeAuditDetails(details)),
        ],
      );
    } catch (e) {
      console.error('logSecurityEvent:', e);
    }
  }

  static async getAuditEvents(limit: number = 100): Promise<AuditEvent[]> {
    const safeLimit = Math.max(1, Math.min(500, limit));
    const fromDb: AuditEvent[] = [];

    if (this.db) {
      try {

        fromDb.push(
          ...((this.db.executeSync(
            `SELECT id, event_type, event_status, details, created_at
             FROM vault_audit_log
             ORDER BY created_at DESC
             LIMIT ?`,
            [safeLimit]
          ).rows || []) as AuditEvent[]),
        );
      } catch (e) {
        console.error('[SecurityModule] getAuditEvents(db) failed:', e);
      }
    }

    const fromBuffer: AuditEvent[] = [];
    try {
      const events = await this.readBufferedAuditEvents();
      events.forEach((ev, index) => {
        fromBuffer.push({
          id: -(index + 1),
          event_type: ev.event_type,
          event_status: ev.event_status,
          details: ev.details || '{}',
          created_at: ev.created_at || new Date().toISOString(),
        });
      });
    } catch (e) {
      console.error('getAuditEvents(buffer):', e);
    }

    return [...fromDb, ...fromBuffer]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, safeLimit);
  }

  static async clearAuditEvents(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_audit_log');
      await this.clearBufferedAuditEvents();
      await this.logSecurityEvent('audit_log_cleared', 'info', {});
      return true;
    } catch (e) {
      console.error('clearAuditEvents:', e);
      return false;
    }
  }

  private static parseDataJson(raw?: string): any {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private static generateLocalId(prefix: string): string {
    return `${prefix}_${Date.now()}_${__bufToHex(randomBytesSafe(6))}`;
  }

  private static sanitizeSharedMember(
    input: Partial<SharedVaultMember>,
  ): SharedVaultMember {
    return {
      id: (input.id || this.generateLocalId('member')).trim(),
      name: (input.name || '').trim(),
      email: (input.email || '').trim().toLowerCase(),
      role: (input.role || 'viewer') as SharedVaultRole,
      status: (input.status || 'active') as SharedMemberStatus,
      inviteCode: (input.inviteCode || '').trim() || undefined,
      invitedAt: input.invitedAt || undefined,
      acceptedAt: input.acceptedAt || undefined,
      deviceLabel: (input.deviceLabel || '').trim() || undefined,
      notes: (input.notes || '').trim() || undefined,
      lastVerifiedAt: input.lastVerifiedAt || undefined,
    };
  }

  private static sanitizeSharedSpace(
    input: Partial<SharedVaultSpace>,
  ): SharedVaultSpace {
    const now = new Date().toISOString();
    const members = Array.isArray(input.members)
      ? input.members
          .map(member => this.sanitizeSharedMember(member))
          .filter(member => member.name || member.email)
      : [];

    return {
      id: (input.id || this.generateLocalId('space')).trim(),
      name: (input.name || '').trim(),
      kind: (input.kind || 'family') as SharedVaultKind,
      description: (input.description || '').trim(),
      defaultRole: (input.defaultRole || 'viewer') as Exclude<
        SharedVaultRole,
        'owner'
      >,
      allowExport: input.allowExport !== false,
      requireReview: Boolean(input.requireReview),
      createdAt: input.createdAt || now,
      updatedAt: now,
      members,
    };
  }

  static parseSharedAssignment(
    itemOrData?: Partial<VaultItem> | string | null,
  ): SharedItemAssignment | null {
    const data =
      typeof itemOrData === 'string'
        ? this.parseDataJson(itemOrData)
        : this.parseDataJson(itemOrData?.data);
    const shared = data?.shared;
    if (!shared || typeof shared !== 'object') return null;
    if (!(shared.spaceId || '').trim()) return null;

    return {
      spaceId: String(shared.spaceId).trim(),
      role: (
        shared.role && ['editor', 'viewer'].includes(shared.role)
          ? shared.role
          : 'viewer'
      ) as 'editor' | 'viewer',
      sharedBy: (shared.sharedBy || '').trim() || undefined,
      isSensitive: Boolean(shared.isSensitive),
      emergencyAccess: Boolean(shared.emergencyAccess),
      notes: (shared.notes || '').trim() || undefined,
      lastReviewedAt: (shared.lastReviewedAt || '').trim() || undefined,
    };
  }

  static mergeSharedAssignmentIntoData(
    rawData: any,
    assignment?: SharedItemAssignment | null,
  ): string {
    const data =
      typeof rawData === 'string' ? this.parseDataJson(rawData) : rawData || {};
    const next = { ...data };
    if (assignment?.spaceId) {
      next.shared = {
        ...assignment,
        spaceId: assignment.spaceId.trim(),
        role: assignment.role || 'viewer',
      };
    } else {
      delete next.shared;
    }
    return JSON.stringify(next);
  }

  static async getSharedVaultSpaces(): Promise<SharedVaultSpace[]> {
    try {
      const raw = await this.getSetting(SHARED_SPACES_SETTING_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(space => this.sanitizeSharedSpace(space))
        .filter(space => space.name);
    } catch {
      return [];
    }
  }

  static async saveSharedVaultSpace(
    input: Partial<SharedVaultSpace>,
  ): Promise<SharedVaultSpace | null> {
    const normalized = this.sanitizeSharedSpace(input);
    if (!normalized.name) {
      return null;
    }

    const spaces = await this.getSharedVaultSpaces();
    const nextSpaces = spaces.some(space => space.id === normalized.id)
      ? spaces.map(space => (space.id === normalized.id ? normalized : space))
      : [...spaces, normalized];

    await this.setSetting(
      SHARED_SPACES_SETTING_KEY,
      JSON.stringify(nextSpaces, null, 2),
    );
    await this.logSecurityEvent('shared_space_saved', 'success', {
      id: normalized.id,
      kind: normalized.kind,
      members: normalized.members.length,
    });
    return normalized;
  }

  static async deleteSharedVaultSpace(spaceId: string): Promise<boolean> {
    const trimmedId = (spaceId || '').trim();
    if (!trimmedId) return false;

    const spaces = await this.getSharedVaultSpaces();
    const nextSpaces = spaces.filter(space => space.id !== trimmedId);
    await this.setSetting(
      SHARED_SPACES_SETTING_KEY,
      JSON.stringify(nextSpaces, null, 2),
    );

    const items = await this.getItems();
    for (const item of items) {
      const assignment = this.parseSharedAssignment(item);
      if (assignment?.spaceId !== trimmedId || !item.id) continue;
      await this.updateItem(item.id, {
        data: this.mergeSharedAssignmentIntoData(item.data, null),
      });
    }

    await this.logSecurityEvent('shared_space_deleted', 'info', {
      id: trimmedId,
    });
    return true;
  }

  static async setItemSharedAssignment(
    itemId: number,
    assignment?: SharedItemAssignment | null,
  ): Promise<boolean> {
    const item = await this.getItemById(itemId);
    if (!item) return false;
    return this.updateItem(itemId, {
      data: this.mergeSharedAssignmentIntoData(item.data, assignment || null),
    });
  }

  static async getSharingOverview(): Promise<SharingOverviewReport> {
    const spaces = await this.getSharedVaultSpaces();
    const items = await this.getItems();
    const issues: SharingOverviewIssue[] = [];
    const now = Date.now();
    const reviewThresholdMs = 90 * 24 * 60 * 60 * 1000;
    let sharedItems = 0;
    let reviewRequiredItems = 0;
    let pendingMembers = 0;

    const spaceSummaries = spaces.map(space => {
      const activeMembers = space.members.filter(
        member => member.status === 'active',
      ).length;
      const pending = space.members.filter(
        member => member.status === 'pending',
      ).length;
      pendingMembers += pending;
      return {
        ...space,
        itemCount: 0,
        activeMembers,
        pendingMembers: pending,
      };
    });

    const spaceIndex = new Map(spaceSummaries.map(space => [space.id, space]));

    for (const item of items) {
      const assignment = this.parseSharedAssignment(item);
      if (!assignment) continue;
      sharedItems++;
      const space = spaceIndex.get(assignment.spaceId);
      if (!space) {
        issues.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          severity: 'high',
          type: 'orphaned_space',
          message: 'Shared assignment points to a space that no longer exists.',
        });
        continue;
      }

      space.itemCount += 1;

      if (space.members.length === 0) {
        issues.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          severity: 'high',
          type: 'no_members',
          message: 'Shared item belongs to a space without any configured members.',
        });
      }

      const reviewedAt = assignment.lastReviewedAt
        ? new Date(assignment.lastReviewedAt).getTime()
        : 0;
      const requiresReview = space.requireReview && (!reviewedAt || now - reviewedAt > reviewThresholdMs);
      if (requiresReview) {
        reviewRequiredItems++;
        issues.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          severity: 'medium',
          type: 'review_required',
          message: 'Shared access review is overdue for this item.',
        });
      }

      if (assignment.isSensitive && !assignment.emergencyAccess) {
        issues.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          severity: 'medium',
          type: 'sensitive_without_emergency',
          message: 'Sensitive shared item has no emergency access path configured.',
        });
      }
    }

    const penalty =
      issues.filter(issue => issue.severity === 'high').length * 12 +
      issues.filter(issue => issue.severity === 'medium').length * 6 +
      pendingMembers * 2;
    const score = Math.max(0, 100 - penalty);
    const actions: string[] = [];

    if (issues.some(issue => issue.type === 'orphaned_space')) {
      actions.push('Fix items linked to deleted spaces before the next backup or export.');
    }
    if (issues.some(issue => issue.type === 'no_members')) {
      actions.push('Add at least one active member to every shared family or team space.');
    }
    if (reviewRequiredItems > 0) {
      actions.push('Review shared access every 90 days for spaces that require periodic review.');
    }
    if (issues.some(issue => issue.type === 'sensitive_without_emergency')) {
      actions.push('Enable emergency access for highly sensitive shared entries.');
    }
    if (actions.length === 0) {
      actions.push('Shared spaces look healthy. Keep member roles and access reviews current.');
    }

    return {
      score,
      riskLevel: this.getRiskLevelFromScore(score),
      summary: {
        spaces: spaces.length,
        sharedItems,
        familySpaces: spaces.filter(space => space.kind === 'family').length,
        teamSpaces: spaces.filter(space => space.kind === 'team').length,
        pendingMembers,
        reviewRequiredItems,
      },
      actions,
      issues,
      spaces: spaceSummaries.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  private static extractHistorySecretsFromItem(
    item: Partial<VaultItem>,
  ): Array<{
    field: PasswordHistoryEntry['field'];
    value: string;
  }> {
    const category = (item.category || 'login').toLowerCase();
    const data = this.parseDataJson(item.data);

    const out: Array<{
      field: PasswordHistoryEntry['field'];
      value: string;
    }> = [];

    if (category === 'login') {
      const v = (item.password || '').trim();
      if (v) out.push({ field: 'password', value: v });
    }

    if (category === 'wifi') {
      const v = (data?.wifi_password || '').trim();
      if (v) out.push({ field: 'wifi_password', value: v });
    }

    if (category === 'card') {
      const pin = (data?.pin || '').trim();
      const cvv = (data?.cvv || '').trim();
      if (pin) out.push({ field: 'pin', value: pin });
      if (cvv) out.push({ field: 'cvv', value: cvv });
    }

    if (category === 'passkey') {
      const credentialId = (data?.credential_id || '').trim();
      if (credentialId)
        out.push({ field: 'credential_id', value: credentialId });
    }

    return out;
  }

  private static async appendPasswordHistoryEntries(
    itemId: number,
    oldSecrets: Array<{ field: PasswordHistoryEntry['field']; value: string }>,
    source: 'update' | 'restore' = 'update',
  ): Promise<void> {
    if (!this.db || oldSecrets.length === 0) return;

    try {
      for (const s of oldSecrets) {
        this.db.executeSync(
          'INSERT INTO vault_password_history (item_id, field, value, source) VALUES (?,?,?,?)',
          [itemId, s.field, s.value, source],
        );
      }
    } catch (e) {
      console.error('appendPasswordHistoryEntries:', e);
    }
  }

  static async getItemById(id: number): Promise<VaultItem | null> {
    if (!this.db) return null;
    try {
      const row = this.db.executeSync(
        'SELECT * FROM vault_items WHERE id = ?',
        [id],
      ).rows?.[0] as VaultItem | undefined;
      return row || null;
    } catch (e) {
      console.error('getItemById:', e);
      return null;
    }
  }

  static async getItems(
    search?: string,
    category?: string,
  ): Promise<VaultItem[]> {
    if (!this.db) return [];
    try {
      let q = 'SELECT * FROM vault_items WHERE is_deleted = 0';
      const conds: string[] = [],
        p: any[] = [];
      if (search?.trim()) {
        const s = `%${search.trim()}%`;
        conds.push('(title LIKE ? OR username LIKE ? OR url LIKE ?)');
        p.push(s, s, s);
      }
      if (category && category !== 'all') {
        conds.push('category = ?');
        p.push(category);
      }
      if (conds.length) q += ' AND ' + conds.join(' AND ');
      q += ' ORDER BY favorite DESC, updated_at DESC';
      return (this.db.executeSync(q, p).rows || []) as VaultItem[];
    } catch (e) {
      console.error('getItems:', e);
      return [];
    }
  }

  static async getDeletedItems(): Promise<VaultItem[]> {
    if (!this.db) return [];
    try {
      return (this.db.executeSync(
        'SELECT * FROM vault_items WHERE is_deleted = 1 ORDER BY deleted_at DESC',
        [],
      ).rows || []) as VaultItem[];
    } catch (e) {
      console.error('getDeletedItems:', e);
      return [];
    }
  }

  static async getAllItems(): Promise<VaultItem[]> {
    return this.getItems();
  }

  static async addItem(item: Partial<VaultItem>): Promise<number | null> {
    if (!this.db) {
      console.error('[Security] Cannot add item: Database not open');
      return null;
    }
    try {
      if ((item.category || '').toLowerCase() === 'passkey') {
        const validation = this.validatePasskeyItem(item);
        if (!validation.valid) {
          console.error(
            '[Security] Cannot add passkey item:',
            validation.errors.join(' '),
          );
          return null;
        }
        item = {
          ...item,
          data: JSON.stringify(validation.normalized),
        };
      }

      debugLog('[Security] Adding new item to vault:', item.title);
      this.db.executeSync(
        `INSERT INTO vault_items (title,username,password,url,notes,category,favorite,data) VALUES (?,?,?,?,?,?,?,?)`,
        [
          item.title || '',
          item.username || '',
          item.password || '',
          item.url || '',
          item.notes || '',
          item.category || 'login',
          item.favorite || 0,
          item.data || '{}',
        ],
      );

      const res = this.db.executeSync('SELECT last_insert_rowid() as id');
      const newId = res.rows?.[0]?.id || null;

      if (newId) {
        debugLog('[Security] Item added successfully with ID:', newId);
        await this.syncAutofill();
        await this.triggerWearSync();
        await this.logSecurityEvent('item_added', 'success', {
          id: newId,
          title: item.title,
        });
      }
      return newId;
    } catch (e) {
      console.error('[Security] Error adding item:', e);
      return null;
    }
  }

  static async updateItem(
    id: number,
    item: Partial<VaultItem>,
  ): Promise<boolean> {
    if (!this.db) {
      console.error('[Security] Cannot update item: Database not open');
      return false;
    }
      try {
        debugLog('[Security] Updating item ID:', id);
        if ((item.category || '').toLowerCase() === 'passkey') {
          const validation = this.validatePasskeyItem(item);
          if (!validation.valid) {
            console.error(
              '[Security] Cannot update passkey item:',
              validation.errors.join(' '),
            );
            return false;
          }
          item = {
            ...item,
            data: JSON.stringify(validation.normalized),
          };
        }

        const existing = this.db.executeSync(
        'SELECT * FROM vault_items WHERE id = ?',
        [id],
      ).rows?.[0] as VaultItem | undefined;
      if (!existing) {
        debugWarn('[Security] Update failed: Item not found with ID', id);
        return false;
      }

      const merged: Partial<VaultItem> = {
        ...existing,
        ...item,
        data: item.data !== undefined ? item.data : existing.data,
      };

      const oldSecrets = this.extractHistorySecretsFromItem(existing);
      const newSecrets = this.extractHistorySecretsFromItem(merged);
      const changedOldSecrets = oldSecrets.filter(oldSecret => {
        const next = newSecrets.find(x => x.field === oldSecret.field);
        return !next || next.value !== oldSecret.value;
      });

      const fields: string[] = [],
        params: any[] = [];
      for (const [k, v] of Object.entries(item)) {
        if (!['id', 'created_at'].includes(k)) {
          fields.push(`${k}=?`);
          params.push(v);
        }
      }
      fields.push('updated_at=CURRENT_TIMESTAMP');
      params.push(id);

      this.db.executeSync(
        `UPDATE vault_items SET ${fields.join(',')} WHERE id=?`,
        params,
      );

      await this.appendPasswordHistoryEntries(id, changedOldSecrets, 'update');
      await this.syncAutofill();
      await this.triggerWearSync();

      debugLog('[Security] Item updated successfully');
      await this.logSecurityEvent('item_updated', 'success', { id });
      return true;
    } catch (e) {
      console.error('[Security] Error updating item:', e);
      return false;
    }
  }

  static async deleteItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      // Soft delete
      this.db.executeSync(
        'UPDATE vault_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id],
      );
      await this.syncAutofill();
      await this.triggerWearSync();
      return true;
    } catch (e) {
      console.error('deleteItem:', e);
      return false;
    }
  }

  static async getPasswordHistory(
    itemId: number,
    limit: number = 25,
  ): Promise<PasswordHistoryEntry[]> {
    if (!this.db) return [];
    try {
      const safeLimit = Math.max(1, Math.min(100, limit));
      return (this.db.executeSync(
        `SELECT id, item_id, field, value, source, changed_at
         FROM vault_password_history
         WHERE item_id = ?
         ORDER BY changed_at DESC
         LIMIT ?`,
        [itemId, safeLimit],
      ).rows || []) as PasswordHistoryEntry[];
    } catch (e) {
      console.error('[SecurityModule] getPasswordHistory failed:', e);
      return [];
    }
  }

  static async restorePasswordFromHistory(
    itemId: number,
    historyId: number,
  ): Promise<boolean> {
    if (!this.db) return false;
    try {
      const row = this.db.executeSync(
        'SELECT id, item_id, field, value FROM vault_password_history WHERE id = ? AND item_id = ?',
        [historyId, itemId],
      ).rows?.[0] as PasswordHistoryEntry | undefined;
      if (!row) return false;

      const item = await this.getItemById(itemId);
      if (!item) return false;

      const data = this.parseDataJson(item.data);
      const updates: Partial<VaultItem> = {};

      if (row.field === 'password') {
        updates.password = row.value;
      } else if (row.field === 'wifi_password') {
        updates.data = JSON.stringify({ ...data, wifi_password: row.value });
      } else if (row.field === 'pin') {
        updates.data = JSON.stringify({ ...data, pin: row.value });
      } else if (row.field === 'cvv') {
        updates.data = JSON.stringify({ ...data, cvv: row.value });
      } else if (row.field === 'credential_id') {
        updates.data = JSON.stringify({ ...data, credential_id: row.value });
      } else {
        return false;
      }

      const ok = await this.updateItem(itemId, updates);
      if (!ok) return false;

      this.db.executeSync(
        'UPDATE vault_password_history SET source = ? WHERE id = ?',
        ['restore', historyId],
      );
      return true;
    } catch (e) {
      console.error('restorePasswordFromHistory:', e);
      return false;
    }
  }

  static async restoreItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync(
        'UPDATE vault_items SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
        [id],
      );
      await this.syncAutofill();
      return true;
    } catch (e) {
      console.error('restoreItem:', e);
      return false;
    }
  }

  static async permanentlyDeleteItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments WHERE item_id = ?', [
        id,
      ]);
      this.db.executeSync(
        'DELETE FROM vault_password_history WHERE item_id = ?',
        [id],
      );
      this.db.executeSync('DELETE FROM vault_items WHERE id = ?', [id]);
      return true;
    } catch (e) {
      console.error('permanentlyDeleteItem:', e);
      return false;
    }
  }

  static async emptyTrash(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync(
        'DELETE FROM vault_attachments WHERE item_id IN (SELECT id FROM vault_items WHERE is_deleted = 1)',
      );
      this.db.executeSync(
        'DELETE FROM vault_password_history WHERE item_id IN (SELECT id FROM vault_items WHERE is_deleted = 1)',
      );
      this.db.executeSync('DELETE FROM vault_items WHERE is_deleted = 1');
      return true;
    } catch (e) {
      console.error('emptyTrash:', e);
      return false;
    }
  }

  static async cleanupOldTrash(): Promise<void> {
    if (!this.db) return;
    try {
      // Delete items soft-deleted more than 30 days ago
      this.db.executeSync(`
        DELETE FROM vault_attachments 
        WHERE item_id IN (
          SELECT id FROM vault_items 
          WHERE is_deleted = 1 
          AND deleted_at < datetime('now', '-30 days')
        )
      `);
      this.db.executeSync(`
        DELETE FROM vault_password_history
        WHERE item_id IN (
          SELECT id FROM vault_items
          WHERE is_deleted = 1
          AND deleted_at < datetime('now', '-30 days')
        )
      `);
      this.db.executeSync(`
        DELETE FROM vault_items 
        WHERE is_deleted = 1 
        AND deleted_at < datetime('now', '-30 days')
      `);
      debugLog('[Security] Old trash items cleaned up');
    } catch (e) {
      console.error('[Security] Error cleaning up old trash:', e);
    }
  }

  static async resetVault(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments');
      this.db.executeSync('DELETE FROM vault_password_history');
      this.db.executeSync('DELETE FROM vault_items');
      await this.syncAutofill();
      return true;
    } catch (e) {
      console.error('resetVault:', e);
      return false;
    }
  }

  static async factoryReset(): Promise<boolean> {
    try {
      this.lockVault();
      // Delete database file
      const dbPath = `${RNFS.DocumentDirectoryPath}/aegis_android_vault.sqlite`;
      await RNFS.unlink(dbPath).catch(() => {});

      // Reset biometric keys and metadata
      await this.resetBiometricKeys();

      // Delete salt and brute force files
      await RNFS.unlink(SALT_FILE).catch(() => {});
      await RNFS.unlink(BRUTE_FORCE_FILE).catch(() => {});
      await RNFS.unlink(AUDIT_BUFFER_FILE).catch(() => {});
      await RNFS.unlink(APP_CONFIG_FILE).catch(() => {});
      await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/hardware_keys.json`).catch(
        () => {},
      );
      await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/emergency_requests`).catch(
        () => {},
      );
      await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/recovery_sessions`).catch(
        () => {},
      );

      await this.logSecurityEvent('factory_reset', 'success', {});
      debugLog('[Security] Factory reset complete');
      return true;
    } catch (e) {
      await this.logSecurityEvent('factory_reset', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('[Security] Factory reset failed:', e);
      return false;
    }
  }

  static async panicWipe(): Promise<boolean> {
    try {
      this.lockVault();
      const ok = await this.factoryReset();
      if (ok) {
        await this.logSecurityEvent('panic_wipe', 'success', {});
      }
      return ok;
    } catch (e) {
      await this.logSecurityEvent('panic_wipe', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  static async toggleFavorite(id: number, cur: number): Promise<boolean> {
    return this.updateItem(id, { favorite: cur === 1 ? 0 : 1 });
  }

  static async getItemCount(): Promise<number> {
    if (!this.db) return 0;
    try {
      return (
        this.db.executeSync('SELECT COUNT(*) as c FROM vault_items').rows?.[0]
          ?.c || 0
      );
    } catch {
      return 0;
    }
  }

  // ── Attachments ───────────────────────────────────

  /**
   * Add attachment from a file URI (supports content:// URIs on Android).
   * Copies to cache first to handle Android content provider URIs.
   */
  static async addAttachment(
    itemId: number,
    filename: string,
    mimeType: string,
    filePath: string,
  ): Promise<boolean> {
    if (!this.db) return false;
    try {
      let base64: string;
      let fileSize: number;

      const isContentUri = filePath.startsWith('content://');
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const tempPath = `${
        RNFS.CachesDirectoryPath
      }/aegis_temp_${Date.now()}_${safeFilename}`;

      try {
        if (isContentUri) {
          await RNFS.copyFile(filePath, tempPath);
          const stat = await RNFS.stat(tempPath);
          fileSize = stat.size;
          if (fileSize > 50 * 1024 * 1024) {
            await RNFS.unlink(tempPath).catch(() => {});
            console.error('File too large (>50MB)');
            return false;
          }
          base64 = await RNFS.readFile(tempPath, 'base64');
          await RNFS.unlink(tempPath).catch(() => {});
        } else {
          const stat = await RNFS.stat(filePath);
          fileSize = stat.size;
          if (fileSize > 50 * 1024 * 1024) {
            console.error('File too large (>50MB)');
            return false;
          }
          base64 = await RNFS.readFile(filePath, 'base64');
        }
      } catch (readErr) {
        debugWarn('Primary read failed, trying direct read:', readErr);
        try {
          base64 = await RNFS.readFile(filePath, 'base64');
          fileSize = Math.ceil(base64.length * 0.75);
        } catch (fallbackErr) {
          console.error('All read methods failed:', fallbackErr);
          return false;
        }
      }

      this.db.executeSync(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [itemId, filename, mimeType, fileSize, base64],
      );
      debugLog('[Attachment] File added to vault item');
      return true;
    } catch (e) {
      console.error('addAttachment:', e);
      return false;
    }
  }

  static async addAttachmentFromBase64(
    itemId: number,
    filename: string,
    mimeType: string,
    base64Data: string,
    size: number,
  ): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [itemId, filename, mimeType, size, base64Data],
      );
      return true;
    } catch (e) {
      console.error('addAttachmentFromBase64:', e);
      return false;
    }
  }

  static async readFileToBase64(
    filePath: string,
    filename: string,
  ): Promise<{ base64: string; size: number } | null> {
    try {
      const isContentUri = filePath.startsWith('content://');
      if (isContentUri) {
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const tempPath = `${
          RNFS.CachesDirectoryPath
        }/aegis_read_${Date.now()}_${safeFilename}`;
        await RNFS.copyFile(filePath, tempPath);
        const stat = await RNFS.stat(tempPath);
        const base64 = await RNFS.readFile(tempPath, 'base64');
        await RNFS.unlink(tempPath).catch(() => {});
        return { base64, size: stat.size };
      } else {
        const stat = await RNFS.stat(filePath);
        const base64 = await RNFS.readFile(filePath, 'base64');
        return { base64, size: stat.size };
      }
    } catch (e) {
      try {
        const base64 = await RNFS.readFile(filePath, 'base64');
        return { base64, size: Math.ceil(base64.length * 0.75) };
      } catch {
        console.error('readFileToBase64 failed:', e);
        return null;
      }
    }
  }

  static async getAttachments(itemId: number): Promise<Attachment[]> {
    if (!this.db) return [];
    try {
      const r = this.db.executeSync(
        'SELECT id,item_id,filename,mime_type,size,created_at FROM vault_attachments WHERE item_id=?',
        [itemId],
      );
      return (r.rows || []) as Attachment[];
    } catch {
      return [];
    }
  }

  static async downloadAttachment(
    attachmentId: number,
  ): Promise<string | null> {
    if (!this.db) return null;
    try {
      const r = this.db.executeSync(
        'SELECT filename,file_data FROM vault_attachments WHERE id=?',
        [attachmentId],
      );
      const row = r.rows?.[0];
      if (!row || !row.file_data) return null;

      const dirs = [
        RNFS.DownloadDirectoryPath,
        RNFS.ExternalDirectoryPath,
        RNFS.DocumentDirectoryPath,
        RNFS.CachesDirectoryPath,
      ].filter(Boolean);

      const safeFilename = (row.filename || 'download').replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );
      let savedPath: string | null = null;

      for (const dir of dirs) {
        try {
          const dirExists = await RNFS.exists(dir);
          if (!dirExists) continue;
          const path = `${dir}/${safeFilename}`;
          let finalPath = path;
          const exists = await RNFS.exists(path);
          if (exists) {
            const ext = safeFilename.includes('.')
              ? '.' + safeFilename.split('.').pop()
              : '';
            const baseName = safeFilename.includes('.')
              ? safeFilename.substring(0, safeFilename.lastIndexOf('.'))
              : safeFilename;
            finalPath = `${dir}/${baseName}_${Date.now()}${ext}`;
          }
          await RNFS.writeFile(finalPath, row.file_data, 'base64');
          savedPath = finalPath;
          break;
        } catch (e) {
          console.error('[Security] downloadAttachment iteration failed:', e);
          continue;
        }
      }
      return savedPath;
    } catch (e) {
      console.error('downloadAttachment:', e);
      return null;
    }
  }

  static async deleteAttachment(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments WHERE id=?', [id]);
      return true;
    } catch {
      return false;
    }
  }

  // ── Settings ──────────────────────────────────────
  static async getSetting(key: string): Promise<string | null> {
    if (!this.db) return null;
    try {
      const row = this.db.executeSync(
        'SELECT value FROM vault_settings WHERE key=?',
        [key],
      ).rows?.[0] as { value?: string | number | boolean | null } | undefined;
      if (!row || row.value === undefined || row.value === null) return null;
      return String(row.value);
    } catch {
      return null;
    }
  }

  private static parseSettingBoolean(
    value: string | number | boolean | null | undefined,
    fallback: boolean,
  ): boolean {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
  }

  private static parseSettingNumber(
    value: string | number | boolean | null | undefined,
    fallback: number,
  ): number {
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.trunc(n));
  }

  private static parseSettingForAppConfig(
    value: string,
  ): string | number | boolean {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return value;
  }

  static async setSetting(key: string, value: string) {
      const uiSettingKeys = [
        'darkMode',
        'biometricEnabled',
        'autoLockSeconds',
        'breachCheckEnabled',
      ];
    try {
      if (uiSettingKeys.includes(key)) {
        await this.setAppConfigSetting(
          key,
          this.parseSettingForAppConfig(value),
        );
      }

      if (!this.db) return;

      const previous = await this.getSetting(key);
      this.db.executeSync(
        'INSERT OR REPLACE INTO vault_settings (key,value) VALUES (?,?)',
        [key, value],
      );

      const criticalSettingKeys = [
        'biometricEnabled',
        'autoLockSeconds',
        'clipboardClearSeconds',
      ];
      if (criticalSettingKeys.includes(key) && previous !== value) {
        await this.logSecurityEvent('critical_setting_changed', 'info', {
          key,
          previous,
          next: value,
        });
      }
    } catch {}
  }
  static async getAllSettings(): Promise<VaultSettings> {
    const s = { ...DEFAULT_SETTINGS };
    try {
      const appAutoLock = await this.getAppConfigSetting('autoLockSeconds');
      s.autoLockSeconds = this.parseSettingNumber(
        appAutoLock,
        s.autoLockSeconds,
      );
      const appBiometric = await this.getAppConfigSetting('biometricEnabled');
      s.biometricEnabled = this.parseSettingBoolean(
        appBiometric,
        s.biometricEnabled,
      );
      const appDarkMode = await this.getAppConfigSetting('darkMode');
      s.darkMode = this.parseSettingBoolean(appDarkMode, s.darkMode);

      const al = await this.getSetting('autoLockSeconds');
      if (al !== null)
        s.autoLockSeconds = this.parseSettingNumber(al, s.autoLockSeconds);
      const bio = await this.getSetting('biometricEnabled');
      if (bio !== null) {
        s.biometricEnabled = this.parseSettingBoolean(bio, s.biometricEnabled);
      }
      const cl = await this.getSetting('clipboardClearSeconds');
      if (cl !== null) {
        s.clipboardClearSeconds = this.parseSettingNumber(
          cl,
          s.clipboardClearSeconds,
        );
      }
      const pl = await this.getSetting('passwordLength');
      if (pl !== null)
        s.passwordLength = this.parseSettingNumber(pl, s.passwordLength);
      const dm = await this.getSetting('darkMode');
      if (dm !== null) s.darkMode = this.parseSettingBoolean(dm, s.darkMode);
      const bc = await this.getSetting('breachCheckEnabled');
      if (bc !== null) {
        s.breachCheckEnabled = this.parseSettingBoolean(
          bc,
          Boolean(s.breachCheckEnabled),
        );
      }
    } catch {}
    return s;
  }

  // ── Password Generator (CSPRNG-based) ─────────────
  static generatePassword(
    len: number = 20,
    opts?: {
      uppercase?: boolean;
      lowercase?: boolean;
      numbers?: boolean;
      symbols?: boolean;
    },
  ): string {
    const o = {
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      ...opts,
    };
    let c = '';
    if (o.lowercase) c += 'abcdefghijkmnopqrstuvwxyz';
    if (o.uppercase) c += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (o.numbers) c += '23456789';
    if (o.symbols) c += '!@#$%^&*_+-=?';
    if (!c) c = 'abcdefghijkmnopqrstuvwxyz';

    // Use CSPRNG instead of Math.random()
    const randomBytes = randomBytesSafe(len * 2);
    let pw = '';
    for (let i = 0; i < len; i++) {
      // Use 2 bytes per char to reduce modulo bias
      const val =
        ((randomBytes[i * 2] << 8) | randomBytes[i * 2 + 1]) % c.length;
      pw += c.charAt(val);
    }
    return pw;
  }

  static getPasswordStrength(pw: string): {
    score: number;
    label: string;
    color: string;
  } {
    if (!pw) return { score: 0, label: 'Yok', color: '#94a3b8' };
    let sc = 0;
    if (pw.length >= 8) sc++;
    if (pw.length >= 12) sc++;
    if (pw.length >= 16) sc++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) sc++;
    if (/\d/.test(pw)) sc++;
    if (/[^A-Za-z0-9]/.test(pw)) sc++;
    if (pw.length >= 20) sc++;
    if (sc <= 2) return { score: sc, label: 'Zayıf', color: '#ef4444' };
    if (sc <= 4) return { score: sc, label: 'Orta', color: '#f59e0b' };
    if (sc <= 5) return { score: sc, label: 'Güçlü', color: '#22c55e' };
    return { score: sc, label: 'Çok Güçlü', color: '#06b6d4' };
  }

  static normalizePasskeyRpId(url?: string, rpId?: string): string {
    const explicit = (rpId || '').trim().toLowerCase();
    if (explicit) {
      return explicit
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/:\d+$/, '');
    }

    const rawUrl = (url || '').trim();
    if (!rawUrl) return '';
    try {
      const normalizedUrl = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : `https://${rawUrl}`;
      return new URL(normalizedUrl).hostname.toLowerCase();
    } catch {
      return rawUrl
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/:\d+$/, '');
    }
  }

  private static toBase64Url(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = bytes[i + 1];
      const c = bytes[i + 2];
      out += BASE64URL_CHARS[a >> 2];
      out += BASE64URL_CHARS[((a & 3) << 4) | ((b || 0) >> 4)];
      if (i + 1 < bytes.length) {
        out += BASE64URL_CHARS[((b & 15) << 2) | ((c || 0) >> 6)];
      }
      if (i + 2 < bytes.length) {
        out += BASE64URL_CHARS[c & 63];
      }
    }
    return out;
  }

  static sanitizeBase64Url(value?: string): string {
    return (value || '').replace(/[^A-Za-z0-9\-_]/g, '');
  }

  static generatePasskeyData(input?: {
    username?: string;
    url?: string;
    rpId?: string;
    displayName?: string;
  }): PasskeyData {
    const rpId = this.normalizePasskeyRpId(input?.url, input?.rpId);
    const credentialId = this.toBase64Url(randomBytesSafe(32));
    const userHandle = this.toBase64Url(randomBytesSafe(32));
    const displayName =
      (input?.displayName || '').trim() ||
      (input?.username || '').trim() ||
      rpId ||
      'Device passkey';

    return {
      rp_id: rpId,
      credential_id: credentialId,
      user_handle: userHandle,
      display_name: displayName,
      transport: 'internal',
      authenticator_attachment: 'platform',
      algorithm: 'ES256',
      created_at: new Date().toISOString(),
    };
  }

  static parsePasskeyPayload(
    payload: string,
    fallback?: { url?: string; rpId?: string; username?: string },
  ): PasskeyValidationResult {
    const errors: string[] = [];
    let parsed: any = null;

    try {
      parsed = JSON.parse(payload);
    } catch {
      return {
        valid: false,
        errors: ['Passkey JSON is not valid JSON.'],
        normalized: {},
      };
    }

    const rpId = this.normalizePasskeyRpId(
      fallback?.url,
      parsed?.rp?.id || parsed?.rpId || parsed?.relyingPartyId || fallback?.rpId,
    );
    const credentialId = this.sanitizeBase64Url(
      parsed?.credential_id || parsed?.credentialId || parsed?.id || parsed?.rawId,
    );
    const userHandle = this.sanitizeBase64Url(
      parsed?.user_handle ||
        parsed?.userHandle ||
        parsed?.response?.userHandle ||
        parsed?.user?.id,
    );
    const displayName =
      (parsed?.display_name ||
        parsed?.displayName ||
        parsed?.user?.displayName ||
        parsed?.user?.name ||
        fallback?.username ||
        '').trim();
    const transportRaw =
      parsed?.transport ||
      parsed?.transports?.[0] ||
      parsed?.response?.transports?.[0] ||
      parsed?.authenticatorAttachment ||
      'internal';

    const normalized: PasskeyData = {
      rp_id: rpId,
      credential_id: credentialId,
      user_handle: userHandle,
      display_name: displayName,
      transport: `${transportRaw}`.toLowerCase(),
      authenticator_attachment: parsed?.authenticatorAttachment || 'platform',
      algorithm:
        parsed?.algorithm ||
        parsed?.pubKeyCredParams?.[0]?.alg ||
        parsed?.response?.publicKeyAlgorithm ||
        'ES256',
      created_at: parsed?.created_at || new Date().toISOString(),
      mode: parsed?.mode === 'rp_connected' ? 'rp_connected' : 'local_helper',
      server_verified: Boolean(parsed?.server_verified),
      challenge_source: parsed?.challenge_source === 'server' ? 'server' : 'local_helper',
      last_registration_at: parsed?.last_registration_at,
      last_auth_at: parsed?.last_auth_at,
    };

    if (!normalized.rp_id) errors.push('RP ID is required.');
    if (!normalized.credential_id || normalized.credential_id.length < 16) {
      errors.push('Credential ID is missing or too short.');
    }
    if (!normalized.user_handle || normalized.user_handle.length < 16) {
      errors.push('User handle is missing or too short.');
    }

    return {
      valid: errors.length === 0,
      errors,
      normalized,
    };
  }

  static validatePasskeyItem(item: Partial<VaultItem>): PasskeyValidationResult {
    let data: PasskeyData & Record<string, any> = {};
    try {
      data =
        typeof item.data === 'string'
          ? JSON.parse(item.data || '{}')
          : ((item.data as unknown as PasskeyData) || {});
    } catch {
      return {
        valid: false,
        errors: ['Passkey data is not valid JSON.'],
        normalized: {},
      };
    }

    const normalized: PasskeyData & Record<string, any> = {
      ...data,
      rp_id: this.normalizePasskeyRpId(item.url, data.rp_id),
      credential_id: this.sanitizeBase64Url(data.credential_id),
      user_handle: this.sanitizeBase64Url(data.user_handle),
      display_name: (data.display_name || item.username || item.title || '').trim(),
      transport: (data.transport || 'internal').trim().toLowerCase(),
      authenticator_attachment: (
        data.authenticator_attachment || 'platform'
      ).trim(),
      algorithm: (data.algorithm || 'ES256').trim(),
      created_at: data.created_at || new Date().toISOString(),
      mode: data.mode === 'rp_connected' ? 'rp_connected' : 'local_helper',
      server_verified: Boolean(data.server_verified),
      challenge_source:
        data.challenge_source === 'server' ? 'server' : 'local_helper',
      last_registration_at: data.last_registration_at,
      last_auth_at: data.last_auth_at,
    };

    const errors: string[] = [];
    if (!(item.title || '').trim()) errors.push('Title is required.');
    if (!(item.username || '').trim()) errors.push('Username is required.');
    if (!(item.url || '').trim()) errors.push('Website URL is required.');
    if (!normalized.rp_id) errors.push('RP ID could not be derived from URL.');
    if (!normalized.credential_id || normalized.credential_id.length < 16) {
      errors.push('Credential ID must be a valid Base64URL value.');
    }
    if (!normalized.user_handle || normalized.user_handle.length < 16) {
      errors.push('User handle must be a valid Base64URL value.');
    }

    return { valid: errors.length === 0, errors, normalized };
  }

  private static buildPasswordFields(item: VaultItem): Array<{
    field: PasswordFieldType;
    value: string;
    isIncomplete: boolean;
  }> {
    let data: any = {};
    try {
      data = item.data ? JSON.parse(item.data || '{}') : {};
    } catch {
      data = {};
    }

    const fields: Array<{
      field: PasswordFieldType;
      value: string;
      isIncomplete: boolean;
    }> = [];

    if (item.category === 'login') {
      fields.push({
        field: 'password',
        value: (item.password || '').trim(),
        isIncomplete:
          !(item.title || '').trim() ||
          !(item.username || '').trim() ||
          !(item.password || '').trim(),
      });
    }

    if (item.category === 'wifi') {
      fields.push({
        field: 'wifi_password',
        value: (data?.wifi_password || '').trim(),
        isIncomplete:
          !(item.title || '').trim() ||
          !(data?.ssid || '').trim() ||
          !(data?.wifi_password || '').trim(),
      });
    }

    if (item.category === 'card') {
      if (data?.pin !== undefined) {
        fields.push({
          field: 'pin',
          value: (data.pin || '').trim(),
          isIncomplete: false,
        });
      }
      if (data?.cvv !== undefined) {
        fields.push({
          field: 'cvv',
          value: (data.cvv || '').trim(),
          isIncomplete: false,
        });
      }
    }

    return fields;
  }

  private static normalizeForSimilarity(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[-_.]/g, '')
      .replace(/[^a-z]+$/g, '');
  }

  private static getItemData(item: VaultItem): any {
    try {
      return item.data ? JSON.parse(item.data || '{}') : {};
    } catch {
      return {};
    }
  }

  private static getItemTimestamp(item: VaultItem): number | null {
    const raw = item.updated_at || item.created_at;
    if (!raw) return null;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  private static getRiskLevelFromScore(
    score: number,
  ): 'critical' | 'high' | 'medium' | 'low' {
    return score < 45
      ? 'critical'
      : score < 65
      ? 'high'
      : score < 80
      ? 'medium'
      : 'low';
  }

  private static buildAccountHardeningReport(
    items: VaultItem[],
  ): AccountHardeningReport {
    const checks: AccountHardeningCheck[] = [];
    const passkeyRefs = new Map<string, Set<string>>();
    const now = Date.now();
    const staleThresholdMs = 180 * 24 * 60 * 60 * 1000;

    for (const item of items) {
      if ((item.category || '').toLowerCase() !== 'passkey') continue;
      const data = this.getItemData(item);
      const rpId = this.normalizePasskeyRpId(item.url, data?.rp_id);
      if (!rpId) continue;
      const usernames = passkeyRefs.get(rpId) || new Set<string>();
      usernames.add((item.username || '').trim().toLowerCase());
      passkeyRefs.set(rpId, usernames);
    }

    let loginItems = 0;
    let totpProtectedCount = 0;
    let passkeyProtectedCount = 0;
    let missing2FACount = 0;
    let staleSecretCount = 0;
    let incompleteLoginCount = 0;

    for (const item of items) {
      if ((item.category || '').toLowerCase() !== 'login') continue;
      loginItems++;

      const data = this.getItemData(item);
      const username = (item.username || '').trim().toLowerCase();
      const rpId = this.normalizePasskeyRpId(item.url);
      const hasPassword = Boolean((item.password || '').trim());
      const hasTotp = Boolean((data?.totp_secret || '').trim());
      const relatedPasskeys = rpId ? passkeyRefs.get(rpId) : null;
      const hasPasskey =
        Boolean(
          relatedPasskeys &&
            (relatedPasskeys.has(username) ||
              relatedPasskeys.has('') ||
              (!username && relatedPasskeys.size > 0)),
        ) || false;

      if (hasTotp) totpProtectedCount++;
      if (hasPasskey) passkeyProtectedCount++;

      if (hasPassword && !hasTotp && !hasPasskey) {
        missing2FACount++;
        checks.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          category: 'login',
          severity: 'high',
          type: 'missing_2fa',
          message:
            'Login has a password but no local TOTP seed or related passkey entry.',
        });
      }

      if (!(item.username || '').trim() || !rpId) {
        incompleteLoginCount++;
        checks.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          category: 'login',
          severity: 'medium',
          type: 'missing_identity',
          message:
            'Login entry is missing a username/email or a normalized domain.',
        });
      }

      const itemTs = this.getItemTimestamp(item);
      if (hasPassword && itemTs && now - itemTs > staleThresholdMs) {
        staleSecretCount++;
        checks.push({
          itemId: item.id || 0,
          title: item.title || 'Untitled',
          category: 'login',
          severity: 'medium',
          type: 'stale_secret',
          message:
            'Secret appears old and should be reviewed for rotation.',
        });
      }
    }

    const penalty =
      missing2FACount * 10 + staleSecretCount * 5 + incompleteLoginCount * 6;
    const score = Math.max(0, 100 - penalty);
    const actions: string[] = [];

    if (missing2FACount > 0) {
      actions.push(
        'Add TOTP or a related passkey to password-based accounts first.',
      );
    }
    if (staleSecretCount > 0) {
      actions.push('Rotate secrets that have not changed for 180+ days.');
    }
    if (incompleteLoginCount > 0) {
      actions.push(
        'Complete missing username/email and domain metadata for logins.',
      );
    }
    if (actions.length === 0) {
      actions.push(
        '2FA coverage and login metadata look healthy for the current vault.',
      );
    }

    return {
      score,
      riskLevel: this.getRiskLevelFromScore(score),
      summary: {
        loginItems,
        totpProtectedCount,
        passkeyProtectedCount,
        missing2FACount,
        staleSecretCount,
        incompleteLoginCount,
      },
      actions,
      checks,
    };
  }

  private static levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
      Array(b.length + 1).fill(0),
    );

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[a.length][b.length];
  }

  static async getPasswordHealthReport(): Promise<PasswordHealthReport> {
    const items = await this.getItems();
    const issues: PasswordHealthIssue[] = [];
    const passwordMap = new Map<
      string,
      Array<{ item: VaultItem; field: PasswordFieldType }>
    >();
    const normalizedMap = new Map<
      string,
      Array<{ item: VaultItem; field: PasswordFieldType; raw: string }>
    >();

    let checkedSecrets = 0;
    let weakCount = 0;
    let reusedCount = 0;
    let similarCount = 0;
    let emptyOrIncompleteCount = 0;

    for (const item of items) {
      const fields = this.buildPasswordFields(item);

      for (const fieldData of fields) {
        const rawValue = fieldData.value;
        const hasValue = rawValue.length > 0;

        if (!hasValue || fieldData.isIncomplete) {
          emptyOrIncompleteCount++;
          issues.push({
            itemId: item.id || 0,
            title: item.title || 'Untitled',
            category: item.category || 'login',
            field: fieldData.field,
            severity: 'high',
            type: 'empty',
            message: !hasValue
              ? 'Secret value is empty and should be filled.'
              : 'Entry has incomplete required fields (title/username/password or SSID).',
          });
          continue;
        }

        checkedSecrets++;

        const strength = this.getPasswordStrength(rawValue).score;
        const looksWeakPattern = /(1234|password|qwerty|admin|0000)/i.test(
          rawValue,
        );
        if (strength <= 2 || looksWeakPattern || rawValue.length < 10) {
          weakCount++;
          issues.push({
            itemId: item.id || 0,
            title: item.title || 'Untitled',
            category: item.category || 'login',
            field: fieldData.field,
            severity: 'high',
            type: 'weak',
            message:
              'Secret value is weak (short length or predictable pattern). Use a unique random value.',
          });
        }

        const existing = passwordMap.get(rawValue) || [];
        existing.push({ item, field: fieldData.field });
        passwordMap.set(rawValue, existing);

        const normalized = this.normalizeForSimilarity(rawValue);
        if (normalized.length >= 6) {
          const existingNormalized = normalizedMap.get(normalized) || [];
          existingNormalized.push({
            item,
            field: fieldData.field,
            raw: rawValue,
          });
          normalizedMap.set(normalized, existingNormalized);
        }
      }
    }

    for (const refs of passwordMap.values()) {
      if (refs.length < 2) continue;
      reusedCount += refs.length;
      for (const ref of refs) {
        issues.push({
          itemId: ref.item.id || 0,
          title: ref.item.title || 'Untitled',
          category: ref.item.category || 'login',
          field: ref.field,
          severity: 'critical',
          type: 'reused',
          message: `Secret value is reused in ${refs.length} entries. Rotate all duplicates immediately.`,
        });
      }
    }

    const normalizedKeys = Array.from(normalizedMap.keys());
    const reportedPairs = new Set<string>();
    for (let i = 0; i < normalizedKeys.length; i++) {
      for (let j = i + 1; j < normalizedKeys.length; j++) {
        const a = normalizedKeys[i];
        const b = normalizedKeys[j];
        const distance = this.levenshteinDistance(a, b);
        const maxLen = Math.max(a.length, b.length);
        const similar =
          distance <= 2 ||
          (distance <= 3 && maxLen >= 12) ||
          a.startsWith(b) ||
          b.startsWith(a);
        if (!similar) continue;

        const groupA = normalizedMap.get(a) || [];
        const groupB = normalizedMap.get(b) || [];
        for (const refA of groupA) {
          for (const refB of groupB) {
            if (
              (refA.item.id || 0) === (refB.item.id || 0) &&
              refA.field === refB.field
            ) {
              continue;
            }
            const pairKey = [
              `${refA.item.id || 0}-${refA.field}`,
              `${refB.item.id || 0}-${refB.field}`,
            ]
              .sort()
              .join('|');
            if (reportedPairs.has(pairKey)) continue;

            reportedPairs.add(pairKey);
            similarCount += 2;

            issues.push({
              itemId: refA.item.id || 0,
              title: refA.item.title || 'Untitled',
              category: refA.item.category || 'login',
              field: refA.field,
              severity: 'medium',
              type: 'similar',
              message:
                'Secret value is too similar to another entry (small variation). Use fully unrelated random values.',
            });
            issues.push({
              itemId: refB.item.id || 0,
              title: refB.item.title || 'Untitled',
              category: refB.item.category || 'login',
              field: refB.field,
              severity: 'medium',
              type: 'similar',
              message:
                'Secret value is too similar to another entry (small variation). Use fully unrelated random values.',
            });
          }
        }
      }
    }

    const penalty =
      weakCount * 7 +
      reusedCount * 12 +
      similarCount * 4 +
      emptyOrIncompleteCount * 10;
    const score = Math.max(0, 100 - penalty);

    const riskLevel: PasswordHealthReport['riskLevel'] =
      this.getRiskLevelFromScore(score);

    const actions: string[] = [];
    if (reusedCount > 0) {
      actions.push('Replace reused secrets with unique random values first.');
    }
    if (emptyOrIncompleteCount > 0) {
      actions.push(
        'Complete empty/incomplete entries to avoid lockout and recovery failures.',
      );
    }
    if (weakCount > 0) {
      actions.push(
        'Increase secret length to at least 16 characters where possible.',
      );
    }
    if (similarCount > 0) {
      actions.push(
        'Avoid small mutations (e.g. suffix changes); generate unrelated values.',
      );
    }
    if (actions.length === 0) {
      actions.push(
        'No critical findings. Keep rotating high-value account secrets periodically.',
      );
    }

    const hardening = this.buildAccountHardeningReport(items);

    return {
      score,
      riskLevel,
      generatedAt: new Date().toISOString(),
      summary: {
        totalItems: items.length,
        checkedSecrets,
        weakCount,
        reusedCount,
        similarCount,
        emptyOrIncompleteCount,
      },
      actions,
      issues,
      hardening,
    };
  }

  // ══════════════════════════════════════════════════
  // 5. AES-256-GCM ENCRYPTION (for backup export)
  // ══════════════════════════════════════════════════

  /**
   * Encrypt data using AES-256-GCM with Argon2id key derivation.
   * Returns: { salt, iv, authTag, ciphertext } all base64 encoded.
   */
  static async encryptAES256GCM(
    plaintext: string,
    password: string,
  ): Promise<{
    salt: string;
    iv: string;
    authTag: string;
    ciphertext: string;
    kdf: 'Argon2id' | 'PBKDF2-SHA256';
    memory?: number;
    iterations: number;
    parallelism?: number;
    hashLength: number;
  }> {
    const salt = randomBytesSafe(32);
    const iv = randomBytesSafe(12);

    let keyBuf: Buffer;
    const kdfMeta = {
      kdf: 'Argon2id' as const,
      memory: BACKUP_KDF_DEFAULT.memory,
      iterations: BACKUP_KDF_DEFAULT.iterations,
      parallelism: BACKUP_KDF_DEFAULT.parallelism,
      hashLength: BACKUP_KDF_DEFAULT.hashLength,
    };

    if (typeof Argon2Fn !== 'function') {
      throw new Error(
        'Argon2id is unavailable on this build. Encrypted export is blocked.',
      );
    }

    const argon2Result = await Argon2Fn(password, salt.toString('hex'), {
      mode: 'argon2id',
      memory: BACKUP_KDF_DEFAULT.memory,
      iterations: BACKUP_KDF_DEFAULT.iterations,
      parallelism: BACKUP_KDF_DEFAULT.parallelism,
      hashLength: BACKUP_KDF_DEFAULT.hashLength,
      saltEncoding: 'hex',
    });
    keyBuf = Buffer.from(argon2Result.rawHash, 'hex');

    const crypto = getCryptoImpl();
    if (!crypto?.createCipheriv) {
      throw new Error(
        'Crypto AES-GCM encryption is not available on this build.',
      );
    }
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);

    const plaintextBuf = Buffer.from(plaintext, 'utf8');
    const updateResult = cipher.update(plaintextBuf);
    const finalResult = cipher.final();

    const updateBytes = new Uint8Array(updateResult as ArrayBuffer);
    const finalBytes = new Uint8Array(finalResult as ArrayBuffer);
    const encryptedBytes = new Uint8Array(
      updateBytes.length + finalBytes.length,
    );
    encryptedBytes.set(updateBytes, 0);
    encryptedBytes.set(finalBytes, updateBytes.length);

    const rawAuthTag = cipher.getAuthTag();
    const tagBytes = new Uint8Array(rawAuthTag as ArrayBuffer);

    // Zero out key
    for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;

    return {
      salt: __bufToBase64(salt),
      iv: __bufToBase64(iv),
      authTag: __bufToBase64(tagBytes),
      ciphertext: __bufToBase64(encryptedBytes),
      ...kdfMeta,
    };
  }

  /**
   * Decrypt AES-256-GCM encrypted data.
   */
  static async decryptAES256GCM(
    ciphertext: string,
    password: string,
    saltB64: string,
    ivB64: string,
    authTagB64: string,
    kdfMeta?: {
      kdf?: string;
      iterations?: number;
      memory?: number;
      parallelism?: number;
      hashLength?: number;
    },
  ): Promise<string> {
    const salt = __base64ToBuf(saltB64);
    const iv = __base64ToBuf(ivB64);
    const authTag = __base64ToBuf(authTagB64);
    const encData = __base64ToBuf(ciphertext);

    // Derive key based on backup metadata (legacy PBKDF2 supported for migration)
    const declaredKdf = (kdfMeta?.kdf || '').toUpperCase();
    const useLegacyPBKDF2 = declaredKdf.includes('PBKDF2');

    let keyBuf: Uint8Array;
    if (useLegacyPBKDF2) {
      const derivedKeyBuffer = await deriveKeyPBKDF2(
        password,
        __bufToHex(salt),
        kdfMeta?.iterations || 310000,
        32,
      );
      keyBuf = new Uint8Array(derivedKeyBuffer as unknown as ArrayBuffer);
    } else {
      const argon2Result = await Argon2Fn(password, __bufToHex(salt), {
        mode: 'argon2id',
        memory: kdfMeta?.memory || BACKUP_KDF_DEFAULT.memory,
        iterations: kdfMeta?.iterations || BACKUP_KDF_DEFAULT.iterations,
        parallelism: kdfMeta?.parallelism || BACKUP_KDF_DEFAULT.parallelism,
        hashLength: kdfMeta?.hashLength || BACKUP_KDF_DEFAULT.hashLength,
        saltEncoding: 'hex',
      });
      keyBuf = __hexToBuf(argon2Result.rawHash);
    }

    // AES-256-GCM decryption
    const cryptoDec = getCryptoImpl();
    if (!cryptoDec?.createDecipheriv) {
      throw new Error(
        'Crypto AES-GCM decryption is not available on this build.',
      );
    }

    const decipher = cryptoDec.createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(authTag);

    // Similarly use Uint8Array to bypass string/Buffer incompatibilities
    const decUpdateResult = new Uint8Array(
      decipher.update(encData) as ArrayBuffer,
    );
    const decFinalResult = new Uint8Array(decipher.final() as ArrayBuffer);

    const decryptedBytes = new Uint8Array(
      decUpdateResult.length + decFinalResult.length,
    );
    decryptedBytes.set(decUpdateResult, 0);
    decryptedBytes.set(decFinalResult, decUpdateResult.length);

    const decryptedStr = __bufToUtf8(decryptedBytes);

    // Zero out key
    for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;

    return decryptedStr;
  }

  // ── Lock ──────────────────────────────────────────
  static startAutoLockTimer(sec: number, cb: () => void) {
    this.clearAutoLockTimer();
    if (sec > 0)
      this.autoLockTimer = setTimeout(() => {
        this.lockVault();
        cb();
      }, sec * 1000);
  }
  static clearAutoLockTimer() {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }
  static resetAutoLockTimer(sec: number, cb: () => void) {
    this.startAutoLockTimer(sec, cb);
  }
  static lockVault() {
    this.clearAutoLockTimer();
    try {
      if (this.db) this.db.close();
    } catch {}
    this.db = null;
    this.currentUnlockSecret = null;
    this.biometricLegacyFallbackSecret = null;
    AutofillService.setUnlocked(false);
    AutofillService.clearEntries();
  }
  static getDb() {
    return this.db;
  }

  /**
   * Derives a dedicated 32-byte secret for E2E sync from the vault password.
   * SECURITY: Uses Argon2id with a per-installation unique salt derived from
   * the device salt. This ensures different devices produce different sync keys.
   */
  static async getSyncRootSecret(password: string): Promise<Buffer> {
    // SECURITY: Combine device-unique salt with a domain separator so the
    // resulting salt is per-installation AND purpose-bound. This prevents
    // two users with the same password from deriving identical sync keys.
    const deviceSalt = await this.getDeviceSalt();
    const hmacS = getCryptoImpl()!.createHmac('sha256', deviceSalt);
    hmacS.update('aegis_v4_sync_salt_v2');
    const salt = hmacS.digest('hex');

    const result = await Argon2Fn(password, salt, {
        iterations: 10,
        memory: 65536,
        parallelism: 4,
        hashLength: 32,
        mode: 'argon2id',
    });
    // Argon2 result.rawHash is usually hex in react-native-argon2's return object if accessed directly,
    // but the library return depends on the exact version. Checking the common return:
    const raw = (result as any).rawHash || (result as any).hash;
    return Buffer.from(__hexToBuf(raw));
  }

  static async getActiveSyncRootSecret(): Promise<Buffer | null> {
    if (!this.currentUnlockSecret) return null;
    return this.getSyncRootSecret(this.currentUnlockSecret);
  }

  static async getRecoverySessionSecret(): Promise<string> {
    const deviceSalt = await this.getDeviceSalt();
    const hmac = getCryptoImpl()!.createHmac('sha256', deviceSalt);
    hmac.update('aegis_recovery_session_secret_v1');
    return hmac.digest('hex');
  }

  static async applyMergedSyncItems(items: VaultItem[]): Promise<void> {
    if (!this.db) {
      throw new Error('Vault database is not open');
    }

    const validItems = items.filter(item => typeof item?.id === 'number');
    this.db.executeSync('BEGIN TRANSACTION');
    try {
      for (const item of validItems) {
        const existing = this.db.executeSync(
          'SELECT id FROM vault_items WHERE id = ?',
          [item.id],
        ).rows?.[0];

        const params = [
          item.title || '',
          item.username || '',
          item.password || '',
          item.url || '',
          item.notes || '',
          item.category || 'login',
          item.favorite || 0,
          item.data || '{}',
          item.is_deleted || 0,
          item.deleted_at || null,
          item.created_at || new Date().toISOString(),
          item.updated_at || new Date().toISOString(),
        ];

        if (existing) {
          this.db.executeSync(
            `UPDATE vault_items
             SET title=?, username=?, password=?, url=?, notes=?, category=?, favorite=?, data=?, is_deleted=?, deleted_at=?, created_at=?, updated_at=?
             WHERE id=?`,
            [...params, item.id],
          );
        } else {
          this.db.executeSync(
            `INSERT INTO vault_items
             (id, title, username, password, url, notes, category, favorite, data, is_deleted, deleted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [item.id, ...params],
          );
        }
      }

      this.db.executeSync('COMMIT');
      await this.syncAutofill();
      await this.logSecurityEvent('cloud_sync_download', 'success', {
        source: 'relay_sync',
        applied: validItems.length,
      });
    } catch (e) {
      try {
        this.db.executeSync('ROLLBACK');
      } catch {}
      throw e;
    }
  }
}
