/**
 * SecureAppSettings — Aegis Vault Android v4.02
 * Centralized, persisted settings management using SQLCipher.
 *
 * Merkezi Ayar Yönetimi — SQLCipher key-value tablosunda şifreli saklama.
 * Dashboard state yönetiminin yerine geçer; reactive güncelleme desteği.
 */

import { DeviceEventEmitter } from 'react-native';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ThemeMode = 'light' | 'dark';

export interface SecurityCenterHistoryEvent {
  id: string;
  at: string;
  action: 'reviewed' | 'reopened' | 'auto_resolved';
  reviewKey: string;
  issueType: string;
  title?: string;
}

export interface SharedMember {
  id: string;
  name: string;
  email?: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'pending' | 'emergency_only';
}

export interface SharedSpace {
  id: string;
  name: string;
  kind: 'family' | 'team' | 'private';
  members: SharedMember[];
  created_at: string;
  updated_at: string;
}

export interface SharingAuditEvent {
  id: string;
  at: string;
  type: string;
  spaceId: string;
  detail?: string;
}

export interface SecureAppSettingsState {
  // Security & Vault
  autoLockSeconds: number;
  biometricEnabled: boolean;
  clipboardClearSeconds: number;
  passwordLength: number;

  // Theme & Display
  darkMode: boolean;
  themeMode: ThemeMode;

  // Features
  breachCheckEnabled: boolean;

  // Security Center
  securityCenterReviews: Record<string, string>;
  securityCenterHistory: SecurityCenterHistoryEvent[];

  // Sync & Relay (Phase 2 & 3)
  relayUrl: string;
  syncSessionId: string;
  syncLastSequence: number;

  // Sharing (Phase 3)
  sharedSpaces: SharedSpace[];
  sharingAuditLog: SharingAuditEvent[];
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

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const SETTINGS_TABLE = 'aegis_settings_v1';
const SETTINGS_KEY = 'app_settings_v1';
export const SETTINGS_CHANGED_EVENT = 'aegis_settings_changed';

const DEFAULT_STATE: SecureAppSettingsState = {
  autoLockSeconds: 60,
  biometricEnabled: true,
  clipboardClearSeconds: 30,
  passwordLength: 20,
  darkMode: false,
  themeMode: 'light',
  breachCheckEnabled: false,
  securityCenterReviews: {},
  securityCenterHistory: [],
  relayUrl: 'https://relay.aegis.io',
  syncSessionId: '',
  syncLastSequence: 0,
  sharedSpaces: [],
  sharingAuditLog: [],
};

// ═══════════════════════════════════════════════════════════════
// Internal State
// ═══════════════════════════════════════════════════════════════

let stateCache: SecureAppSettingsState = cloneState(DEFAULT_STATE);
let initialized = false;

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function cloneState(state: SecureAppSettingsState): SecureAppSettingsState {
  return {
    ...state,
    securityCenterReviews: { ...state.securityCenterReviews },
    securityCenterHistory: state.securityCenterHistory.map(e => ({ ...e })),
    sharedSpaces: state.sharedSpaces.map(s => ({ ...s, members: s.members.map(m => ({ ...m })) })),
    sharingAuditLog: state.sharingAuditLog.map(e => ({ ...e })),
  };
}

function mergeWithDefaults(partial: Partial<SecureAppSettingsState>): SecureAppSettingsState {
  const merged = { ...DEFAULT_STATE };

  if (typeof partial.autoLockSeconds === 'number') merged.autoLockSeconds = partial.autoLockSeconds;
  if (typeof partial.biometricEnabled === 'boolean') merged.biometricEnabled = partial.biometricEnabled;
  if (typeof partial.clipboardClearSeconds === 'number') merged.clipboardClearSeconds = partial.clipboardClearSeconds;
  if (typeof partial.passwordLength === 'number') merged.passwordLength = partial.passwordLength;
  if (typeof partial.darkMode === 'boolean') {
    merged.darkMode = partial.darkMode;
    merged.themeMode = partial.darkMode ? 'dark' : 'light';
  }
  if (partial.themeMode === 'light' || partial.themeMode === 'dark') {
    merged.themeMode = partial.themeMode;
    merged.darkMode = partial.themeMode === 'dark';
  }
  if (typeof partial.breachCheckEnabled === 'boolean') merged.breachCheckEnabled = partial.breachCheckEnabled;
  if (partial.securityCenterReviews && typeof partial.securityCenterReviews === 'object') {
    merged.securityCenterReviews = { ...partial.securityCenterReviews };
  }
  if (Array.isArray(partial.securityCenterHistory)) {
    merged.securityCenterHistory = partial.securityCenterHistory.map(e => ({ ...e }));
  }

  if (typeof partial.relayUrl === 'string') merged.relayUrl = partial.relayUrl;
  if (typeof partial.syncSessionId === 'string') merged.syncSessionId = partial.syncSessionId;
  if (typeof partial.syncLastSequence === 'number') merged.syncLastSequence = partial.syncLastSequence;
  if (Array.isArray(partial.sharedSpaces)) {
    merged.sharedSpaces = partial.sharedSpaces.map(s => ({ ...s }));
  }
  if (Array.isArray(partial.sharingAuditLog)) {
    merged.sharingAuditLog = partial.sharingAuditLog.map(e => ({ ...e }));
  }

  return merged;
}

type DbQueryResult = {
  rows?: Array<Record<string, any>> | { length: number; item: (index: number) => any };
};

function getRows(result: DbQueryResult | null | undefined): Array<Record<string, any>> {
  const rows = result?.rows;
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows.length === 'number' && typeof rows.item === 'function') {
    return Array.from({ length: rows.length }, (_, index) => rows.item(index));
  }
  return [];
}

async function runDbQuery(
  db: any,
  query: string,
  params?: any[],
): Promise<DbQueryResult | undefined> {
  if (typeof db?.executeSync === 'function') {
    return params ? db.executeSync(query, params) : db.executeSync(query);
  }
  if (typeof db?.execute === 'function') {
    return params ? await db.execute(query, params) : await db.execute(query);
  }
  throw new Error('Database connection does not support execute or executeSync');
}

// ═══════════════════════════════════════════════════════════════
// SecureAppSettings Module
// ═══════════════════════════════════════════════════════════════

export const SecureAppSettings = {
  /**
   * Initialize settings from SQLCipher. Should be called after vault unlock.
   * Ayarları SQLCipher'dan yükle. Kasa açıldıktan sonra çağrılmalı.
   */
  async init(db: any): Promise<void> {
    try {
      // Ensure settings table exists
      await runDbQuery(
        db,
        `CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (key TEXT PRIMARY KEY, value TEXT)`,
      );

      const result = await runDbQuery(
        db,
        `SELECT value FROM ${SETTINGS_TABLE} WHERE key = ?`,
        [SETTINGS_KEY],
      );

      const rows = getRows(result);
      if (rows.length > 0) {
        const raw = rows[0]?.value;
        const parsed = JSON.parse(raw);
        stateCache = mergeWithDefaults(parsed);
      } else {
        stateCache = cloneState(DEFAULT_STATE);
      }

      initialized = true;
    } catch (e) {
      console.warn('[SecureAppSettings] Init failed, using defaults:', e);
      stateCache = { ...DEFAULT_STATE };
      initialized = true;
    }
  },

  /**
   * Get full settings state (cloned to prevent mutations).
   * Tam ayar durumunu al (mutasyonları önlemek için klonlanmış).
   */
  get(): SecureAppSettingsState {
    return cloneState(stateCache);
  },

  /**
   * Helper to convert full state to legacy VaultSettings for UI backwards compatibility.
   */
  toVaultSettings(): VaultSettings {
    const s = this.get();
    return {
      autoLockSeconds: s.autoLockSeconds,
      biometricEnabled: s.biometricEnabled,
      clipboardClearSeconds: s.clipboardClearSeconds,
      passwordLength: s.passwordLength,
      darkMode: s.darkMode,
      breachCheckEnabled: s.breachCheckEnabled,
      deviceTrustPolicy: {
        deviceTrustPolicy: 'moderate',
        requireBiometric: true,
        rootDetectionEnabled: true,
        rootBlocksVault: false,
        degradedDeviceAction: 'warn',
      },
    };
  },

  /**
   * Get a single setting value.
   * Tek bir ayar değeri al.
   */
  getValue<K extends keyof SecureAppSettingsState>(key: K): SecureAppSettingsState[K] {
    return stateCache[key];
  },

  /**
   * Update one or more settings and persist to SQLCipher.
   * Bir veya daha fazla ayarı güncelle ve SQLCipher'a kaydet.
   */
  async update(
    partial: Partial<SecureAppSettingsState>,
    db?: any,
  ): Promise<void> {
    // Sync darkMode ↔ themeMode
    if ('darkMode' in partial && partial.darkMode !== undefined) {
      partial.themeMode = partial.darkMode ? 'dark' : 'light';
    } else if ('themeMode' in partial && partial.themeMode !== undefined) {
      partial.darkMode = partial.themeMode === 'dark';
    }

    Object.assign(stateCache, partial);

    // Persist
    if (db) {
      try {
        const json = JSON.stringify(stateCache);
        await runDbQuery(
          db,
          `INSERT OR REPLACE INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?)`,
          [SETTINGS_KEY, json],
        );
      } catch (e) {
        console.warn('[SecureAppSettings] Persist failed:', e);
      }
    }

    // Emit change event for reactive listeners
    DeviceEventEmitter.emit(SETTINGS_CHANGED_EVENT, cloneState(stateCache));
  },

  /**
   * Reset all settings to defaults and persist.
   * Tüm ayarları varsayılana sıfırla ve kaydet.
   */
  async reset(db?: any): Promise<void> {
    stateCache = cloneState(DEFAULT_STATE);
    if (db) {
      try {
        await runDbQuery(
          db,
          `INSERT OR REPLACE INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?)`,
          [SETTINGS_KEY, JSON.stringify(DEFAULT_STATE)],
        );
      } catch (e) {
        console.warn('[SecureAppSettings] Reset persist failed:', e);
      }
    }
    DeviceEventEmitter.emit(SETTINGS_CHANGED_EVENT, cloneState(stateCache));
  },

  /**
   * Check if settings have been initialized.
   * Ayarların başlatılıp başlatılmadığını kontrol et.
   */
  isInitialized(): boolean {
    return initialized;
  },

  // ── Security Center Review Management ──

  /**
   * Mark a triage item as reviewed.
   * Bir güvenlik bulgusu öğesini incelenmiş olarak işaretle.
   */
  async markReviewed(reviewKey: string, issueType: string, title?: string, db?: any): Promise<void> {
    const now = new Date().toISOString();
    stateCache.securityCenterReviews[reviewKey] = now;
    stateCache.securityCenterHistory.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: now,
      action: 'reviewed',
      reviewKey,
      issueType,
      title,
    });
    await this.update({}, db);
  },

  /**
   * Reopen a previously reviewed triage item.
   * Daha önce incelenmiş bir güvenlik bulgusunu yeniden aç.
   */
  async reopenReview(reviewKey: string, issueType: string, title?: string, db?: any): Promise<void> {
    delete stateCache.securityCenterReviews[reviewKey];
    stateCache.securityCenterHistory.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      action: 'reopened',
      reviewKey,
      issueType,
      title,
    });
    await this.update({}, db);
  },

  /**
   * Get review metadata for a specific item.
   * Belirli bir öğe için inceleme metaverilerini al.
   */
  getReviewMeta(reviewKey: string): { reviewedAt: string | null; isExpired: boolean } {
    const reviewedAt = stateCache.securityCenterReviews[reviewKey] || null;
    if (!reviewedAt) return { reviewedAt: null, isExpired: false };

    const REVIEW_REAPPEAR_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
    const isExpired = Date.now() - new Date(reviewedAt).getTime() > REVIEW_REAPPEAR_MS;
    return { reviewedAt, isExpired };
  },

  /** Reset initialization flag (for testing). */
  _resetForTest(): void {
    stateCache = cloneState(DEFAULT_STATE);
    initialized = false;
  },
};
