import { open } from '@op-engineering/op-sqlite';
import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import RNFS from 'react-native-fs';
import ReactNativeBiometrics from 'react-native-biometrics';
import { AutofillService } from './AutofillService';
import Argon2 from 'react-native-argon2';
import i18n from './i18n';

// ── Pure JS Helper for robustness to replace buggy React Native Buffer ──
const _b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function __bufToBase64(buf: any): string {
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

function __bufToUtf8(buf: any): string {
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : (buf as any).buffer || buf);
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

function __base64ToBuf(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
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

function __hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function __bufToHex(buf: any): string {
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : (buf as any).buffer || buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += bytes[i].toString(16).padStart(2, '0');
  }
  return str;
}

const QC: any = (QuickCrypto as any)?.default ?? (QuickCrypto as any);
const Argon2Fn: any = (Argon2 as any)?.default ?? (Argon2 as any);

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

export interface VaultSettings {
  autoLockSeconds: number;
  biometricEnabled: boolean;
  clipboardClearSeconds: number;
  passwordLength: number;
  darkMode: boolean;
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
  clipboardClearSeconds: 30,
  passwordLength: 20,
  darkMode: false,
};

// ── Brute Force Protection State ────────────────────
interface BruteForceState {
  failCount: number;
  lockUntil: number; // timestamp
  lastAttempt: number;
}

// ── Device Salt File Path ───────────────────────────
const SALT_FILE = `${RNFS.DocumentDirectoryPath}/aegis_device_salt.bin`;
const BRUTE_FORCE_FILE = `${RNFS.DocumentDirectoryPath}/aegis_bf_state.json`;
const AUDIT_BUFFER_FILE = `${RNFS.DocumentDirectoryPath}/aegis_audit_buffer.json`;
const BACKUP_PBKDF2_FALLBACK_ITERATIONS = 310000;
const BACKUP_KDF_DEFAULT = {
  algorithm: 'Argon2id',
  memory: 32768,
  iterations: 4,
  parallelism: 2,
  hashLength: 32,
} as const;

// ═══════════════════════════════════════════════════
export class SecurityModule {
  private static db: any = null;
  private static autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  public static isPickingFileFlag: boolean = false;
  private static deviceSalt: Buffer | null = null;
  private static bfState: BruteForceState = {
    failCount: 0,
    lockUntil: 0,
    lastAttempt: 0,
  };

  // ══════════════════════════════════════════════════
  // 1. DYNAMIC DEVICE SALT (per-device unique)
  // ══════════════════════════════════════════════════

  /**
   * Gets or generates a unique 32-byte device salt.
   * Stored in app's private document directory (sandboxed on Android).
   * Each device/installation has its own unique salt.
   */
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

    // Generate new 32-byte cryptographic random salt
    const salt = randomBytesSafe(32);
    await RNFS.writeFile(SALT_FILE, salt.toString('hex'), 'utf8');
    this.deviceSalt = salt;
    console.log('[Security] Generated new device salt');
    return salt;
  }

  // ══════════════════════════════════════════════════
  // 2. BRUTE FORCE PROTECTION (exponential backoff)
  // ══════════════════════════════════════════════════

  /**
   * Exponential backoff schedule:
   * 1-4 fails:  no delay
   * 5 fails:    30 sec lockout
   * 6 fails:    60 sec lockout
   * 7 fails:    2 min lockout
   * 8 fails:    5 min lockout
   * 9 fails:    10 min lockout
   * 10+ fails:  30 min lockout
   */
  private static getLockoutDuration(failCount: number): number {
    if (failCount < 5) return 0;
    const durations = [30, 60, 120, 300, 600, 1800];
    const idx = Math.min(failCount - 5, durations.length - 1);
    return durations[idx] * 1000; // ms
  }

  private static async loadBruteForceState(): Promise<void> {
    try {
      const exists = await RNFS.exists(BRUTE_FORCE_FILE);
      if (exists) {
        const json = await RNFS.readFile(BRUTE_FORCE_FILE, 'utf8');
        this.bfState = JSON.parse(json);
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
    this.bfState.failCount++;
    this.bfState.lastAttempt = Date.now();
    const lockDuration = this.getLockoutDuration(this.bfState.failCount);
    if (lockDuration > 0) {
      this.bfState.lockUntil = Date.now() + lockDuration;
    }
    await this.saveBruteForceState();
    console.log('[Security] Failed unlock attempt recorded');
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
   * - Biometric verification required before key derivation
   * - Key material zeroed after use
   */
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
        cancelButtonText: 'Cancel', // OS level default
      });
      if (!success) {
        console.log('[Security] Biometric verification cancelled');
        return null;
      }

      // Step 2: Get or create the Keystore-backed key material
      let publicKey = await this.getStoredKeyMaterial();

      if (!publicKey) {
        // First time setup: create keys in Android Keystore
        console.log(
          '[Security] First-time setup: creating Android Keystore keys...',
        );
        const { keysExist } = await rnBiometrics.biometricKeysExist();

        if (keysExist) {
          // Keys exist but we don't have the public key stored
          // Delete and recreate to capture the public key
          await rnBiometrics.deleteKeys();
        }

        const result = await rnBiometrics.createKeys();
        publicKey = result.publicKey;

        // Store the public key for deterministic derivation
        await this.storeKeyMaterial(publicKey);
        console.log('[Security] Keystore keys created and public key stored');
      }

      // Step 3: Derive deterministic vault key
      // Argon2id(publicKey, deviceSalt, 32MB, 4 iter, 2 threads)
      const salt = await this.getDeviceSalt();
      const argon2Result = await Argon2Fn(publicKey!, salt.toString('hex'), {
        mode: 'argon2id',
        memory: 32768,
        iterations: 4,
        parallelism: 2,
        hashLength: 32,
        saltEncoding: 'hex',
      });

      const keyHex = argon2Result.rawHash;
      const derivedKey = Buffer.from(keyHex, 'hex');

      // Zero out key material
      for (let i = 0; i < derivedKey.length; i++) (derivedKey as any)[i] = 0;

      console.log(
        '[Security] Biometric key derived successfully using Argon2id',
      );
      return keyHex;
    } catch (e) {
      console.error('[Security] Biometric key derivation error:', e);
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
      const kmPath = `${RNFS.DocumentDirectoryPath}/aegis_km.dat`;
      await RNFS.unlink(kmPath).catch(() => {});
      await this.logSecurityEvent('biometric_reset', 'success', {});
      console.log('[Security] Biometric keys reset');
    } catch (e) {
      await this.logSecurityEvent('biometric_reset', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('[Security] Error resetting biometric keys:', e);
    }
  }

  private static async getStoredKeyMaterial(): Promise<string | null> {
    const path = `${RNFS.DocumentDirectoryPath}/aegis_km.dat`;
    try {
      if (await RNFS.exists(path)) {
        const data = await RNFS.readFile(path, 'utf8');
        if (data && data.length > 10) return data; // valid key material
      }
    } catch {}
    return null;
  }

  private static async storeKeyMaterial(material: string): Promise<void> {
    const path = `${RNFS.DocumentDirectoryPath}/aegis_km.dat`;
    try {
      await RNFS.writeFile(path, material, 'utf8');
    } catch {}
  }

  // ══════════════════════════════════════════════════
  // 4. VAULT UNLOCK (with brute force protection)
  // ══════════════════════════════════════════════════

  /**
   * Unlock the vault with a derived key.
   * Includes brute force protection with exponential backoff.
   */
  static async unlockVault(password: string): Promise<boolean> {
    try {
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

      const salt = await this.getDeviceSalt();

      // GPU-resistant Argon2id KDF derivation
      const argon2Result = await Argon2Fn(password, salt.toString('hex'), {
        mode: 'argon2id',
        memory: 32768,
        iterations: 4,
        parallelism: 2,
        hashLength: 32,
        saltEncoding: 'hex',
      });
      const keyBuf = Buffer.from(argon2Result.rawHash, 'hex');

      console.log('[Security] Argon2id derivation completed');

      this.db = open({
        name: 'aegis_android_vault.sqlite',
        encryptionKey: Buffer.from(keyBuf).toString('hex'),
      });

      // Schema
      this.db.executeSync(`
        CREATE TABLE IF NOT EXISTS vault_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL, username TEXT DEFAULT '', password TEXT DEFAULT '',
          url TEXT DEFAULT '', notes TEXT DEFAULT '', category TEXT DEFAULT 'login',
          favorite INTEGER DEFAULT 0, data TEXT DEFAULT '{}',
          is_deleted INTEGER DEFAULT 0,
          deleted_at DATETIME DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      this.db.executeSync(`
        CREATE TABLE IF NOT EXISTS vault_attachments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL, filename TEXT NOT NULL,
          mime_type TEXT DEFAULT '', size INTEGER DEFAULT 0,
          file_data TEXT DEFAULT '',
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
      this.db.executeSync(
        `CREATE INDEX IF NOT EXISTS idx_audit_time ON vault_audit_log(created_at DESC);`,
      );
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
        `CREATE INDEX IF NOT EXISTS idx_pw_history_item_time ON vault_password_history(item_id, changed_at DESC);`,
      );

      await this.flushBufferedAuditEvents();

      // Migration: add missing columns if updating
      try {
        this.db.executeSync(
          "ALTER TABLE vault_items ADD COLUMN data TEXT DEFAULT '{}'",
        );
      } catch {}
      try {
        this.db.executeSync(
          'ALTER TABLE vault_items ADD COLUMN is_deleted INTEGER DEFAULT 0',
        );
      } catch {}
      try {
        this.db.executeSync(
          'ALTER TABLE vault_items ADD COLUMN deleted_at DATETIME DEFAULT NULL',
        );
      } catch {}

      // Zero out key material
      for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;

      // Record successful attempt (reset brute force counter)
      await this.recordSuccessfulAttempt();
      await this.logSecurityEvent('vault_unlock', 'success', {
        method: 'biometric_derived_key',
      });

      AutofillService.setUnlocked(true);
      await this.syncAutofill();

      console.log('[Security] Vault unlocked. Dynamic salt + Argon2id.');
      return true;
    } catch (e) {
      // Record failed attempt
      await this.recordFailedAttempt();
      await this.logSecurityEvent('vault_unlock', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('Unlock failed:', e);
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

  // ── Items CRUD ────────────────────────────────────
  private static async appendAuditBuffer(
    eventType: string,
    eventStatus: AuditEvent['event_status'],
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      let events: Array<{
        event_type: string;
        event_status: AuditEvent['event_status'];
        details: string;
        created_at: string;
      }> = [];

      const exists = await RNFS.exists(AUDIT_BUFFER_FILE);
      if (exists) {
        const raw = await RNFS.readFile(AUDIT_BUFFER_FILE, 'utf8');
        events = raw ? JSON.parse(raw) : [];
      }

      events.push({
        event_type: eventType,
        event_status: eventStatus,
        details: JSON.stringify(details || {}),
        created_at: new Date().toISOString(),
      });

      if (events.length > 200) {
        events = events.slice(events.length - 200);
      }

      await RNFS.writeFile(AUDIT_BUFFER_FILE, JSON.stringify(events), 'utf8');
    } catch (e) {
      console.error('appendAuditBuffer:', e);
    }
  }

  private static async flushBufferedAuditEvents(): Promise<void> {
    if (!this.db) return;
    try {
      const exists = await RNFS.exists(AUDIT_BUFFER_FILE);
      if (!exists) return;

      const raw = await RNFS.readFile(AUDIT_BUFFER_FILE, 'utf8');
      const events = (raw ? JSON.parse(raw) : []) as Array<{
        event_type: string;
        event_status: AuditEvent['event_status'];
        details: string;
        created_at: string;
      }>;

      for (const ev of events) {
        this.db.executeSync(
          'INSERT INTO vault_audit_log (event_type, event_status, details, created_at) VALUES (?,?,?,?)',
          [ev.event_type, ev.event_status, ev.details || '{}', ev.created_at],
        );
      }

      await RNFS.unlink(AUDIT_BUFFER_FILE).catch(() => {});
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
        [eventType, eventStatus, JSON.stringify(details || {})],
      );
    } catch (e) {
      console.error('logSecurityEvent:', e);
    }
  }

  static async getAuditEvents(limit: number = 100): Promise<AuditEvent[]> {
    if (!this.db) return [];
    try {
      const safeLimit = Math.max(1, Math.min(500, limit));
      return (this.db.executeSync(
        `SELECT id, event_type, event_status, details, created_at
         FROM vault_audit_log
         ORDER BY created_at DESC
         LIMIT ${safeLimit}`,
      ).rows || []) as AuditEvent[];
    } catch (e) {
      console.error('getAuditEvents:', e);
      return [];
    }
  }

  static async clearAuditEvents(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_audit_log');
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
      ).rows || []) as VaultItem[];
    } catch (e) {
      console.error('getDeletedItems:', e);
      return [];
    }
  }

  static async addItem(item: Partial<VaultItem>): Promise<number | null> {
    if (!this.db) return null;
    try {
      const r = this.db.executeSync(
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
      const newId =
        r.insertId || r.rowsAffected
          ? this.db.executeSync('SELECT last_insert_rowid() as id').rows?.[0]
              ?.id
          : null;
      if (newId) await this.syncAutofill();
      return newId;
    } catch (e) {
      console.error('addItem:', e);
      return null;
    }
  }

  static async updateItem(
    id: number,
    item: Partial<VaultItem>,
  ): Promise<boolean> {
    if (!this.db) return false;
    try {
      const existing = this.db.executeSync(
        'SELECT * FROM vault_items WHERE id = ?',
        [id],
      ).rows?.[0] as VaultItem | undefined;
      if (!existing) return false;

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
      return true;
    } catch (e) {
      console.error('updateItem:', e);
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
         LIMIT ${safeLimit}`,
        [itemId],
      ).rows || []) as PasswordHistoryEntry[];
    } catch (e) {
      console.error('getPasswordHistory:', e);
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
      console.log('[Security] Old trash items cleaned up');
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

      await this.logSecurityEvent('factory_reset', 'success', {});
      console.log('[Security] Factory reset complete');
      return true;
    } catch (e) {
      await this.logSecurityEvent('factory_reset', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('[Security] Factory reset failed:', e);
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
        console.warn('Primary read failed, trying direct read:', readErr);
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
      console.log('[Attachment] File added to vault item');
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
        } catch {
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
      return (
        this.db.executeSync('SELECT value FROM vault_settings WHERE key=?', [
          key,
        ]).rows?.[0]?.value || null
      );
    } catch {
      return null;
    }
  }
  static async setSetting(key: string, value: string) {
    if (!this.db) return;
    try {
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
      const al = await this.getSetting('autoLockSeconds');
      if (al) s.autoLockSeconds = parseInt(al);
      const bio = await this.getSetting('biometricEnabled');
      if (bio) s.biometricEnabled = bio === 'true';
      const cl = await this.getSetting('clipboardClearSeconds');
      if (cl) s.clipboardClearSeconds = parseInt(cl);
      const pl = await this.getSetting('passwordLength');
      if (pl) s.passwordLength = parseInt(pl);
      const dm = await this.getSetting('darkMode');
      if (dm) s.darkMode = dm === 'true';
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
      score < 45
        ? 'critical'
        : score < 65
        ? 'high'
        : score < 80
        ? 'medium'
        : 'low';

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
    console.log('[ENC-DEBUG] Step 1: generating salt and iv');
    const salt = randomBytesSafe(32);
    const iv = randomBytesSafe(12);
    console.log('[ENC-DEBUG] Step 1 OK: salt=', salt.length, 'iv=', iv.length);

    let keyBuf: Buffer;
    let kdfMeta:
      | {
          kdf: 'Argon2id';
          memory: number;
          iterations: number;
          parallelism: number;
          hashLength: number;
        }
      | {
          kdf: 'PBKDF2-SHA256';
          iterations: number;
          hashLength: number;
        };

    console.log('[ENC-DEBUG] Step 2: Argon2Fn type=', typeof Argon2Fn, 'value=', Argon2Fn);
    const hasArgon2 = typeof Argon2Fn === 'function';
    console.log('[ENC-DEBUG] Step 2: hasArgon2=', hasArgon2);
    if (hasArgon2) {
      try {
        console.log('[ENC-DEBUG] Step 2a: calling Argon2Fn...');
        const argon2Result = await Argon2Fn(password, salt.toString('hex'), {
          mode: 'argon2id',
          memory: BACKUP_KDF_DEFAULT.memory,
          iterations: BACKUP_KDF_DEFAULT.iterations,
          parallelism: BACKUP_KDF_DEFAULT.parallelism,
          hashLength: BACKUP_KDF_DEFAULT.hashLength,
          saltEncoding: 'hex',
        });
        console.log('[ENC-DEBUG] Step 2a OK: argon2Result keys=', Object.keys(argon2Result || {}));
        keyBuf = Buffer.from(argon2Result.rawHash, 'hex');
        kdfMeta = {
          kdf: 'Argon2id',
          memory: BACKUP_KDF_DEFAULT.memory,
          iterations: BACKUP_KDF_DEFAULT.iterations,
          parallelism: BACKUP_KDF_DEFAULT.parallelism,
          hashLength: BACKUP_KDF_DEFAULT.hashLength,
        };
      } catch (e) {
        console.warn(
          '[ENC-DEBUG] Step 2a FAILED: Argon2 error, falling back to PBKDF2.',
          e,
        );
        keyBuf = await deriveKeyPBKDF2(
          password,
          salt.toString('hex'),
          BACKUP_PBKDF2_FALLBACK_ITERATIONS,
          32,
        );
        kdfMeta = {
          kdf: 'PBKDF2-SHA256',
          iterations: BACKUP_PBKDF2_FALLBACK_ITERATIONS,
          hashLength: 32,
        };
      }
    } else {
      console.log('[ENC-DEBUG] Step 2b: using PBKDF2 fallback...');
      keyBuf = await deriveKeyPBKDF2(
        password,
        salt.toString('hex'),
        BACKUP_PBKDF2_FALLBACK_ITERATIONS,
        32,
      );
      kdfMeta = {
        kdf: 'PBKDF2-SHA256',
        iterations: BACKUP_PBKDF2_FALLBACK_ITERATIONS,
        hashLength: 32,
      };
    }
    console.log('[ENC-DEBUG] Step 2 DONE: keyBuf.length=', keyBuf!.length, 'kdf=', (kdfMeta as any).kdf);

    console.log('[ENC-DEBUG] Step 3: getting crypto impl');
    const crypto = getCryptoImpl();
    console.log('[ENC-DEBUG] Step 3: crypto=', !!crypto, 'createCipheriv=', typeof crypto?.createCipheriv);
    if (!crypto?.createCipheriv) {
      throw new Error(
        'Crypto AES-GCM encryption is not available on this build.',
      );
    }

    console.log('[ENC-DEBUG] Step 4: createCipheriv');
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);

    const plaintextBuf = Buffer.from(plaintext, 'utf8');
    const updateResult = cipher.update(plaintextBuf);
    const finalResult = cipher.final();
    
    const updateBytes = new Uint8Array(updateResult as ArrayBuffer);
    const finalBytes = new Uint8Array(finalResult as ArrayBuffer);
    const encryptedBytes = new Uint8Array(updateBytes.length + finalBytes.length);
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
      keyBuf = new Uint8Array(derivedKeyBuffer as ArrayBuffer);
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
    const decUpdateResult = new Uint8Array(decipher.update(encData) as ArrayBuffer);
    const decFinalResult = new Uint8Array(decipher.final() as ArrayBuffer);
    
    const decryptedBytes = new Uint8Array(decUpdateResult.length + decFinalResult.length);
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
    AutofillService.setUnlocked(false);
    AutofillService.clearEntries();
  }
  static getDb() {
    return this.db;
  }
}
