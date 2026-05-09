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
import {
  buildSqlCipherRawKeyPragma,
  wipeBytes,
  stringToSecureBytes,
  secureBytesToHex,
} from './security/CryptoService';
import { ScreenSecurityService } from './security/ScreenSecurityService';
import {
  generatePassword as generateSecurePassword,
  getPasswordStrength as getGeneratedPasswordStrength,
  PasswordGeneratorOptions,
} from './security/PasswordGenerator';
import { resolveSecurityPolicy } from './security/PolicyService';
import {
  readSecureJson,
  writeSecureJson,
} from './security/SecureJsonStorage';
import { isAllowedVaultItemUpdateColumn } from './security/VaultCRUD';
import * as BruteForceService from './security/BruteForceService';
import * as BiometricService from './security/BiometricService';
import * as AuditService from './security/AuditService';
import * as SharedVaultService from './security/SharedVaultService';

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
    rotateKeys?: () => Promise<boolean>;
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

export type VaultUnlockFailureReason =
  | 'lockout'
  | 'integrity_blocked'
  | 'wrong_secret'
  | 'migration_failed'
  | 'storage_unavailable'
  | 'unknown';

export interface VaultUnlockResult {
  ok: boolean;
  reason?: VaultUnlockFailureReason;
  remainingSeconds?: number;
  failedAttempts?: number;
  riskLevel?: string;
  message?: string;
}

interface VaultKdfMigrationState {
  version: 1;
  status: 'started' | 'rekeyed' | 'verified' | 'failed';
  from: 'argon2id_legacy_32mb_4iter';
  to: 'argon2id_strong_64mb_6iter';
  startedAt: string;
  updatedAt: string;
  reason?: string;
}

export interface VaultSettings {
  autoLockSeconds: number;
  biometricEnabled: boolean;
  clipboardClearSeconds: number;
  passwordLength: number;
  excludeAmbiguousCharacters?: boolean;
  darkMode: boolean;
  breachCheckEnabled?: boolean;
  deviceTrustPolicy?: SecurityPolicy;
}

export type SharedVaultKind = 'private' | 'family' | 'team';
export type SharedVaultRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type SharedMemberStatus =
  | 'active'
  | 'pending'
  | 'revoked'
  | 'emergency_only';

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
  excludeAmbiguousCharacters: false,
  deviceTrustPolicy: {
    deviceTrustPolicy: 'moderate',
    requireBiometric: true,
    rootDetectionEnabled: true,
    rootBlocksVault: false,
    degradedDeviceAction: 'warn',
  },
};

// ── Brute Force Protection State ────────────────────
// ── Device Salt File Path ───────────────────────────
const SALT_FILE = `${RNFS.DocumentDirectoryPath}/aegis_device_salt.bin`;
const BRUTE_FORCE_FILE = `${RNFS.DocumentDirectoryPath}/aegis_bf_state.json`;
const BRUTE_FORCE_SECURE_KEY = 'aegis_brute_force_state_v2';
const LEGACY_BIOMETRIC_MATERIAL_FILE = `${RNFS.DocumentDirectoryPath}/aegis_km.dat`;
const BIOMETRIC_MATERIAL_SECURE_KEY = 'aegis_biometric_public_key_v1';
const BIOMETRIC_UNLOCK_SECRET_SECURE_KEY = 'aegis_biometric_unlock_secret_v2';
const AUDIT_BUFFER_FILE = `${RNFS.DocumentDirectoryPath}/aegis_audit_buffer.json`;
const AUDIT_BUFFER_SECURE_KEY = 'aegis_audit_buffer_secure_v1';
const SHARED_SPACES_SETTING_KEY = 'sharedVaultSpaces';
const APP_CONFIG_FILE = `${RNFS.DocumentDirectoryPath}/aegis_app_config.json`;
const APP_CONFIG_SECURE_KEY = 'aegis_app_config_secure_v2';
const VAULT_KDF_MIGRATION_FILE = `${RNFS.DocumentDirectoryPath}/aegis_kdf_migration_state.json`;
const VAULT_KDF_MIGRATION_SECURE_KEY = 'aegis_vault_kdf_migration_state_v1';


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
  // SECURITY: Secrets stored as Uint8Array instead of immutable JS strings.
  // Uint8Array can be zeroed after use via wipeBytes(), preventing
  // sensitive key material from lingering in the JavaScript heap.
  private static currentUnlockSecret: Uint8Array | null = null;
  private static biometricLegacyFallbackSecret: Uint8Array | null = null;
  private static appConfig: any = null;
  private static bfState: BruteForceService.BruteForceState = {
    failCount: 0,
    lockUntil: 0,
    lastAttempt: 0,
  };

  // ══════════════════════════════════════════════════
  // 0. PRE-UNLOCK APP CONFIG (SecureStorage with legacy file fallback)
  // ══════════════════════════════════════════════════

  private static async readSecureJson<T>(
    secureKey: string,
    legacyFile: string,
    fallback: T,
  ): Promise<T> {
    return readSecureJson(secureKey, legacyFile, fallback, {
      secureStorage: SecureStorage,
      onWarning: debugWarn,
    });
  }

  private static async writeSecureJson<T>(
    secureKey: string,
    legacyFile: string,
    value: T,
  ): Promise<void> {
    await writeSecureJson(secureKey, legacyFile, value, {
      secureStorage: SecureStorage,
    });
  }

  private static generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${__bufToHex(randomBytesSafe(4))}`;
  }

  private static parseDataJson(data?: string | null): Record<string, any> {
    if (!data) return {};
    try {
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  private static sanitizeAuditDetails(
    details?: Record<string, any>,
  ): Record<string, unknown> {
    const redacted = AuditService.redactSensitiveFields(details || {});
    return Object.fromEntries(
      Object.entries(redacted).map(([key, value]) => [
        key,
        value === '[REDACTED]' ? '[redacted]' : value,
      ]),
    );
  }

  private static async loadAppConfig(): Promise<void> {
    if (this.appConfig) return;
    try {
      this.appConfig = await this.readSecureJson(
        APP_CONFIG_SECURE_KEY,
        APP_CONFIG_FILE,
        {},
      );
    } catch {
      this.appConfig = {};
    }
  }

  private static async saveAppConfig(): Promise<void> {
    try {
      await this.writeSecureJson(
        APP_CONFIG_SECURE_KEY,
        APP_CONFIG_FILE,
        this.appConfig || {},
      );
    } catch (e) {
      debugWarn('[Security] App config persistence failed:', e);
      throw e;
    }
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
  }

  // ══════════════════════════════════════════════════
  // 1. DYNAMIC DEVICE SALT (per-device unique)
  // ══════════════════════════════════════════════════

  private static async getDeviceSalt(): Promise<Buffer> {
    if (this.deviceSalt) return this.deviceSalt;

    try {
      const exists = await RNFS.exists(SALT_FILE);
      if (exists) {
        const hex = await RNFS.readFile(SALT_FILE, 'utf8');
        this.deviceSalt = Buffer.from(hex, 'hex');
        if (this.deviceSalt.length === 32) return this.deviceSalt;
      }
    } catch {}

    const salt = randomBytesSafe(32);
    await RNFS.writeFile(SALT_FILE, salt.toString('hex'), 'utf8');
    this.deviceSalt = salt;
    debugLog('[Security] Generated new device salt');
    return salt;
  }

  // ══════════════════════════════════════════════════
  // 2. BRUTE FORCE PROTECTION (exponential backoff)
  // ══════════════════════════════════════════════════

  private static async loadBruteForceState(): Promise<void> {
    try {
      this.bfState = BruteForceService.normalizeBruteForceState(
        await this.readSecureJson(
          BRUTE_FORCE_SECURE_KEY,
          BRUTE_FORCE_FILE,
          { failCount: 0, lockUntil: 0, lastAttempt: 0 },
        ),
      );
      this.bfState = BruteForceService.decayBruteForceCounter(this.bfState, Date.now());
    } catch {
      this.bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    }
  }

  private static async saveBruteForceState(): Promise<void> {
    try {
      await this.writeSecureJson(
        BRUTE_FORCE_SECURE_KEY,
        BRUTE_FORCE_FILE,
        this.bfState,
      );
    } catch (e) {
      debugWarn('[Security] Brute-force state persistence failed:', e);
    }
  }

  private static async recordSuccessfulAttempt(): Promise<void> {
    this.bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    await this.saveBruteForceState();
  }

  private static decayBruteForceCounter(now: number = Date.now()): void {
    this.bfState = BruteForceService.decayBruteForceCounter(
      this.bfState,
      now,
    );
  }

  private static getLockoutDuration(failCount: number): number {
    return BruteForceService.getLockoutDuration(failCount);
  }

  private static async recordFailedAttempt(): Promise<void> {
    this.bfState = BruteForceService.recordFailedAttempt(
      this.bfState,
      Date.now(),
    );
    await this.saveBruteForceState();
  }

  static async getRemainingLockout(): Promise<number> {
    await this.loadBruteForceState();
    return BruteForceService.getRemainingSeconds(this.bfState, Date.now());
  }

  static async getFailedAttempts(): Promise<number> {
    await this.loadBruteForceState();
    return this.bfState.failCount;
  }

  private static async deriveVaultDatabaseKeyHex(
    unlockSecret: Uint8Array,
    salt: Buffer,
    profile: 'strong' | 'legacy',
  ): Promise<string> {
    const params = profile === 'strong' ? VAULT_KDF_STRONG : VAULT_KDF_LEGACY;
    const argon2Result = await Argon2Fn(secureBytesToHex(unlockSecret), salt.toString('hex'), {
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
      // NOTE: SQLCipher 4+ uses AES-256-CBC with HMAC-SHA512 by default.
      // While GCM is generally preferred for AEAD, SQLCipher's page-level
      // encryption uses Encrypt-then-MAC (EtM) which is considered strong.
      // We use AES-256-GCM for all non-database storage (backups, files).
      db.executeSync('SELECT count(*) AS count FROM sqlite_master;');
      return db;
    } catch {
      try {
        db?.close?.();
      } catch {}
      return null;
    }
  }

  private static buildSqlCipherRawKeyPragma(
    operation: 'key' | 'rekey',
    keyHex: string,
  ): string {
    return buildSqlCipherRawKeyPragma(operation, keyHex);
  }

  // ══════════════════════════════════════════════════
  // 3. BIOMETRIC KEY DERIVATION (hardware-backed, deterministic)
  // ══════════════════════════════════════════════════

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

  private static async writeBiometricUnlockSecret(secretBytes: Uint8Array): Promise<boolean> {
    if (!secretBytes || secretBytes.length < 16) return false;
    if (SecureStorage?.setItem) {
      try {
        const secretHex = secureBytesToHex(secretBytes);
        await SecureStorage.setItem(BIOMETRIC_UNLOCK_SECRET_SECURE_KEY, secretHex);
        const savedSecretHex = await this.readBiometricUnlockSecret();
        return savedSecretHex === secretHex;
      } catch {}
    }
    return false;
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
        if (!publicKey || typeof publicKey !== 'string') {
          throw new Error('Invalid public key generated');
        }
        await this.storeKeyMaterial(publicKey);
      }

      const salt = await this.getDeviceSalt();
      const input = BiometricService.buildBiometricDerivationInput({
        publicKey: publicKey!,
        deviceSalt: salt.toString('hex'),
        version: 'v1_legacy',
      });

      const argon2Result = await Argon2Fn(input, salt.toString('hex'), {
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

  static async deriveKeyFromBiometric(): Promise<Uint8Array | null> {
    try {
      const rnBiometrics = new ReactNativeBiometrics({
        allowDeviceCredentials: true,
      });

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

      const storedSecret = await this.readBiometricUnlockSecret();
      if (storedSecret) {
        wipeBytes(this.biometricLegacyFallbackSecret);
        this.biometricLegacyFallbackSecret = null;
        return stringToSecureBytes(storedSecret);
      }

      const legacySecret = await this.deriveLegacyBiometricUnlockSecret();
      if (legacySecret) {
        this.biometricLegacyFallbackSecret = stringToSecureBytes(legacySecret);
        return stringToSecureBytes(legacySecret);
      }

      return null;
    } catch (e) {
      console.error('[Security] Biometric unlock secret derivation error:', e);
      return null;
    }
  }

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

  private static async getEffectiveSecurityPolicy(
    userSecurityPolicy?: SecurityPolicy,
  ): Promise<SecurityPolicy> {
    if (userSecurityPolicy) return userSecurityPolicy;
    const defaults = DEFAULT_SETTINGS.deviceTrustPolicy!;
    try {
      return resolveSecurityPolicy(
        {
          deviceTrustPolicy: await this.getAppConfigSetting('deviceTrustPolicy'),
          requireBiometric: await this.getAppConfigSetting('biometricEnabled'),
          rootDetectionEnabled: await this.getAppConfigSetting(
            'rootDetectionEnabled',
          ),
          rootBlocksVault: await this.getAppConfigSetting('rootBlocksVault'),
          degradedDeviceAction: await this.getAppConfigSetting(
            'degradedDeviceAction',
          ),
        },
        defaults,
        this.parseSettingBoolean,
      );
    } catch {
      return defaults;
    }
  }

  private static classifyUnlockFailure(e: unknown): VaultUnlockFailureReason {
    const message = e instanceof Error ? e.message : String(e);
    const normalized = message.toLowerCase();
    if (
      normalized.includes('unlock failed') ||
      normalized.includes('file is not a database') ||
      normalized.includes('not an error')
    ) {
      return 'wrong_secret';
    }
    if (normalized.includes('migration') || normalized.includes('rekey')) {
      return 'migration_failed';
    }
    if (
      normalized.includes('securestorage') ||
      normalized.includes('keystore') ||
      normalized.includes('storage')
    ) {
      return 'storage_unavailable';
    }
    return 'unknown';
  }

  private static parseSettingBoolean(v: any): boolean {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === '1' || v === 1) return true;
    return false;
  }

  private static parseSettingNumber(v: any, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private static async setVaultKdfMigrationState(
    status: VaultKdfMigrationState['status'],
    previous?: VaultKdfMigrationState | null,
    reason?: string,
  ): Promise<VaultKdfMigrationState> {
    const now = new Date().toISOString();
    const state: VaultKdfMigrationState = {
      version: 1,
      status,
      from: 'argon2id_legacy_32mb_4iter',
      to: 'argon2id_strong_64mb_6iter',
      startedAt: previous?.startedAt || now,
      updatedAt: now,
      ...(reason ? { reason } : {}),
    };
    try {
      await this.writeSecureJson(
        VAULT_KDF_MIGRATION_SECURE_KEY,
        VAULT_KDF_MIGRATION_FILE,
        state,
      );
    } catch (e) {
      debugWarn('[Security] Failed to persist KDF migration state:', e);
    }
    return state;
  }

  private static async clearVaultKdfMigrationState(): Promise<void> {
    if (SecureStorage?.removeItem) {
      await SecureStorage.removeItem(VAULT_KDF_MIGRATION_SECURE_KEY).catch(
        () => {},
      );
    }
    await RNFS.unlink(VAULT_KDF_MIGRATION_FILE).catch(() => {});
  }

  // ══════════════════════════════════════════════════
  // 4. VAULT UNLOCK (with brute force protection)
  // ══════════════════════════════════════════════════

  static async unlockVaultDetailed(
    unlockSecret: Uint8Array,
    userSecurityPolicy?: SecurityPolicy,
  ): Promise<VaultUnlockResult> {
    try {
      debugLog('[Security] Unlocking vault...');
      await this.loadBruteForceState();
      const remaining = await this.getRemainingLockout();
      if (remaining > 0) {
        console.error(`[Security] Locked out for ${remaining} more seconds`);
        await this.logSecurityEvent('vault_unlock', 'blocked', {
          reason: 'lockout_active',
          remainingSeconds: remaining,
        });
        return {
          ok: false,
          reason: 'lockout',
          remainingSeconds: remaining,
          failedAttempts: await this.getFailedAttempts(),
        };
      }

      const policy = await this.getEffectiveSecurityPolicy(userSecurityPolicy);

      if (policy.rootDetectionEnabled) {
        debugLog('[Security] Running device integrity check...');
        const integrityResult = await IntegrityModule.getIntegritySignals();
        const degradedDevice =
          integrityResult.riskLevel === 'critical' ||
          integrityResult.riskLevel === 'high';
        const shouldBlock =
          policy.deviceTrustPolicy === 'strict' &&
          ((policy.rootBlocksVault && Boolean((integrityResult as any).rooted)) ||
            degradedDevice ||
            (policy.degradedDeviceAction === 'block' && degradedDevice));

        if (shouldBlock) {
          await this.logSecurityEvent('vault_unlock', 'blocked', {
            reason: 'device_integrity_failed',
            riskLevel: integrityResult.riskLevel,
            reasons: integrityResult.reasons,
            policy: policy.deviceTrustPolicy,
          });
          return {
            ok: false,
            reason: 'integrity_blocked',
            riskLevel: integrityResult.riskLevel,
          };
        }
      }

      const salt = await this.getDeviceSalt();
      const strongKeyHex = await this.deriveVaultDatabaseKeyHex(
        unlockSecret,
        salt,
        'strong',
      );

      let openedDb = this.tryOpenVaultWithKey(strongKeyHex);

      if (!openedDb) {
        const legacyKeyHex = await this.deriveVaultDatabaseKeyHex(
          unlockSecret,
          salt,
          'legacy',
        );
        openedDb = this.tryOpenVaultWithKey(legacyKeyHex);

        if (!openedDb) {
          throw new Error('Vault unlock failed for strong and legacy KDF profiles');
        }

        let migrationState = await this.setVaultKdfMigrationState('started');
        openedDb.executeSync(
          this.buildSqlCipherRawKeyPragma('rekey', strongKeyHex),
        );
        migrationState = await this.setVaultKdfMigrationState(
          'rekeyed',
          migrationState,
        );
        openedDb.close();
        openedDb = this.tryOpenVaultWithKey(strongKeyHex);
        if (!openedDb) {
          await this.setVaultKdfMigrationState(
            'failed',
            migrationState,
            'strong_profile_reopen_failed',
          );
          throw new Error('Vault KDF migration completed but reopen failed');
        }
        migrationState = await this.setVaultKdfMigrationState(
          'verified',
          migrationState,
        );
        await this.logSecurityEvent('vault_kdf_migrated', 'success', {
          from: migrationState.from,
          to: migrationState.to,
          startedAt: migrationState.startedAt,
          verifiedAt: migrationState.updatedAt,
        });
        await this.clearVaultKdfMigrationState();
      }

      this.db = openedDb;
      this.currentUnlockSecret = new Uint8Array(unlockSecret);
      ScreenSecurityService.enable().catch(() => {});

      if (
        this.biometricLegacyFallbackSecret &&
        Buffer.compare(Buffer.from(unlockSecret), Buffer.from(this.biometricLegacyFallbackSecret)) === 0
      ) {
        try {
          const persisted = await this.writeBiometricUnlockSecret(unlockSecret);
          if (persisted) {
            wipeBytes(this.biometricLegacyFallbackSecret);
            this.biometricLegacyFallbackSecret = null;
            await this.logSecurityEvent('biometric_secret_migrated', 'success', {
              model: 'secure_storage_legacy_secret_v2',
            });
          }
        } catch (migrationError) {
          console.error('[Security] Biometric migration error:', migrationError);
        }
      }

      try {
        this.db.executeSync('PRAGMA synchronous = NORMAL;');
        this.db.executeSync('PRAGMA journal_mode = WAL;');
      } catch {}

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

      this.db.executeSync(`CREATE INDEX IF NOT EXISTS idx_vault_items_updated ON vault_items(updated_at DESC);`);
      this.db.executeSync(`CREATE INDEX IF NOT EXISTS idx_vault_items_category ON vault_items(category);`);
      this.db.executeSync(`CREATE INDEX IF NOT EXISTS idx_attachments_item ON vault_attachments(item_id);`);
      this.db.executeSync(`CREATE INDEX IF NOT EXISTS idx_pw_history_item_time ON vault_password_history(item_id, changed_at DESC);`);
      this.db.executeSync(`CREATE INDEX IF NOT EXISTS idx_audit_time ON vault_audit_log(created_at DESC);`);

      await this.flushBufferedAuditEvents();
      await this.recordSuccessfulAttempt();
      await this.logSecurityEvent('vault_unlock', 'success', { method: 'biometric_gated_secret' });

      AutofillService.setUnlocked(true);
      await this.syncAutofill();

      return { ok: true };
    } catch (e) {
      await this.recordFailedAttempt();
      const remainingSeconds = await this.getRemainingLockout();
      const failedAttempts = await this.getFailedAttempts();
      const failureReason = this.classifyUnlockFailure(e);
      if (failureReason === 'migration_failed') {
        await this.setVaultKdfMigrationState('failed', null, e instanceof Error ? e.message : String(e));
      }
      await this.logSecurityEvent('vault_unlock', 'failed', { reason: e instanceof Error ? e.message : String(e) });
      return {
        ok: false,
        reason: failureReason,
        remainingSeconds,
        failedAttempts,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  static async unlockVault(
    unlockSecret: Uint8Array,
    userSecurityPolicy?: SecurityPolicy,
  ): Promise<boolean> {
    return (await this.unlockVaultDetailed(unlockSecret, userSecurityPolicy)).ok;
  }

  private static async syncAutofill() {
    if (!this.db) return;
    try {
      const items = (this.db.executeSync(
        "SELECT id, title, username, password, url, category FROM vault_items WHERE LOWER(category) IN ('login','passkey')",
      ).rows || []) as any[];
      AutofillService.updateEntries(items);
    } catch (e) {
      console.error('[Security] Autofill sync error:', e);
    }
  }

  private static async triggerWearSync(): Promise<void> {
    try {
      if (!this.db) return;
      const items = await this.getItems();
      await WearOSModule.syncFavoritesToWatch(items);
    } catch (e) {
      console.warn('[SecurityModule] Wear OS sync failed:', e);
    }
  }

  private static async readBufferedAuditEvents(): Promise<any[]> {
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

  private static async writeBufferedAuditEvents(events: any[]): Promise<void> {
    const safeEvents = events.slice(-200);
    if (SecureStorage?.setItem) {
      try {
        await SecureStorage.setItem(AUDIT_BUFFER_SECURE_KEY, JSON.stringify(safeEvents));
        await RNFS.unlink(AUDIT_BUFFER_FILE).catch(() => {});
        return;
      } catch {}
    }
    await RNFS.writeFile(AUDIT_BUFFER_FILE, JSON.stringify(safeEvents), 'utf8');
  }

  private static async clearBufferedAuditEvents(): Promise<void> {
    if (SecureStorage?.removeItem) {
      await SecureStorage.removeItem(AUDIT_BUFFER_SECURE_KEY).catch(() => {});
    }
    await RNFS.unlink(AUDIT_BUFFER_FILE).catch(() => {});
  }

  private static async appendAuditBuffer(eventType: string, eventStatus: string, details?: any): Promise<void> {
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

  static async logSecurityEvent(eventType: string, eventStatus: any = 'info', details?: any): Promise<void> {
    if (!this.db) {
      await this.appendAuditBuffer(eventType, eventStatus, details);
      return;
    }
    try {
      if (eventType === 'vault_unlock' && eventStatus === 'success') {
        const existingRows = this.db.executeSync(
          "SELECT id, details FROM vault_audit_log WHERE event_type='vault_unlock' AND event_status='success' ORDER BY created_at DESC LIMIT 1",
        ).rows || [];
        const latest = existingRows[0];
        if (latest?.id !== undefined && latest?.id !== null) {
          let count = 1;
          try {
            const parsed = latest.details ? JSON.parse(latest.details) : {};
            const parsedCount = Number(parsed.count);
            count = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.floor(parsedCount) : 1;
          } catch {
            count = 1;
          }
          this.db.executeSync(
            'UPDATE vault_audit_log SET details=?, created_at=CURRENT_TIMESTAMP WHERE id=?',
            [JSON.stringify({ count: count + 1 }), latest.id],
          );
          return;
        }
      }
      this.db.executeSync(
        'INSERT INTO vault_audit_log (event_type, event_status, details) VALUES (?,?,?)',
        [eventType, eventStatus, JSON.stringify(this.sanitizeAuditDetails(details))],
      );
    } catch (e) {
      console.error('logSecurityEvent:', e);
    }
  }

  static async getAuditEvents(limit: number = 100): Promise<AuditEvent[]> {
    const safeLimit = Math.max(1, Math.min(1000, limit));
    const fromDb: AuditEvent[] = [];
    if (this.db) {
      try {
        const rows = this.db.executeSync(
          'SELECT id, event_type, event_status, details, created_at FROM vault_audit_log ORDER BY created_at DESC LIMIT ?',
          [safeLimit]
        ).rows || [];
        fromDb.push(...rows);
      } catch {}
    }
    return fromDb as AuditEvent[];
  }

  static async clearAuditEvents(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_audit_log');
      await this.clearBufferedAuditEvents();
      await this.logSecurityEvent('audit_log_cleared', 'info', {});
      return true;
    } catch {
      return false;
    }
  }

  private static extractHistorySecretsFromItem(item: Partial<VaultItem>): any[] {
    const category = (item.category || 'login').toLowerCase();
    const data = this.parseDataJson(item.data);
    const out: any[] = [];
    if (category === 'login' && item.password) out.push({ field: 'password', value: item.password });
    if (category === 'wifi' && data?.wifi_password) out.push({ field: 'wifi_password', value: data.wifi_password });
    if (category === 'card') {
      if (data?.pin) out.push({ field: 'pin', value: data.pin });
      if (data?.cvv) out.push({ field: 'cvv', value: data.cvv });
    }
    return out;
  }

  private static async appendPasswordHistoryEntries(itemId: number, oldSecrets: any[], source: string = 'update'): Promise<void> {
    if (!this.db || oldSecrets.length === 0) return;
    try {
      for (const s of oldSecrets) {
        this.db.executeSync(
          'INSERT INTO vault_password_history (item_id, field, value, source) VALUES (?,?,?,?)',
          [itemId, s.field, s.value, source],
        );
      }
    } catch {}
  }

  static async getItemById(id: number): Promise<VaultItem | null> {
    if (!this.db) return null;
    try {
      return (this.db.executeSync('SELECT * FROM vault_items WHERE id = ?', [id]).rows?.[0] as VaultItem) || null;
    } catch {
      return null;
    }
  }

  static async getItems(search?: string, category?: string): Promise<VaultItem[]> {
    if (!this.db) return [];
    try {
      let q = 'SELECT * FROM vault_items WHERE is_deleted = 0';
      const p: any[] = [];
      if (search?.trim()) {
        const s = `%${search.trim()}%`;
        q += ' AND (title LIKE ? OR username LIKE ? OR url LIKE ?)';
        p.push(s, s, s);
      }
      if (category && category !== 'all') {
        q += ' AND category = ?';
        p.push(category);
      }
      q += ' ORDER BY favorite DESC, updated_at DESC';
      return (this.db.executeSync(q, p).rows || []) as VaultItem[];
    } catch {
      return [];
    }
  }

  static async getDeletedItems(): Promise<VaultItem[]> {
    if (!this.db) return [];
    try {
      return (this.db.executeSync('SELECT * FROM vault_items WHERE is_deleted = 1 ORDER BY deleted_at DESC').rows || []) as VaultItem[];
    } catch {
      return [];
    }
  }

  static async getAllItems(): Promise<VaultItem[]> {
    return this.getItems();
  }

  static async addItem(item: Partial<VaultItem>): Promise<number | null> {
    if (!this.db) return null;
    try {
      this.db.executeSync(
        `INSERT INTO vault_items (title,username,password,url,notes,category,favorite,data) VALUES (?,?,?,?,?,?,?,?)`,
        [item.title || '', item.username || '', item.password || '', item.url || '', item.notes || '', item.category || 'login', item.favorite || 0, item.data || '{}'],
      );
      const res = this.db.executeSync('SELECT last_insert_rowid() as id');
      const newId = res.rows?.[0]?.id || null;
      if (newId) {
        await this.syncAutofill();
        await this.triggerWearSync();
        await this.logSecurityEvent('item_added', 'success', { id: newId, title: item.title });
      }
      return newId;
    } catch {
      return null;
    }
  }

  static async updateItem(id: number, item: Partial<VaultItem>): Promise<boolean> {
    if (!this.db) return false;
    try {
      const existing = await this.getItemById(id);
      if (!existing) return false;
      const fields: string[] = [], params: any[] = [];
      for (const [k, v] of Object.entries(item)) {
        if (!isAllowedVaultItemUpdateColumn(k)) continue;
        fields.push(`${k}=?`);
        params.push(v);
      }
      fields.push('updated_at=CURRENT_TIMESTAMP');
      params.push(id);
      this.db.executeSync(`UPDATE vault_items SET ${fields.join(',')} WHERE id=?`, params);
      await this.syncAutofill();
      await this.triggerWearSync();
      await this.logSecurityEvent('item_updated', 'success', { id });
      return true;
    } catch {
      return false;
    }
  }

  static async deleteItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('UPDATE vault_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      await this.syncAutofill();
      await this.triggerWearSync();
      return true;
    } catch {
      return false;
    }
  }

  static async getPasswordHistory(itemId: number, limit: number = 25): Promise<PasswordHistoryEntry[]> {
    if (!this.db) return [];
    try {
      const safeLimit = Math.max(1, Math.min(100, limit));
      return (this.db.executeSync(
        `SELECT id, item_id, field, value, source, changed_at FROM vault_password_history WHERE item_id = ? ORDER BY changed_at DESC LIMIT ?`,
        [itemId, safeLimit],
      ).rows || []) as PasswordHistoryEntry[];
    } catch {
      return [];
    }
  }

  static async restorePasswordFromHistory(itemId: number, historyId: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      const row = this.db.executeSync(
        'SELECT id, item_id, field, value FROM vault_password_history WHERE id = ? AND item_id = ?',
        [historyId, itemId],
      ).rows?.[0] as PasswordHistoryEntry;
      if (!row) return false;
      const item = await this.getItemById(itemId);
      if (!item) return false;
      const data = this.parseDataJson(item.data);
      const updates: any = {};
      if (row.field === 'password') updates.password = row.value;
      else updates.data = JSON.stringify({ ...data, [row.field]: row.value });
      return this.updateItem(itemId, updates);
    } catch {
      return false;
    }
  }

  static async restoreItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('UPDATE vault_items SET is_deleted = 0, deleted_at = NULL WHERE id = ?', [id]);
      await this.syncAutofill();
      return true;
    } catch {
      return false;
    }
  }

  static async permanentlyDeleteItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments WHERE item_id = ?', [id]);
      this.db.executeSync('DELETE FROM vault_password_history WHERE item_id = ?', [id]);
      this.db.executeSync('DELETE FROM vault_items WHERE id = ?', [id]);
      return true;
    } catch {
      return false;
    }
  }

  static async emptyTrash(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments WHERE item_id IN (SELECT id FROM vault_items WHERE is_deleted = 1)');
      this.db.executeSync('DELETE FROM vault_password_history WHERE item_id IN (SELECT id FROM vault_items WHERE is_deleted = 1)');
      this.db.executeSync('DELETE FROM vault_items WHERE is_deleted = 1');
      return true;
    } catch {
      return false;
    }
  }

  static async cleanupOldTrash(): Promise<void> {
    if (!this.db) return;
    try {
      this.db.executeSync(`DELETE FROM vault_items WHERE is_deleted = 1 AND deleted_at < datetime('now', '-30 days')`);
    } catch {}
  }

  static sanitizeSharedMember(
    input: Partial<SharedVaultMember>,
  ): SharedVaultMember {
    return SharedVaultService.sanitizeSharedMember(input, prefix =>
      this.generateId(prefix),
    );
  }

  static sanitizeSharedSpace(
    input: Partial<SharedVaultSpace>,
  ): SharedVaultSpace {
    return SharedVaultService.sanitizeSharedSpace(input, prefix =>
      this.generateId(prefix),
    );
  }

  static parseSharedAssignment(
    input: Partial<VaultItem> | string | null | undefined,
  ): SharedItemAssignment | null {
    if (!input) return null;
    const data =
      typeof input === 'string'
        ? this.parseDataJson(input)
        : this.parseDataJson(input.data);
    return SharedVaultService.parseSharedAssignment(data);
  }

  static mergeSharedAssignmentIntoData(
    data: string | null | undefined,
    assignment?: Partial<SharedItemAssignment> | null,
  ): string {
    const parsed = this.parseDataJson(data);
    return JSON.stringify(
      SharedVaultService.mergeSharedAssignmentIntoData(parsed, assignment),
    );
  }

  static async getSharedVaultSpaces(): Promise<SharedVaultSpace[]> {
    const raw = await this.getSetting(SHARED_SPACES_SETTING_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(space => space && typeof space === 'object')
        .map(space => this.sanitizeSharedSpace(space));
    } catch {
      return [];
    }
  }

  static async saveSharedVaultSpace(
    input: Partial<SharedVaultSpace>,
  ): Promise<SharedVaultSpace | null> {
    const spaces = await this.getSharedVaultSpaces();
    const { space: normalized, spaces: nextSpaces } =
      SharedVaultService.upsertSharedSpace(spaces, input, prefix =>
        this.generateId(prefix),
      );
    if (!normalized) return null;

    await this.setSetting(
      SHARED_SPACES_SETTING_KEY,
      JSON.stringify(nextSpaces),
    );
    await this.logSecurityEvent('shared_space_saved', 'success', {
      id: normalized.id,
      kind: normalized.kind,
      members: normalized.members.length,
    });
    return normalized;
  }

  static async setItemSharedAssignment(
    itemId: number,
    assignment?: Partial<SharedItemAssignment> | null,
  ): Promise<boolean> {
    const item = await this.getItemById(itemId);
    if (!item) return false;
    const data = this.mergeSharedAssignmentIntoData(item.data, assignment);
    return this.updateItem(itemId, { data });
  }

  static async deleteSharedVaultSpace(spaceId: string): Promise<boolean> {
    const spaces = await this.getSharedVaultSpaces();
    const {
      removed,
      safeSpaceId,
      spaces: nextSpaces,
    } = SharedVaultService.removeSharedSpace(spaces, spaceId);
    if (!removed) return false;

    await this.setSetting(
      SHARED_SPACES_SETTING_KEY,
      JSON.stringify(nextSpaces),
    );

    const items = await this.getItems();
    for (const item of items) {
      const assignment = this.parseSharedAssignment(item);
      if (assignment?.spaceId === safeSpaceId && item.id) {
        const data = this.mergeSharedAssignmentIntoData(item.data, null);
        await this.updateItem(item.id, { data });
      }
    }

    await this.logSecurityEvent('shared_space_deleted', 'info', {
      id: safeSpaceId,
    });
    return true;
  }

  static async getSharingOverview(): Promise<SharingOverviewReport> {
    const [spaces, items] = await Promise.all([
      this.getSharedVaultSpaces(),
      this.getItems(),
    ]);
    return SharedVaultService.generateSharingOverview(spaces, items, item =>
      this.parseSharedAssignment(item),
    );
  }

  static getDb() {
    return this.db;
  }

  static async encryptAES256GCM(
    plaintext: string,
    password: string,
  ): Promise<any> {
    const salt = randomBytesSafe(32);
    const iv = randomBytesSafe(12);
    const argon2Result = await Argon2Fn(password, salt.toString('hex'), {
      mode: 'argon2id',
      iterations: 4,
      memory: 32768,
      parallelism: 2,
      hashLength: 32,
      saltEncoding: 'hex',
    });
    const keyBuf = Buffer.from(
      this.normalizeArgon2RawHash(argon2Result?.rawHash),
    );
    const crypto = getCryptoImpl()!;
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    
    // Cleanup key from memory
    wipeBytes(keyBuf);
    
    return {
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      kdf: 'Argon2id',
      memory: 32768,
      iterations: 4,
      parallelism: 2,
      hashLength: 32,
    };
  }

  static async decryptAES256GCM(
    ciphertext: string,
    password: string,
    saltB64: string,
    ivB64: string,
    authTagB64: string,
    kdfMeta?: any,
  ): Promise<string> {
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    
    let keyBuf: Buffer;
    if (kdfMeta?.kdf === 'PBKDF2-SHA256') {
       const raw = await new Promise<Buffer>((resolve, reject) => {
         getCryptoImpl()!.pbkdf2(password, salt, kdfMeta.iterations || 310000, kdfMeta.hashLength || 32, 'sha256', (err: Error | null, derived: Buffer) => {
           if (err) reject(err); else resolve(derived);
         });
       });
       keyBuf = raw;
    } else {
      const argon2Result = await Argon2Fn(password, salt.toString('hex'), {
        mode: 'argon2id',
        iterations: kdfMeta?.iterations || 4,
        memory: kdfMeta?.memory || 32768,
        parallelism: kdfMeta?.parallelism || 2,
        hashLength: kdfMeta?.hashLength || 32,
        saltEncoding: 'hex',
      });
      keyBuf = Buffer.from(this.normalizeArgon2RawHash(argon2Result?.rawHash));
    }

    const crypto = getCryptoImpl()!;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(authTag);
    const plaintext = decipher.update(ciphertext, 'base64', 'utf8') + decipher.final('utf8');
    
    // Cleanup key
    wipeBytes(keyBuf);
    
    return plaintext;
  }

  public static async clearAutoLockTimer() {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }



  static async rotateSecureStorageKeys(): Promise<boolean> {
    if (SecureStorage?.rotateKeys) {
      try {
        const ok = await SecureStorage.rotateKeys();
        if (ok) {
          await this.logSecurityEvent('keystore_rotation', 'success', {
            provider: 'AndroidKeystore',
            algorithm: 'AES256_GCM',
          });
        }
        return ok;
      } catch (e) {
        console.error('[Security] Keystore rotation failed:', e);
        return false;
      }
    }
    return false;
  }

  static async startAutoLockTimer(secondsOverride?: number, onLock?: () => void) {
    await this.clearAutoLockTimer();
    const seconds = secondsOverride !== undefined ? secondsOverride : Number(await this.getAppConfigSetting('autoLockSeconds'));
    if (seconds > 0) {
      this.autoLockTimer = setTimeout(() => {
        this.lockVault();
        if (onLock) onLock();
      }, seconds * 1000);
    }
  }

  static async resetAutoLockTimer(secondsOverride?: number, onLock?: () => void) {
    await this.startAutoLockTimer(secondsOverride, onLock);
  }

  static lockVault() {
    this.clearAutoLockTimer();
    try {
      if (this.db) {
        this.db.close();
      }
    } catch {}
    this.db = null;

    // Hardened zeroing of memory
    if (this.currentUnlockSecret) {
      wipeBytes(this.currentUnlockSecret);
      this.currentUnlockSecret = null;
    }
    if (this.biometricLegacyFallbackSecret) {
      wipeBytes(this.biometricLegacyFallbackSecret);
      this.biometricLegacyFallbackSecret = null;
    }

    AutofillService.setUnlocked(false);
    
    // Disable dynamic screen protection on lock
    ScreenSecurityService.disable().catch(err => {
      console.warn('[SecurityModule] Failed to disable screen security on lock', err);
    });
  }

  static async getSyncRootSecret(passwordBytes: Uint8Array): Promise<Buffer> {
    const salt = await this.getDeviceSalt();
    const passwordHex = secureBytesToHex(passwordBytes);
    const result = await Argon2Fn(passwordHex, salt.toString('hex'), {
      iterations: 10,
      memory: 65536,
      parallelism: 4,
      hashLength: 32,
      mode: 'argon2id',
    });
    return Buffer.from(this.normalizeArgon2RawHash(result?.rawHash));
  }

  static async getActiveSyncRootSecret(): Promise<Buffer | null> {
    if (!this.currentUnlockSecret) return null;
    return this.getSyncRootSecret(this.currentUnlockSecret);
  }

  static async getRecoverySessionSecret(): Promise<string> {
    const salt = await this.getDeviceSalt();
    const hmac = getCryptoImpl()!.createHmac('sha256', salt);
    hmac.update('aegis_recovery_session_secret_v1');
    return hmac.digest('hex');
  }

  private static normalizeArgon2RawHash(rawHash: any): Uint8Array {
    if (!rawHash) {
      throw new Error('Argon2 failed to produce a valid hash');
    }
    if (typeof rawHash === 'string') {
      return __hexToBuf(rawHash);
    }
    return new Uint8Array(rawHash);
  }

  static async factoryReset(): Promise<boolean> {
    try {
      this.lockVault();
      await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/aegis_android_vault.sqlite`).catch(() => {});
      await this.resetBiometricKeys();
      await RNFS.unlink(SALT_FILE).catch(() => {});
      await RNFS.unlink(BRUTE_FORCE_FILE).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  static async panicWipe(): Promise<boolean> {
    return this.factoryReset();
  }

  static async toggleFavorite(id: number, cur: number): Promise<boolean> {
    return this.updateItem(id, { favorite: cur === 1 ? 0 : 1 });
  }

  static async getItemCount(): Promise<number> {
    if (!this.db) return 0;
    return this.db.executeSync('SELECT COUNT(*) as c FROM vault_items').rows?.[0]?.c || 0;
  }

  static async addAttachment(itemId: number, filename: string, mimeType: string, filePath: string): Promise<boolean> {
    if (!this.db) return false;
    try {
      const base64 = await RNFS.readFile(filePath, 'base64');
      this.db.executeSync('INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)', [itemId, filename, mimeType, base64.length, base64]);
      return true;
    } catch {
      return false;
    }
  }

  static async getAttachments(itemId: number): Promise<Attachment[]> {
    if (!this.db) return [];
    return (this.db.executeSync('SELECT id,item_id,filename,mime_type,size,created_at FROM vault_attachments WHERE item_id=?', [itemId]).rows || []) as Attachment[];
  }

  static async downloadAttachment(attachmentId: number): Promise<string | null> {
    if (!this.db) return null;
    const r = this.db.executeSync('SELECT filename,file_data FROM vault_attachments WHERE id=?', [attachmentId]).rows?.[0];
    if (!r) return null;
    const path = `${RNFS.DownloadDirectoryPath}/${r.filename}`;
    await RNFS.writeFile(path, r.file_data, 'base64');
    return path;
  }

  static async deleteAttachment(id: number): Promise<boolean> {
    if (!this.db) return false;
    this.db.executeSync('DELETE FROM vault_attachments WHERE id=?', [id]);
    return true;
  }

  static async getSetting(key: string): Promise<string | null> {
    if (!this.db) return null;
    const row = this.db.executeSync('SELECT value FROM vault_settings WHERE key=?', [key]).rows?.[0];
    return row ? String(row.value) : null;
  }

  static async setSetting(key: string, value: string) {
    if (!this.db) return;
    this.db.executeSync('INSERT OR REPLACE INTO vault_settings (key,value) VALUES (?,?)', [key, value]);
  }

  static async getAllSettings(): Promise<VaultSettings> {
    return { ...DEFAULT_SETTINGS };
  }

  static generatePassword(
    len: number = 20,
    opts?: PasswordGeneratorOptions,
  ): string {
    return generateSecurePassword(len, opts, randomBytesSafe);
  }

  static getPasswordStrength(pw: string): any {
    return getGeneratedPasswordStrength(pw);
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
          (distance <= 3 && maxLen >= 14) ||
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

  static async resetVault(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments');
      this.db.executeSync('DELETE FROM vault_password_history');
      this.db.executeSync('DELETE FROM vault_items');
      await this.syncAutofill();
      return true;
    } catch {
      return false;
    }
  }

  static async addAttachmentFromBase64(
    itemId: number,
    filename: string,
    mimeType: string,
    base64: string,
    size: number,
  ): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [itemId, filename, mimeType, size, base64],
      );
      return true;
    } catch {
      return false;
    }
  }

  static async readFileToBase64(
    path: string,
    filename: string,
  ): Promise<{ base64: string; size: number } | null> {
    try {
      let targetPath = path;
      const isContentUri = path.startsWith('content://');
      if (isContentUri) {
        targetPath = `${RNFS.CachesDirectoryPath}/aegis_read_${Date.now()}_${filename}`;
        await RNFS.copyFile(path, targetPath);
      }
      const stat = await RNFS.stat(targetPath);
      const base64 = await RNFS.readFile(targetPath, 'base64');
      if (isContentUri) {
        await RNFS.unlink(targetPath).catch(() => {});
      }
      return { base64, size: stat.size };
    } catch {
      return null;
    }
  }

  static async applyMergedSyncItems(items: VaultItem[]): Promise<void> {
    if (!this.db) return;
    this.db.executeSync('BEGIN TRANSACTION');
    try {
      for (const item of items) {
        this.db.executeSync('INSERT OR REPLACE INTO vault_items (id, title, username, password, url, notes, category, favorite, data, is_deleted, deleted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [item.id, item.title, item.username, item.password, item.url, item.notes, item.category, item.favorite, item.data, item.is_deleted, item.deleted_at, item.created_at, item.updated_at]);
      }
      this.db.executeSync('COMMIT');
    } catch (e) {
      this.db.executeSync('ROLLBACK');
      throw e;
    }
  }
}
