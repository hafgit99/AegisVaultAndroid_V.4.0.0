/**
 * RecoveryModule - Biometric Reset and Vault Recovery
 * 
 * İçe Aktarım Modülü - Biyometrik Sıfırlama ve Vault Kurtarma
 * Handles scenarios where biometric keys are lost or corrupted
 * Biyometrik anahtarların kaybolduğu veya bozulduğu senaryoları işler
 */

import RNFS from 'react-native-fs';
import QuickCrypto from 'react-native-quick-crypto';
import { SecurityModule, VaultItem } from './SecurityModule';
import { BackupModule } from './BackupModule';
import i18n from './i18n';

// ═══════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface RecoverySession {
  sessionId: string;
  createdAt: string;        // ISO8601
  expiresAt: string;        // ISO8601 (15 minutes from creation)
  verificationCode: string; // 6-digit code (not exposed to client after creation)
  recoveryToken?: string;   // One-time token (generated after code verify)
  vaultBackupPath?: string; // Path to encrypted vault backup
  status: 'initiated' | 'code_verified' | 'completed' | 'expired';
  userEmail: string;
}

export interface RecoveryFlowState {
  sessionId: string;
  step: 1 | 2 | 3;          // Step in recovery process
  emailEntered: boolean;
  codeVerified: boolean;
  backupRestored: boolean;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const RECOVERY_SESSION_DIR = `${RNFS.DocumentDirectoryPath}/recovery_sessions`;
const RECOVERY_BACKUP_DIR = `${RNFS.DocumentDirectoryPath}/recovery_backups`;
const CODE_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes
const TOKEN_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes
const VERIFICATION_CODE_LENGTH = 6;
const QC: any = (QuickCrypto as any)?.default ?? (QuickCrypto as any);

const secureRandomBytes = (size: number): Uint8Array => {
  if (typeof QC?.randomBytes !== 'function') {
    throw new Error('Secure random generator is unavailable on this build');
  }
  return new Uint8Array(QC.randomBytes(size));
};

const secureCreateHash = (algorithm: string) => {
  if (typeof QC?.createHash !== 'function') {
    throw new Error('Secure hash function is unavailable on this build');
  }
  return QC.createHash(algorithm);
};

const debugLog = (...args: any[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};

// ═══════════════════════════════════════════════════════════════
// RECOVERY MODULE
// ═══════════════════════════════════════════════════════════════

export class RecoveryModule {
  /**
   * Step 1: Initiate recovery when user cannot unlock vault
   * Kullanıcı vault'u açamadığında kurtarma başlatın
   */
  static async initiateRecovery(userEmail: string): Promise<RecoverySession | null> {
    try {
      // Validate email format
      if (!this.isValidEmail(userEmail)) {
        console.error('[Recovery] Invalid email format:', userEmail);
        await this.logRecoveryEvent('initiate_failed', {
          reason: 'invalid_email'
        });
        return null;
      }

      // Create recovery directories if not exist
      await RNFS.mkdir(RECOVERY_SESSION_DIR).catch(() => {});
      await RNFS.mkdir(RECOVERY_BACKUP_DIR).catch(() => {});

      // Generate recovery session
      const sessionId = this.generateSecureRandomString(32);
      const verificationCode = this.generateVerificationCode(VERIFICATION_CODE_LENGTH);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CODE_EXPIRATION_MS);

      const session: RecoverySession = {
        sessionId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        verificationCode, // Will be cleared after sending
        status: 'initiated',
        userEmail,
      };

      // Save session to secure storage
      const sessionPath = `${RECOVERY_SESSION_DIR}/${sessionId}.json`;
      await RNFS.writeFile(
        sessionPath,
        JSON.stringify(session),
        'utf8'
      );

      // Never log recovery codes or tokens in app logs.
      debugLog('[Recovery] Verification code generated for recovery session');
      
      // Log recovery event
      await this.logRecoveryEvent('recovery_initiated', {
        email: userEmail,
        sessionId,
      });

      // Return session WITHOUT exposing verification code
      return { ...session, verificationCode: '' };
    } catch (e) {
      console.error('[Recovery] initiateRecovery error:', e);
      await this.logRecoveryEvent('recover_init_error', {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Step 2: Verify the 6-digit code sent to user's email
   * Kullanıcının e-postasına gönderilen 6 haneli kodu doğrulayın
   */
  static async verifyRecoveryCode(
    sessionId: string,
    codeEntered: string
  ): Promise<string | null> {
    try {
      // Load session
      const session = await this.getRecoverySession(sessionId);
      if (!session) {
        await this.logRecoveryEvent('verify_code_failed', {
          reason: 'session_not_found'
        });
        return null;
      }

      // Check expiration
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      if (now > expiresAt) {
        session.status = 'expired';
        await this.saveRecoverySession(session);
        await this.logRecoveryEvent('verify_code_failed', {
          reason: 'code_expired'
        });
        return null;
      }

      // Verify code using constant-time comparison (prevents timing attacks)
      if (!this.constantTimeCompare(codeEntered, session.verificationCode)) {
        await this.logRecoveryEvent('verify_code_failed', {
          reason: 'wrong_code'
        });
        return null;
      }

      // Code verified! Generate recovery token
      const recoveryToken = this.generateSecureRandomString(32);
      session.recoveryToken = recoveryToken;
      session.status = 'code_verified';
      session.expiresAt = new Date(now.getTime() + TOKEN_EXPIRATION_MS).toISOString();

      // Clear verification code from memory
      session.verificationCode = '';

      // Save updated session
      await this.saveRecoverySession(session);

      await this.logRecoveryEvent('code_verified', { sessionId });

      return recoveryToken;
    } catch (e) {
      console.error('[Recovery] verifyRecoveryCode error:', e);
      return null;
    }
  }

  /**
   * Step 3: Restore vault from encrypted backup using recovery token and backup password
   * Şifreli yedekten vault'u geri yükleyin
   */
  static async restoreFromRecovery(
    sessionId: string,
    recoveryToken: string,
    backupPassword: string
  ): Promise<boolean> {
    try {
      // Load and validate session
      const session = await this.getRecoverySession(sessionId);
      if (!session || session.recoveryToken !== recoveryToken) {
        await this.logRecoveryEvent('restore_failed', {
          reason: 'invalid_token'
        });
        return false;
      }

      // Check token expiration
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      if (now > expiresAt) {
        session.status = 'expired';
        await this.saveRecoverySession(session);
        await this.logRecoveryEvent('restore_failed', {
          reason: 'token_expired'
        });
        return false;
      }

      // Get encrypted backup
      if (!session.vaultBackupPath) {
        await this.logRecoveryEvent('restore_failed', {
          reason: 'no_backup_found'
        });
        return false;
      }

      const backupExists = await RNFS.exists(session.vaultBackupPath);
      if (!backupExists) {
        await this.logRecoveryEvent('restore_failed', {
          reason: 'backup_file_missing'
        });
        return false;
      }

      // Import the encrypted backup from its secure on-disk path.
      const importResult = await BackupModule.importEncryptedAegis(
        session.vaultBackupPath,
        backupPassword
      );

      if (importResult.imported === 0) {
        await this.logRecoveryEvent('restore_failed', {
          reason: 'backup_decrypt_failed'
        });
        return false;
      }

      // Step A: Clear old biometric keys (will be recreated on next unlock)
      await SecurityModule.resetBiometricKeys();

      // Step B: Vault items should be automatically restored during import
      // (BackupModule handles inserting items into vault)

      // Step C: Mark recovery as completed
      session.status = 'completed';
      await this.saveRecoverySession(session);

      // Clean up backup file
      await RNFS.unlink(session.vaultBackupPath).catch(() => {});

      await this.logRecoveryEvent('restore_completed', {
        sessionId,
        itemsRestored: importResult.imported
      });

      return true;
    } catch (e) {
      console.error('[Recovery] restoreFromRecovery error:', e);
      await this.logRecoveryEvent('restore_error', {
        error: e instanceof Error ? e.message : String(e)
      });
      return false;
    }
  }

  /**
   * Create a recovery backup before first biometric setup
   * İlk biyometrik kurulumundan önce kurtarma yedeği oluşturun
   * 
   * This is called during initial setup so user has offline recovery option
   */
  static async createRecoveryBackup(
    vaultItems: VaultItem[],
    userEmail: string,
    backupPassword: string
  ): Promise<boolean> {
    try {
      // Ensure backup password is strong
      if (!backupPassword || backupPassword.length < 8) {
        console.error('[Recovery] Backup password too weak');
        return false;
      }

      // Create backup directories
      await RNFS.mkdir(RECOVERY_BACKUP_DIR).catch(() => {});

      // Export encrypted backup
      const exportedPath = await BackupModule.exportEncrypted(backupPassword);

      // Save to recovery backup directory
      const backupId = this.generateSecureRandomString(16);
      const backupPath = `${RECOVERY_BACKUP_DIR}/${backupId}.aegis`;
      
      await RNFS.copyFile(exportedPath, backupPath);
      await RNFS.unlink(exportedPath).catch(() => {});

      // Calculate file hash for integrity verification
      const fileHash = await this.secureHashFile(backupPath);
      await RNFS.writeFile(
        `${backupPath}.hash`,
        fileHash,
        'utf8'
      );

      // Store backup metadata
      const metadata = {
        backupId,
        userEmail,
        createdAt: new Date().toISOString(),
        itemCount: vaultItems.length,
        backupPath,
        hashPath: `${backupPath}.hash`,
      };

      await RNFS.writeFile(
        `${RECOVERY_BACKUP_DIR}/metadata_${backupId}.json`,
        JSON.stringify(metadata),
        'utf8'
      );

      await this.logRecoveryEvent('backup_created', {
        backupId,
        itemCount: vaultItems.length
      });

      return true;
    } catch (e) {
      console.error('[Recovery] createRecoveryBackup error:', e);
      await this.logRecoveryEvent('backup_creation_failed', {
        error: e instanceof Error ? e.message : String(e)
      });
      return false;
    }
  }

  /**
   * Verify recovery backup integrity using hash
   */
  static async verifyBackupIntegrity(backupPath: string): Promise<boolean> {
    try {
      const hashPath = `${backupPath}.hash`;
      const hashExists = await RNFS.exists(hashPath);
      
      if (!hashExists) return false;

      const storedHash = await RNFS.readFile(hashPath, 'utf8');
      const currentHash = await this.secureHashFile(backupPath);

      return storedHash === currentHash;
    } catch (e) {
      console.error('[Recovery] verifyBackupIntegrity error:', e);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get recovery session by ID
   */
  private static async getRecoverySession(sessionId: string): Promise<RecoverySession | null> {
    try {
      const sessionPath = `${RECOVERY_SESSION_DIR}/${sessionId}.json`;
      const exists = await RNFS.exists(sessionPath);
      
      if (!exists) return null;

      const json = await RNFS.readFile(sessionPath, 'utf8');
      return JSON.parse(json);
    } catch (e) {
      console.error('[Recovery] getRecoverySession error:', e);
      return null;
    }
  }

  /**
   * Save recovery session
   */
  private static async saveRecoverySession(session: RecoverySession): Promise<void> {
    try {
      const sessionPath = `${RECOVERY_SESSION_DIR}/${session.sessionId}.json`;
      await RNFS.writeFile(
        sessionPath,
        JSON.stringify(session),
        'utf8'
      );
    } catch (e) {
      console.error('[Recovery] saveRecoverySession error:', e);
    }
  }

  /**
   * Generate 6-digit verification code (000000-999999)
   * 6 haneli doğrulama kodu oluşturun
   */
  private static generateVerificationCode(length: number): string {
    const bytes = secureRandomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
      code += (bytes[i] % 10).toString();
    }
    return code;
  }

  /**
   * Generate cryptographically secure random string
   */
  private static generateSecureRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = secureRandomBytes(length * 2);
    let result = '';
    for (let i = 0; i < length; i++) {
      const value = ((bytes[i * 2] << 8) | bytes[i * 2 + 1]) % chars.length;
      result += chars.charAt(value);
    }
    return result;
  }

  /**
   * Constant-time string comparison (prevents timing attacks)
   * Zamanlamaya karşı duyarlı karşılaştırma
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    
    let equal = 0;
    for (let i = 0; i < a.length; i++) {
      equal |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return equal === 0;
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Compute file hash for integrity check
   * In production, use crypto.createHash('sha256')
   */
  private static async secureHashFile(filePath: string): Promise<string> {
    try {
      const content = await RNFS.readFile(filePath, 'base64');
      return secureCreateHash('sha256').update(content, 'base64').digest('hex');
    } catch (e) {
      console.error('[Recovery] secureHashFile error:', e);
      return '';
    }
  }

  /**
   * Log recovery-related security events
   */
  private static async logRecoveryEvent(
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await SecurityModule.logSecurityEvent('recovery_' + eventType, 'success', details);
    } catch (e) {
      console.error('[Recovery] logRecoveryEvent error:', e);
    }
  }

  /**
   * Cleanup expired recovery sessions (call periodically)
   * Süresi geçmiş kurtarma oturumlarını temizle
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      const sessionFiles = await RNFS.readDir(RECOVERY_SESSION_DIR);
      const now = new Date();

      for (const file of sessionFiles) {
        if (!file.name.endsWith('.json')) continue;

        try {
          const content = await RNFS.readFile(file.path, 'utf8');
          const session: RecoverySession = JSON.parse(content);
          const expiresAt = new Date(session.expiresAt);

          // Delete if expired (add 1 hour buffer)
          if (now > new Date(expiresAt.getTime() + 3600000)) {
            await RNFS.unlink(file.path).catch(() => {});
            console.log('[Recovery] Cleaned up expired session:', session.sessionId);
          }
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (e) {
      console.error('[Recovery] cleanupExpiredSessions error:', e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RECOVERY FLOW COMPONENT (UI Placeholder)
// ═══════════════════════════════════════════════════════════════

/**
 * Recovery flow structure (for UI implementation):
 * 
 * Screen 1: Cannot Unlock?
 *   └─ "Start Recovery Process" button
 *
 * Screen 2: Enter Email
 *   └─ Text input for registered email
 *   └─ "Send Code" button
 *   └─ Code will be sent via email
 *
 * Screen 3: Enter Verification Code
 *   └─ 6-digit code input (from email)
 *   └─ "Verify Code" button
 *   └─ Code expires in 15 minutes
 *
 * Screen 4: Enter Backup Password
 *   └─ Text input (password set at first setup)
 *   └─ "Restore Vault" button
 *
 * Screen 5: Setup Biometric Again
 *   └─ Biometric prompt (fingerprint/face)
 *   └─ "Setup Biometric" button
 *
 * Screen 6: Success
 *   └─ "Vault Restored" confirmation
 *   └─ "Return to Login" button
 */

// Export for use in UI components
export default RecoveryModule;
