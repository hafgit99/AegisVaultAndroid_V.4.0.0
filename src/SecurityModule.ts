import { open } from '@op-engineering/op-sqlite';
import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import RNFS from 'react-native-fs';
import ReactNativeBiometrics from 'react-native-biometrics';
import { AutofillService } from './AutofillService';
import Argon2 from 'react-native-argon2';
import i18n from './i18n';

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
export interface LoginData { totp_secret?: string; }
export interface CardData {
  cardholder: string; card_number: string; expiry: string;
  cvv: string; pin: string; brand: string;
}
export interface IdentityData {
  first_name: string; last_name: string; national_id: string;
  birthday: string; phone: string; email: string; address: string;
  gender: string; company: string;
}
export interface NoteData { content: string; }
export interface WifiData {
  ssid: string; wifi_password: string; security: string;
  hidden: boolean;
}

export interface VaultSettings {
  autoLockSeconds: number;
  biometricEnabled: boolean;
  clipboardClearSeconds: number;
  passwordLength: number;
}

const DEFAULT_SETTINGS: VaultSettings = {
  autoLockSeconds: 60, biometricEnabled: true,
  clipboardClearSeconds: 30, passwordLength: 20,
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

// ═══════════════════════════════════════════════════
export class SecurityModule {
  private static db: any = null;
  private static autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  public static isPickingFileFlag: boolean = false;
  private static deviceSalt: Buffer | null = null;
  private static bfState: BruteForceState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };

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
    const salt = Buffer.from(QuickCrypto.randomBytes(32));
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
    } catch { this.bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 }; }
  }

  private static async saveBruteForceState(): Promise<void> {
    try {
      await RNFS.writeFile(BRUTE_FORCE_FILE, JSON.stringify(this.bfState), 'utf8');
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
    console.log(`[Security] Failed attempt #${this.bfState.failCount}, lockout: ${lockDuration / 1000}s`);
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
   * PBKDF2-SHA256(publicKey, deviceSalt, 310000 iterations, 32 bytes)
   *         ↓
   * 256-bit vault encryption key (always the same)
   * 
   * Security properties:
   * - Public key is hardware-bound (tied to Android Keystore)
   * - Device salt is unique per installation (32 bytes CSPRNG)
   * - PBKDF2 with 310k iterations provides key stretching
   * - Biometric verification required before key derivation
   * - Key material zeroed after use
   */
  static async deriveKeyFromBiometric(): Promise<string | null> {
    try {
      const rnBiometrics = new ReactNativeBiometrics();

      // Step 1: Verify biometric identity (fingerprint/face)
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: i18n.t('lock_screen.biometric_prompt') as string,
        fallbackPromptMessage: i18n.t('lock_screen.biometric_fallback') as string,
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
        console.log('[Security] First-time setup: creating Android Keystore keys...');
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
      const argon2Result = await Argon2(publicKey!, salt.toString('hex'), {
        mode: 'argon2id', memory: 32768, iterations: 4, parallelism: 2, hashLength: 32, saltEncoding: 'hex'
      });
      
      const keyHex = argon2Result.rawHash;
      const derivedKey = Buffer.from(keyHex, 'hex');

      // Zero out key material
      for (let i = 0; i < derivedKey.length; i++) (derivedKey as any)[i] = 0;

      console.log('[Security] Biometric key derived successfully using Argon2id');
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
      console.log('[Security] Biometric keys reset');
    } catch (e) {
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
    try { await RNFS.writeFile(path, material, 'utf8'); } catch {}
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
        return false;
      }

      const salt = await this.getDeviceSalt();
      const t0 = performance.now();

      // GPU-resistant Argon2id KDF derivation
      const argon2Result = await Argon2(password, salt.toString('hex'), {
        mode: 'argon2id', memory: 32768, iterations: 4, parallelism: 2, hashLength: 32, saltEncoding: 'hex'
      });
      const keyBuf = Buffer.from(argon2Result.rawHash, 'hex');

      console.log(`[Security] Argon2id ${(performance.now() - t0).toFixed(0)}ms`);

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
      this.db.executeSync(`CREATE TABLE IF NOT EXISTS vault_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);

      // Migration: add missing columns if updating
      try { this.db.executeSync("ALTER TABLE vault_items ADD COLUMN data TEXT DEFAULT '{}'"); } catch {}
      try { this.db.executeSync("ALTER TABLE vault_items ADD COLUMN is_deleted INTEGER DEFAULT 0"); } catch {}
      try { this.db.executeSync("ALTER TABLE vault_items ADD COLUMN deleted_at DATETIME DEFAULT NULL"); } catch {}

      // Zero out key material
      for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;

      // Record successful attempt (reset brute force counter)
      await this.recordSuccessfulAttempt();

      AutofillService.setUnlocked(true);
      await this.syncAutofill();

      console.log('[Security] Vault unlocked. Dynamic salt + Argon2id.');
      return true;
    } catch (e) {
      // Record failed attempt
      await this.recordFailedAttempt();
      console.error('Unlock failed:', e);
      return false;
    }
  }

  // ── Autofill Sync ─────────────────────────────────
  private static async syncAutofill() {
    if (!this.db) return;
    try {
      // Send all login items to native autofill service
      const items = (this.db.executeSync("SELECT id, title, username, password, url, category FROM vault_items WHERE category='login' COLLATE NOCASE").rows || []) as any[];
      AutofillService.updateEntries(items);
    } catch (e) {
      console.error('[Security] Autofill sync error:', e);
    }
  }

  // ── Items CRUD ────────────────────────────────────
  static async getItems(search?: string, category?: string): Promise<VaultItem[]> {
    if (!this.db) return [];
    try {
      let q = 'SELECT * FROM vault_items WHERE is_deleted = 0';
      const conds: string[] = [], p: any[] = [];
      if (search?.trim()) { const s = `%${search.trim()}%`; conds.push("(title LIKE ? OR username LIKE ? OR url LIKE ?)"); p.push(s, s, s); }
      if (category && category !== 'all') { conds.push("category = ?"); p.push(category); }
      if (conds.length) q += ' AND ' + conds.join(' AND ');
      q += ' ORDER BY favorite DESC, updated_at DESC';
      return (this.db.executeSync(q, p).rows || []) as VaultItem[];
    } catch (e) { console.error('getItems:', e); return []; }
  }

  static async getDeletedItems(): Promise<VaultItem[]> {
    if (!this.db) return [];
    try {
      return (this.db.executeSync('SELECT * FROM vault_items WHERE is_deleted = 1 ORDER BY deleted_at DESC').rows || []) as VaultItem[];
    } catch (e) { console.error('getDeletedItems:', e); return []; }
  }

  static async addItem(item: Partial<VaultItem>): Promise<number | null> {
    if (!this.db) return null;
    try {
      const r = this.db.executeSync(
        `INSERT INTO vault_items (title,username,password,url,notes,category,favorite,data) VALUES (?,?,?,?,?,?,?,?)`,
        [item.title||'', item.username||'', item.password||'', item.url||'', item.notes||'', item.category||'login', item.favorite||0, item.data||'{}']
      );
      const newId = r.insertId || r.rowsAffected ? (this.db.executeSync('SELECT last_insert_rowid() as id').rows?.[0]?.id) : null;
      if (newId) await this.syncAutofill();
      return newId;
    } catch (e) { console.error('addItem:', e); return null; }
  }

  static async updateItem(id: number, item: Partial<VaultItem>): Promise<boolean> {
    if (!this.db) return false;
    try {
      const fields: string[] = [], params: any[] = [];
      for (const [k, v] of Object.entries(item)) {
        if (!['id','created_at'].includes(k)) { fields.push(`${k}=?`); params.push(v); }
      }
      fields.push("updated_at=CURRENT_TIMESTAMP"); params.push(id);
      this.db.executeSync(`UPDATE vault_items SET ${fields.join(',')} WHERE id=?`, params);
      await this.syncAutofill();
      return true;
    } catch (e) { console.error('updateItem:', e); return false; }
  }

  static async deleteItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      // Soft delete
      this.db.executeSync('UPDATE vault_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      await this.syncAutofill();
      return true;
    } catch (e) { console.error('deleteItem:', e); return false; }
  }

  static async restoreItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('UPDATE vault_items SET is_deleted = 0, deleted_at = NULL WHERE id = ?', [id]);
      await this.syncAutofill();
      return true;
    } catch (e) { console.error('restoreItem:', e); return false; }
  }

  static async permanentlyDeleteItem(id: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments WHERE item_id = ?', [id]);
      this.db.executeSync('DELETE FROM vault_items WHERE id = ?', [id]);
      return true;
    } catch (e) { console.error('permanentlyDeleteItem:', e); return false; }
  }

  static async emptyTrash(): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync('DELETE FROM vault_attachments WHERE item_id IN (SELECT id FROM vault_items WHERE is_deleted = 1)');
      this.db.executeSync('DELETE FROM vault_items WHERE is_deleted = 1');
      return true;
    } catch (e) { console.error('emptyTrash:', e); return false; }
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
      this.db.executeSync('DELETE FROM vault_items');
      await this.syncAutofill();
      return true;
    } catch (e) { console.error('resetVault:', e); return false; }
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

      console.log('[Security] Factory reset complete');
      return true;
    } catch (e) {
      console.error('[Security] Factory reset failed:', e);
      return false;
    }
  }

  static async toggleFavorite(id: number, cur: number): Promise<boolean> {
    return this.updateItem(id, { favorite: cur === 1 ? 0 : 1 });
  }

  static async getItemCount(): Promise<number> {
    if (!this.db) return 0;
    try { return this.db.executeSync('SELECT COUNT(*) as c FROM vault_items').rows?.[0]?.c || 0; }
    catch { return 0; }
  }

  // ── Attachments ───────────────────────────────────

  /**
   * Add attachment from a file URI (supports content:// URIs on Android).
   * Copies to cache first to handle Android content provider URIs.
   */
  static async addAttachment(itemId: number, filename: string, mimeType: string, filePath: string): Promise<boolean> {
    if (!this.db) return false;
    try {
      let base64: string;
      let fileSize: number;

      const isContentUri = filePath.startsWith('content://');
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const tempPath = `${RNFS.CachesDirectoryPath}/aegis_temp_${Date.now()}_${safeFilename}`;

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
        [itemId, filename, mimeType, fileSize, base64]
      );
      console.log(`[Attachment] Added "${filename}" (${(fileSize / 1024).toFixed(1)} KB) to item ${itemId}`);
      return true;
    } catch (e) { console.error('addAttachment:', e); return false; }
  }

  static async addAttachmentFromBase64(itemId: number, filename: string, mimeType: string, base64Data: string, size: number): Promise<boolean> {
    if (!this.db) return false;
    try {
      this.db.executeSync(
        'INSERT INTO vault_attachments (item_id,filename,mime_type,size,file_data) VALUES (?,?,?,?,?)',
        [itemId, filename, mimeType, size, base64Data]
      );
      return true;
    } catch (e) { console.error('addAttachmentFromBase64:', e); return false; }
  }

  static async readFileToBase64(filePath: string, filename: string): Promise<{ base64: string; size: number } | null> {
    try {
      const isContentUri = filePath.startsWith('content://');
      if (isContentUri) {
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const tempPath = `${RNFS.CachesDirectoryPath}/aegis_read_${Date.now()}_${safeFilename}`;
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
        'SELECT id,item_id,filename,mime_type,size,created_at FROM vault_attachments WHERE item_id=?', [itemId]
      );
      return (r.rows || []) as Attachment[];
    } catch { return []; }
  }

  static async downloadAttachment(attachmentId: number): Promise<string | null> {
    if (!this.db) return null;
    try {
      const r = this.db.executeSync('SELECT filename,file_data FROM vault_attachments WHERE id=?', [attachmentId]);
      const row = r.rows?.[0];
      if (!row || !row.file_data) return null;

      const dirs = [
        RNFS.DownloadDirectoryPath,
        RNFS.ExternalDirectoryPath,
        RNFS.DocumentDirectoryPath,
        RNFS.CachesDirectoryPath,
      ].filter(Boolean);

      const safeFilename = (row.filename || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
      let savedPath: string | null = null;

      for (const dir of dirs) {
        try {
          const dirExists = await RNFS.exists(dir);
          if (!dirExists) continue;
          const path = `${dir}/${safeFilename}`;
          let finalPath = path;
          const exists = await RNFS.exists(path);
          if (exists) {
            const ext = safeFilename.includes('.') ? '.' + safeFilename.split('.').pop() : '';
            const baseName = safeFilename.includes('.') ? safeFilename.substring(0, safeFilename.lastIndexOf('.')) : safeFilename;
            finalPath = `${dir}/${baseName}_${Date.now()}${ext}`;
          }
          await RNFS.writeFile(finalPath, row.file_data, 'base64');
          savedPath = finalPath;
          break;
        } catch (dirErr) {
          continue;
        }
      }
      return savedPath;
    } catch (e) { console.error('downloadAttachment:', e); return null; }
  }

  static async deleteAttachment(id: number): Promise<boolean> {
    if (!this.db) return false;
    try { this.db.executeSync('DELETE FROM vault_attachments WHERE id=?', [id]); return true; }
    catch { return false; }
  }

  // ── Settings ──────────────────────────────────────
  static async getSetting(key: string): Promise<string | null> {
    if (!this.db) return null;
    try { return this.db.executeSync('SELECT value FROM vault_settings WHERE key=?', [key]).rows?.[0]?.value || null; }
    catch { return null; }
  }
  static async setSetting(key: string, value: string) {
    if (!this.db) return;
    try { this.db.executeSync('INSERT OR REPLACE INTO vault_settings (key,value) VALUES (?,?)', [key, value]); } catch {}
  }
  static async getAllSettings(): Promise<VaultSettings> {
    const s = { ...DEFAULT_SETTINGS };
    try {
      const al = await this.getSetting('autoLockSeconds'); if (al) s.autoLockSeconds = parseInt(al);
      const bio = await this.getSetting('biometricEnabled'); if (bio) s.biometricEnabled = bio === 'true';
      const cl = await this.getSetting('clipboardClearSeconds'); if (cl) s.clipboardClearSeconds = parseInt(cl);
      const pl = await this.getSetting('passwordLength'); if (pl) s.passwordLength = parseInt(pl);
    } catch {}
    return s;
  }

  // ── Password Generator (CSPRNG-based) ─────────────
  static generatePassword(len: number = 20, opts?: { uppercase?: boolean; lowercase?: boolean; numbers?: boolean; symbols?: boolean }): string {
    const o = { uppercase: true, lowercase: true, numbers: true, symbols: true, ...opts };
    let c = '';
    if (o.lowercase) c += 'abcdefghijkmnopqrstuvwxyz';
    if (o.uppercase) c += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (o.numbers) c += '23456789';
    if (o.symbols) c += '!@#$%^&*_+-=?';
    if (!c) c = 'abcdefghijkmnopqrstuvwxyz';

    // Use CSPRNG instead of Math.random()
    const randomBytes = QuickCrypto.randomBytes(len * 2);
    let pw = '';
    for (let i = 0; i < len; i++) {
      // Use 2 bytes per char to reduce modulo bias
      const val = (randomBytes[i * 2] << 8 | randomBytes[i * 2 + 1]) % c.length;
      pw += c.charAt(val);
    }
    return pw;
  }

  static getPasswordStrength(pw: string): { score: number; label: string; color: string } {
    if (!pw) return { score: 0, label: 'Yok', color: '#94a3b8' };
    let sc = 0;
    if (pw.length >= 8) sc++; if (pw.length >= 12) sc++; if (pw.length >= 16) sc++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) sc++;
    if (/\d/.test(pw)) sc++; if (/[^A-Za-z0-9]/.test(pw)) sc++; if (pw.length >= 20) sc++;
    if (sc <= 2) return { score: sc, label: 'Zayıf', color: '#ef4444' };
    if (sc <= 4) return { score: sc, label: 'Orta', color: '#f59e0b' };
    if (sc <= 5) return { score: sc, label: 'Güçlü', color: '#22c55e' };
    return { score: sc, label: 'Çok Güçlü', color: '#06b6d4' };
  }

  // ══════════════════════════════════════════════════
  // 5. AES-256-GCM ENCRYPTION (for backup export)
  // ══════════════════════════════════════════════════

  /**
   * Encrypt data using AES-256-GCM with PBKDF2 key derivation.
   * Returns: { salt, iv, authTag, ciphertext } all base64 encoded.
   */
  static async encryptAES256GCM(plaintext: string, password: string): Promise<{
    salt: string; iv: string; authTag: string; ciphertext: string;
  }> {
    // Generate 32-byte random salt and 12-byte IV
    const salt = Buffer.from(QuickCrypto.randomBytes(32));
    const iv = Buffer.from(QuickCrypto.randomBytes(12));

    // Derive 256-bit key using PBKDF2-SHA256
    const keyBuf = await new Promise<Buffer>((resolve, reject) => {
      QuickCrypto.pbkdf2(password, salt.toString('hex'), 310000, 32, 'sha256',
        (e: any, k: any) => e ? reject(e) : resolve(k));
    });

    // AES-256-GCM encryption
    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Zero out key
    for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;

    return {
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: Buffer.from(authTag).toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };
  }

  /**
   * Decrypt AES-256-GCM encrypted data.
   */
  static async decryptAES256GCM(
    ciphertext: string, password: string,
    saltB64: string, ivB64: string, authTagB64: string,
  ): Promise<string> {
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encData = Buffer.from(ciphertext, 'base64');

    // Derive key
    const keyBuf = await new Promise<Buffer>((resolve, reject) => {
      QuickCrypto.pbkdf2(password, salt.toString('hex'), 310000, 32, 'sha256',
        (e: any, k: any) => e ? reject(e) : resolve(k));
    });

    // AES-256-GCM decryption
    const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encData),
      decipher.final(),
    ]);

    // Zero out key
    for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;

    return decrypted.toString('utf8');
  }

  // ── Lock ──────────────────────────────────────────
  static startAutoLockTimer(sec: number, cb: () => void) {
    this.clearAutoLockTimer();
    if (sec > 0) this.autoLockTimer = setTimeout(() => { this.lockVault(); cb(); }, sec * 1000);
  }
  static clearAutoLockTimer() { if (this.autoLockTimer) { clearTimeout(this.autoLockTimer); this.autoLockTimer = null; } }
  static resetAutoLockTimer(sec: number, cb: () => void) { this.startAutoLockTimer(sec, cb); }
  static lockVault() {
    this.clearAutoLockTimer();
    try { if (this.db) this.db.close(); } catch {}
    this.db = null;
    AutofillService.setUnlocked(false);
    AutofillService.clearEntries();
  }
  static getDb() { return this.db; }
}
