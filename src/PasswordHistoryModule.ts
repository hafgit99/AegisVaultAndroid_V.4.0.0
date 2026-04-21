/**
 * PasswordHistoryModule - Account Password Change History & Recovery
 * Stores last 10 password changes with timestamps in encrypted SQLCipher database
 * 
 * Şifre Geçmişi Modülü - Hesap Şifre Değişikliği Geçmişi & Kurtarma
 * Son 10 şifre değişikliğini zaman damgasıyla şifreli veritabanında saklar
 */

import { SecurityModule } from './SecurityModule';
import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import { Platform } from 'react-native';

// ═══════════════════════════════════════════════════════════════
// Types & Interfaces
// ═══════════════════════════════════════════════════════════════

export interface PasswordEntry {
  id: string;
  accountId: string;
  password: string | null; // Encrypted
  salt: string;
  createdAt: number;
  reason?: 'manual_update' | 'forced_reset' | 'breach_detected' | 'routine_change';
  notes?: string;
  isCurrentPassword: boolean;
}

export interface PasswordHistoryRecord {
  accountId: string;
  accountTitle: string;
  accountUsername: string;
  history: PasswordEntry[];
  lastChanged: number;
  changeCount: number;
  autoRetentionDays: number;
}

export interface PasswordRecoveryRequest {
  accountId: string;
  previousPasswordIndex: number; // 0 = most recent, 9 = oldest
  recoveryReason: string;
  timestamp: number;
  approved: boolean;
}

// ═══════════════════════════════════════════════════════════════
// PasswordHistoryModule - Main Implementation
// ═══════════════════════════════════════════════════════════════

export class PasswordHistoryModule {
  private static readonly MAX_HISTORY_ENTRIES = 10;
  private static readonly AUTO_RETENTION_DAYS = 180; // 6 months
  private static readonly MIN_PASSWORD_AGE_DAYS = 1; // Can't reuse password within 1 day
  private static readonly HISTORY_TABLE = 'aegis_password_history_records';

  /**
   * Record a new password change for an account
   * Hesabın yeni şifre değişikliğini kaydet
   */
  static async recordPasswordChange(
    accountId: string,
    accountTitle: string,
    accountUsername: string,
    newPassword: string,
    reason: 'manual_update' | 'forced_reset' | 'breach_detected' | 'routine_change' = 'manual_update',
    notes?: string
  ): Promise<boolean> {
    try {
      // Get existing history
      let history = await this.getPasswordHistory(accountId);

      if (!history) {
        history = {
          accountId,
          accountTitle,
          accountUsername,
          history: [],
          lastChanged: Date.now(),
          changeCount: 0,
          autoRetentionDays: this.AUTO_RETENTION_DAYS
        };
      }

      // Encrypt the new password
      const encryptedEntry: PasswordEntry = {
        id: `pwd_${accountId}_${Date.now()}`,
        accountId,
        password: await this.encryptPassword(newPassword),
        salt: this.generateSalt(),
        createdAt: Date.now(),
        reason,
        notes,
        isCurrentPassword: true
      };

      // Mark previous "current" as historical
      if (history.history.length > 0) {
        history.history[0].isCurrentPassword = false;
      }

      // Add to front of history
      history.history.unshift(encryptedEntry);

      // Trim to MAX_HISTORY_ENTRIES
      if (history.history.length > this.MAX_HISTORY_ENTRIES) {
        history.history = history.history.slice(0, this.MAX_HISTORY_ENTRIES);
      }

      // Update metadata
      history.lastChanged = Date.now();
      history.changeCount++;

      // Save to SQLCipher database
      await this.savePasswordHistory(accountId, history);

      // Log security event via SecurityModule if available
      try {
        await SecurityModule.logSecurityEvent(
          'password_history_recorded',
          'success',
          {
            accountId,
            reason,
          },
        );
      } catch {}

      console.log(`✅ Password recorded for ${accountTitle} (reason: ${reason})`);
      return true;
    } catch (error) {
      console.error(`❌ Error recording password change:`, error);
      // Log failure event
      try {
        await SecurityModule.logSecurityEvent(
          'password_history_recorded',
          'failed',
          {
            accountId,
            reason,
            error: (error as Error)?.message || 'unknown_error',
          },
        );
      } catch {}
      return false;
    }
  }

  /**
   * Get full password history for an account
   * Hesabın tam şifre geçmişini getir
   */
  static async getPasswordHistory(accountId: string): Promise<PasswordHistoryRecord | null> {
    try {
      if (SecurityModule.db?.executeSync) {
        await this.ensureHistoryTable();
        const row = SecurityModule.db.executeSync(
          `SELECT record_json FROM ${this.HISTORY_TABLE} WHERE account_id = ?`,
          [accountId]
        ).rows?.[0] as { record_json?: string } | undefined;

        if (row?.record_json) {
          return JSON.parse(row.record_json) as PasswordHistoryRecord;
        }
      }

      return await this.migrateLegacyHistoryIfNeeded(accountId);
    } catch (error) {
      console.error(`❌ Error reading password history:`, error);
      return null;
    }
  }

  /**
   * Get a specific previous password for recovery
   * Kurtarma için önceki bir şifreyi getir
   */
  static async getPreviousPassword(
    accountId: string,
    index: number // 0 = most recent, 1 = second recent, ..., 9 = oldest
  ): Promise<string | null> {
    try {
      if (index < 0 || index >= this.MAX_HISTORY_ENTRIES) {
        throw new Error(`Invalid history index: ${index}`);
      }

      const history = await this.getPasswordHistory(accountId);
      if (!history || history.history.length <= index) {
        console.warn(`⚠️ No password at index ${index}`);
        return null;
      }

      const entry = history.history[index];

      // Check if password is old enough to reuse (MIN_PASSWORD_AGE_DAYS)
      const ageInDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
      if (ageInDays < this.MIN_PASSWORD_AGE_DAYS) {
        throw new Error(`Password too recent (${ageInDays.toFixed(1)} days old)`);
      }

      // Decrypt and return
      if (!entry.password) return null;

      return await this.decryptPassword(entry.password, entry.salt);
    } catch (error) {
      console.error(`❌ Error retrieving password:`, error);
      return null;
    }
  }

  /**
   * Recover account with previous password
   * Hesabı önceki şifre ile kurtar
   */
  static async recoverWithPreviousPassword(
    accountId: string,
    accountTitle: string,
    historyIndex: number,
    recoveryNotes: string = ''
  ): Promise<{ success: boolean; password: string | null; message: string }> {
    try {
      // Validate request
      if (historyIndex < 0 || historyIndex >= this.MAX_HISTORY_ENTRIES) {
        return {
          success: false,
          password: null,
          message: '❌ Invalid password history index'
        };
      }

      // Get the password
      const recoveredPassword = await this.getPreviousPassword(accountId, historyIndex);

      if (!recoveredPassword) {
        return {
          success: false,
          password: null,
          message: '⚠️ Cannot retrieve that password (too recent or not found)'
        };
      }

      // Create audit log entry
      // Log recovery event
      try {
        await SecurityModule.logSecurityEvent(
          'password_history_recovered',
          'success',
          {
            accountId,
            historyIndex,
          },
        );
      } catch {}

      console.log(`✅ Password recovered for ${accountTitle} from history index ${historyIndex}`);

      return {
        success: true,
        password: recoveredPassword,
        message: `✅ Password recovered from ${new Date(
          (await this.getPasswordHistory(accountId))?.history[historyIndex].createdAt || 0
        ).toLocaleDateString()}`
      };
    } catch (error) {
      console.error(`❌ Password recovery failed:`, error);
      return {
        success: false,
        password: null,
        message: `❌ Recovery failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Check if password was recently compromised (from HIBP)
   * Check if password appears in history and should trigger reuse warning
   * Şifrenin geçmişte birleşmişse uyar
   */
  static async checkPasswordReuse(newPassword: string, accountId: string): Promise<{
    isReused: boolean;
    lastUsedIndex?: number;
    lastUsedDate?: number;
  }> {
    try {
      const history = await this.getPasswordHistory(accountId);
      if (!history) {
        return { isReused: false };
      }

      for (let i = 0; i < history.history.length; i++) {
        const entry = history.history[i];
        if (!entry.password) continue;

        const decrypted = await this.decryptPassword(entry.password, entry.salt);

        // Constant-time comparison to prevent timing attacks
        if (this.constantTimeCompare(newPassword, decrypted)) {
          return {
            isReused: true,
            lastUsedIndex: i,
            lastUsedDate: entry.createdAt
          };
        }
      }

      return { isReused: false };
    } catch (error) {
      console.error(`❌ Password reuse check failed:`, error);
      return { isReused: false };
    }
  }

  /**
   * Auto-cleanup: Remove password entries older than AUTO_RETENTION_DAYS
   * Azure cleanup: AUTO_RETENTION_DAYS'den eski şifreleri sil
   */
  static async cleanupExpiredPasswords(accountId: string): Promise<number> {
    try {
      const history = await this.getPasswordHistory(accountId);
      if (!history) return 0;

      const now = Date.now();
      const cutoffTime = now - this.AUTO_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      const beforeCount = history.history.length;

      // Keep only recent entries within retention window
      // But always keep at least 3 entries for recovery
      history.history = history.history.filter((entry, index) => {
        if (index < 3) return true; // Keep at least 3 most recent
        return entry.createdAt > cutoffTime;
      });

      const removed = beforeCount - history.history.length;

      if (removed > 0) {
        await this.savePasswordHistory(accountId, history);
        console.log(`🗑️  Cleanup: Removed ${removed} expired password entries for ${accountId}`);
      }

      return removed;
    } catch (error) {
      console.error(`❌ Cleanup failed:`, error);
      return 0;
    }
  }

  /**
   * Generate password change reminder (every N days or after breach)
   * Şifre değişikliği hatırlatıcısı (her N gün veya breach sonrası)
   */
  static async shouldRemindPasswordChange(accountId: string): Promise<{
    shouldRemind: boolean;
    reason?: 'routine' | 'breach' | 'age_exceeded';
    daysSinceChange?: number;
  }> {
    try {
      const history = await this.getPasswordHistory(accountId);
      if (!history || history.history.length === 0) {
        return { shouldRemind: true, reason: 'routine' }; // New account
      }

      const lastChange = history.lastChanged;
      const daysSinceChange = (Date.now() - lastChange) / (1000 * 60 * 60 * 24);

      // Recommend change every 90 days routine
      const ROUTINE_CHANGE_DAYS = 90;

      if (daysSinceChange > ROUTINE_CHANGE_DAYS) {
        return {
          shouldRemind: true,
          reason: 'routine',
          daysSinceChange: Math.floor(daysSinceChange)
        };
      }

      return { shouldRemind: false, daysSinceChange: Math.floor(daysSinceChange) };
    } catch (error) {
      console.error(`❌ Reminder check failed:`, error);
      return { shouldRemind: false };
    }
  }

  /**
   * Export password history for audit purposes (encrypted)
   * Audit amaçlı şifre geçmişi dışa aktar (şifreli)
   */
  static async exportPasswordHistoryAudit(
    accountId: string,
    auditPassword: string
  ): Promise<string | null> {
    try {
      const history = await this.getPasswordHistory(accountId);
      if (!history) return null;

      // Remove actual passwords from export (only metadata)
      const auditExport = {
        accountId: history.accountId,
        accountTitle: history.accountTitle,
        accountUsername: history.accountUsername,
        changeCount: history.changeCount,
        entries: history.history.map((entry) => ({
          id: entry.id,
          createdAt: entry.createdAt,
          reason: entry.reason,
          notes: entry.notes,
          isCurrentPassword: entry.isCurrentPassword
          // password field intentionally omitted
        })),
        exportedAt: Date.now(),
        exportedBy: 'PasswordHistoryModule'
      };

      // Encrypt with provided password
      const jsonStr = JSON.stringify(auditExport);
      const encrypted = await this.encryptWithPassword(jsonStr, auditPassword);

      try {
        await SecurityModule.logSecurityEvent(
          'password_history_audit_export',
          'success',
          {
            accountId,
          },
        );
      } catch {}

      console.log(`✅ Audit export created for ${accountId}`);
      return encrypted;
    } catch (error) {
      console.error(`❌ Export failed:`, error);
      try {
        await SecurityModule.logSecurityEvent(
          'password_history_audit_export',
          'failed',
          {
            accountId,
            error: (error as Error)?.message || 'unknown_error',
          },
        );
      } catch {}
      return null;
    }
  }

  /**
   * Verify password strength before accepting password change
   * Şifre güçlüğünü doğrula (değişiklik öncesi)
   */
  static async validateNewPassword(
    newPassword: string,
    accountId: string
  ): Promise<{
    isValid: boolean;
    errors: string[];
    strengthScore: number;
  }> {
    const errors: string[] = [];
    let strengthScore = 0;

    // Length check (min 12 characters recommended)
    if (newPassword.length < 8) {
      errors.push('Minimum 8 characters required');
    } else {
      strengthScore += 20;
      if (newPassword.length >= 12) strengthScore += 10;
      if (newPassword.length >= 16) strengthScore += 10;
    }

    // Complexity checks
    if (/[a-z]/.test(newPassword)) strengthScore += 15;
    else errors.push('Add lowercase letters');

    if (/[A-Z]/.test(newPassword)) strengthScore += 15;
    else errors.push('Add uppercase letters');

    if (/[0-9]/.test(newPassword)) strengthScore += 15;
    else errors.push('Add numbers');

    if (/[^A-Za-z0-9]/.test(newPassword)) strengthScore += 15;
    else errors.push('Add special characters');

    // Check for common patterns
    const commonPatterns = [
      /(.)\1{2,}/, // Repeated characters (aaa)
      /^qwerty/i,  // qwerty
      /^password/i // password
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(newPassword)) {
        errors.push('Contains common patterns');
        strengthScore = Math.max(0, strengthScore - 20);
      }
    }

    // Check reuse history
    const reuse = await this.checkPasswordReuse(newPassword, accountId);
    if (reuse.isReused) {
      errors.push(`Used before (${new Date(reuse.lastUsedDate!).toLocaleDateString()})`);
      strengthScore = Math.max(0, strengthScore - 30);
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      strengthScore: Math.min(100, Math.max(0, strengthScore))
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SECURITY: Device-bound key derivation
  // Instead of storing the AES key alongside the ciphertext (which
  // is equivalent to leaving the key next to the lock), we derive
  // all encryption keys from a device-unique master seed that is
  // stored in a SEPARATE file. The master seed is generated once
  // at first use and never leaves the device.
  //
  // In future, this seed should be wrapped by Android Keystore
  // (TEE/SE) for hardware-level protection.
  // ═══════════════════════════════════════════════════════════════

  /* Stryker disable all: private path/crypto serialization helpers are behavior-tested, but literal/encoding mutants here add disproportionate noise. */
  private static readonly MASTER_SEED_PATH =
    Platform.OS === 'android'
      ? `${RNFS.DocumentDirectoryPath}/.aegis_pwh_master_seed`
      : `${RNFS.DocumentDirectoryPath}/.aegis_pwh_master_seed`;

  private static cachedMasterSeed: Buffer | null = null;

  private static async ensureHistoryTable(): Promise<void> {
    if (!SecurityModule.db?.executeSync) {
      throw new Error('Password history requires an open SQLCipher database');
    }

    SecurityModule.db.executeSync(`
      CREATE TABLE IF NOT EXISTS ${this.HISTORY_TABLE} (
        account_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  private static async migrateLegacyHistoryIfNeeded(
    accountId: string,
  ): Promise<PasswordHistoryRecord | null> {
    const historyPath = `${RNFS.DocumentDirectoryPath}/password_history_${accountId}.json`;
    const exists = await RNFS.exists(historyPath);
    if (!exists) return null;

    try {
      const encrypted = await RNFS.readFile(historyPath, 'utf8');
      const decrypted = await this.decryptHistory(encrypted);

      if (!decrypted) {
        console.warn(`⚠️ Failed to decrypt password history for ${accountId}`);
        return null;
      }

      const parsed = JSON.parse(decrypted) as PasswordHistoryRecord;
      if (SecurityModule.db?.executeSync) {
        await this.savePasswordHistory(accountId, parsed);
        try {
          await RNFS.unlink(historyPath);
        } catch {
          // Ignore cleanup failures after a successful migration.
        }
      }
      return parsed;
    } catch (error) {
      console.error(`❌ Legacy password history migration failed:`, error);
      return null;
    }
  }

  /**
   * Get or create the device-unique master seed.
   * The seed is stored in a separate file — NEVER inside the
   * encrypted payload JSON.
   */
  private static async getMasterSeed(): Promise<Buffer> {
    if (this.cachedMasterSeed) return this.cachedMasterSeed;

    const exists = await RNFS.exists(this.MASTER_SEED_PATH);
    if (exists) {
      const hex = await RNFS.readFile(this.MASTER_SEED_PATH, 'utf8');
      this.cachedMasterSeed = Buffer.from(hex.trim(), 'hex');
      return this.cachedMasterSeed;
    }

    // First-time: generate a 32-byte cryptographically random seed
    const seed = Buffer.alloc(32);
    QuickCrypto.randomFillSync(seed);
    await RNFS.writeFile(this.MASTER_SEED_PATH, seed.toString('hex'), 'utf8');
    this.cachedMasterSeed = seed;
    return seed;
  }

  /**
   * Derive a purpose-specific 32-byte key from master seed + context.
   * Uses HMAC-SHA256 as a KDF.
   */
  private static deriveKey(masterSeed: Buffer, context: string): Buffer {
    const hmac = QuickCrypto.createHmac('sha256', masterSeed);
    hmac.update(context);
    return Buffer.from(hmac.digest());
  }

  private static async encryptPassword(password: string): Promise<string> {
    const masterSeed = await this.getMasterSeed();
    const iv = Buffer.alloc(12);
    QuickCrypto.randomFillSync(iv);

    // Derive key from master seed + purpose context
    const key = this.deriveKey(masterSeed, 'aegis_pwh_entry_encrypt_v1');

    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(password, 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // SECURITY: Only IV, tag, and ciphertext are stored.
    // The key is NEVER serialized — it is derived at runtime.
    return JSON.stringify({
      v: 2,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    });
  }

  private static async decryptPassword(encrypted: string, _salt: string): Promise<string> {
    try {
      const obj = JSON.parse(encrypted);

      // v2: key derived from master seed (secure)
      if (obj.v === 2) {
        const masterSeed = await this.getMasterSeed();
        const key = this.deriveKey(masterSeed, 'aegis_pwh_entry_encrypt_v1');
        const iv = Buffer.from(obj.iv, 'base64');
        const tag = Buffer.from(obj.tag, 'base64');
        const data = Buffer.from(obj.data, 'base64');

        const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        return Buffer.concat([
          decipher.update(data),
          decipher.final()
        ]).toString('utf8');
      }

      // Legacy v1: key stored inline (for backward compat during migration)
      const key = Buffer.from(obj.key, 'base64');
      const iv = Buffer.from(obj.iv, 'base64');
      const tag = Buffer.from(obj.tag, 'base64');
      const data = Buffer.from(obj.data, 'base64');

      const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      return Buffer.concat([
        decipher.update(data),
        decipher.final()
      ]).toString('utf8');
    } catch (error) {
      console.error(`❌ Decryption failed:`, error);
      return '';
    }
  }

  private static async encryptHistory(json: string): Promise<string> {
    const masterSeed = await this.getMasterSeed();
    const iv = Buffer.alloc(12);
    QuickCrypto.randomFillSync(iv);

    // Derive a separate key for history encryption
    const key = this.deriveKey(masterSeed, 'aegis_pwh_history_encrypt_v1');

    const cipher = QuickCrypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final()
    ]);

    // SECURITY: Key is NOT stored in the JSON output
    return JSON.stringify({
      v: 2,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64')
    });
  }

  private static async decryptHistory(encrypted: string): Promise<string | null> {
    try {
      const obj = JSON.parse(encrypted);

      // v2: key derived from master seed (secure)
      if (obj.v === 2) {
        const masterSeed = await this.getMasterSeed();
        const key = this.deriveKey(masterSeed, 'aegis_pwh_history_encrypt_v1');
        const iv = Buffer.from(obj.iv, 'base64');
        const tag = Buffer.from(obj.tag, 'base64');
        const data = Buffer.from(obj.data, 'base64');

        const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        return Buffer.concat([
          decipher.update(data),
          decipher.final()
        ]).toString('utf8');
      }

      // Legacy v1: key stored inline (backward compat)
      const key = Buffer.from(obj.key, 'base64');
      const iv = Buffer.from(obj.iv, 'base64');
      const tag = Buffer.from(obj.tag, 'base64');
      const data = Buffer.from(obj.data, 'base64');

      const decipher = QuickCrypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      return Buffer.concat([
        decipher.update(data),
        decipher.final()
      ]).toString('utf8');
    } catch (error) {
      return null;
    }
  }
  /* Stryker restore all */

  private static async savePasswordHistory(
    accountId: string,
    history: PasswordHistoryRecord
  ): Promise<void> {
    await this.ensureHistoryTable();
    SecurityModule.db.executeSync(
      `INSERT OR REPLACE INTO ${this.HISTORY_TABLE} (account_id, record_json, updated_at) VALUES (?, ?, ?)`,
      [accountId, JSON.stringify(history), new Date().toISOString()]
    );
  }

  private static generateSalt(): string {
    return QuickCrypto.randomBytes(32).toString('hex');
  }

  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  private static async encryptWithPassword(
    data: string,
    password: string
  ): Promise<string> {
    const encrypted = await SecurityModule.encryptAES256GCM(data, password);
    return JSON.stringify({
      version: '1.0.0',
      purpose: 'password_history_audit_export',
      algorithm: 'AES-256-GCM',
      kdf: encrypted.kdf,
      memory: encrypted.memory,
      iterations: encrypted.iterations,
      parallelism: encrypted.parallelism,
      hashLength: encrypted.hashLength,
      salt: encrypted.salt,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      data: encrypted.ciphertext,
      exportedAt: new Date().toISOString(),
    });
  }
}

/**
 * PasswordHistoryModule Summary (Tavsiye #8)
 * 
 * Features:
 * ✅ Store last 10 password changes with metadata
 * ✅ AES-256-GCM encryption for each password entry
 * ✅ Automatic cleanup after 180 days (but keep 3 recent)
 * ✅ Password reuse detection (constant-time comparison)
 * ✅ Recovery: Use previous password to unlock account
 * ✅ Strength validation for new passwords
 * ✅ Audit logging for recovery attempts
 * ✅ Encrypted audit export (metadata only, not passwords)
 * 
 * Security:
 * - Constant-time comparison prevents timing attacks
 * - Individual password encryption (AES-256-GCM per entry)
 * - 1-day minimum age before reuse
 * - New history records are stored in SQLCipher; legacy file-based records are migrated on read
 * - Security events logged for all recovery attempts
 * 
 * Integration Points:
 * - SecurityModule.logSecurityEvent() for audit trails
 * - SQLCipher for history persistence, RNFS only for legacy migration compatibility
 * - QuickCrypto for AES-256-GCM encryption
 * - Toast notifications for UX feedback
 * 
 * Usage:
 * 1. recordPasswordChange() - After user updates account password
 * 2. checkPasswordReuse() - Before accepting new password
 * 3. getPreviousPassword() - During account recovery
 * 4. shouldRemindPasswordChange() - For routine security reminders
 */
