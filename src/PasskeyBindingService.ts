/**
 * PasskeyBindingService — Aegis Vault Android v4.02
 * Manages FIDO2 passkey bindings, rotation, revocation, and recovery.
 * Ported from desktop PasskeyBindingService.ts, adapted for SQLCipher persistence.
 *
 * Passkey Bağlama Servisi — FIDO2 passkey bağlama, rotasyon, iptal ve kurtarma yönetimi.
 */

import { DeviceEventEmitter, Platform } from 'react-native';

export interface PasskeyBindingMeta {
  createdAt: string;
  lastUsedAt: string;
  version: number;
  deviceLabel?: string;
  deviceFingerprint?: string;
  rotatedAt?: string;
  rotatedFromCredentialId?: string;
  recoveryLastExportedAt?: string;
}

export interface PasskeyEventRecord {
  at: string;
  type: 'bound' | 'rotated' | 'used' | 'revoked' | 'recovery_exported' | 'recovery_imported' | 'policy_updated';
  credentialId?: string;
  deviceFingerprint?: string;
  detail?: string;
}

export interface PasskeyRevocationRecord {
  credentialId: string;
  revokedAt: string;
  reason: string;
  deviceFingerprint?: string;
}

export interface PasskeyPolicy {
  maxBindingAgeDays: number;
  requireRecoveryExportBeforeRotation: boolean;
  blockRevokedCredentials: boolean;
}

export interface PasskeyBindingRecord {
  credentialId: string;
  encryptedPayload: string; // PRF-derived or stable-secret
  prfSalt: string;
  meta: PasskeyBindingMeta;
  eventLog: PasskeyEventRecord[];
}

export interface PasskeySecureState {
  bindings: Record<string, PasskeyBindingRecord>;
  auditLog: PasskeyEventRecord[];
  revocations: PasskeyRevocationRecord[];
  policy: PasskeyPolicy;
}

const SETTINGS_TABLE = 'aegis_settings_v1';
const PASSKEY_KEY = 'app_passkey_state_v1';
export const PASSKEY_STATE_CHANGED = 'aegis_passkey_state_changed';

const DEFAULT_POLICY: PasskeyPolicy = {
  maxBindingAgeDays: 90,
  requireRecoveryExportBeforeRotation: false,
  blockRevokedCredentials: true,
};

const DEFAULT_STATE: PasskeySecureState = {
  bindings: {},
  auditLog: [],
  revocations: [],
  policy: { ...DEFAULT_POLICY },
};

let stateCache: PasskeySecureState = JSON.parse(JSON.stringify(DEFAULT_STATE));
let initialized = false;

function cloneState(state: PasskeySecureState): PasskeySecureState {
  return JSON.parse(JSON.stringify(state));
}

function getDeviceInfo() {
  const deviceLabel = `${Platform.OS === 'android' ? 'Android' : 'iOS'} Device`;
  // Simple fingerprint for triage, doesn't need to be cryptographically secure
  const fingerprint = Platform.Version?.toString() || 'unknown';
  return { deviceLabel, deviceFingerprint: fingerprint };
}

export const PasskeyBindingService = {
  /**
   * Initialize passkey state from SQLCipher.
   */
  async init(db: any): Promise<void> {
    if (initialized) return;
    try {
      const result = db.execute(
        `SELECT value FROM ${SETTINGS_TABLE} WHERE key = ?`,
        [PASSKEY_KEY],
      );

      if (result?.rows?.length > 0) {
        const raw = result.rows.item(0).value;
        const parsed = JSON.parse(raw);
        stateCache = {
            ...DEFAULT_STATE,
            ...parsed,
            policy: { ...DEFAULT_POLICY, ...(parsed.policy || {}) }
        };
      } else {
        stateCache = cloneState(DEFAULT_STATE);
      }
      initialized = true;
    } catch (e) {
      console.warn('[PasskeyBindingService] Init failed:', e);
      stateCache = cloneState(DEFAULT_STATE);
      initialized = true;
    }
  },

  get(): PasskeySecureState {
    return cloneState(stateCache);
  },

  async loadAllBindings(db: any): Promise<PasskeySecureState> {
    if (!initialized) await this.init(db);
    return this.get();
  },

  async persist(db: any): Promise<void> {
    if (!db) return;
    try {
      db.execute(
        `INSERT OR REPLACE INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?)`,
        [PASSKEY_KEY, JSON.stringify(stateCache)],
      );
    } catch (e) {
      console.warn('[PasskeyBindingService] Persist failed:', e);
    }
  },

  /**
   * Save a new or rotated passkey binding.
   */
  async saveBinding(record: PasskeyBindingRecord, db: any): Promise<void> {
    const now = new Date().toISOString();
    const deviceInfo = getDeviceInfo();
    const existing = stateCache.bindings[record.credentialId];

    const newRecord: PasskeyBindingRecord = {
      ...record,
      meta: {
        ...record.meta,
        createdAt: record.meta.createdAt || now,
        lastUsedAt: record.meta.lastUsedAt || now,
        deviceLabel: record.meta.deviceLabel || deviceInfo.deviceLabel,
        deviceFingerprint: record.meta.deviceFingerprint || deviceInfo.deviceFingerprint,
        rotatedAt: existing ? now : undefined,
        rotatedFromCredentialId: existing ? existing.credentialId : undefined,
      },
      eventLog: [...(existing?.eventLog || []), ...(record.eventLog || [])].slice(-20)
    };

    stateCache.bindings[record.credentialId] = newRecord;

    const event: PasskeyEventRecord = {
        at: now,
        type: existing ? 'rotated' : 'bound',
        credentialId: record.credentialId,
        deviceFingerprint: deviceInfo.deviceFingerprint,
        detail: existing ? 'Passkey rotated.' : 'Passkey bound.'
    };

    stateCache.auditLog.push(event);
    newRecord.eventLog.push(event);

    await this.persist(db);
    DeviceEventEmitter.emit(PASSKEY_STATE_CHANGED, cloneState(stateCache));
  },

  /**
   * Revoke a passkey.
   */
  async revokeBinding(credentialId: string, reason: string, db: any): Promise<void> {
    const record = stateCache.bindings[credentialId];
    if (!record) return;

    const now = new Date().toISOString();
    const deviceInfo = getDeviceInfo();

    stateCache.revocations.push({
      credentialId,
      revokedAt: now,
      reason,
      deviceFingerprint: deviceInfo.deviceFingerprint
    });

    stateCache.auditLog.push({
      at: now,
      type: 'revoked',
      credentialId,
      detail: reason
    });

    delete stateCache.bindings[credentialId];
    await this.persist(db);
    DeviceEventEmitter.emit(PASSKEY_STATE_CHANGED, cloneState(stateCache));
  },

  /**
   * Update last used timestamp.
   */
  async updateLastUsed(credentialId: string, db: any): Promise<void> {
    const record = stateCache.bindings[credentialId];
    if (!record) return;

    const now = new Date().toISOString();
    record.meta.lastUsedAt = now;
    
    stateCache.auditLog.push({
      at: now,
      type: 'used',
      credentialId
    });

    await this.persist(db);
    DeviceEventEmitter.emit(PASSKEY_STATE_CHANGED, cloneState(stateCache));
  },

  /**
   * Check for policy violations.
   */
  getPolicyViolations(credentialId: string): string[] {
    const binding = stateCache.bindings[credentialId];
    if (!binding) return [];
    
    const violations: string[] = [];
    const policy = stateCache.policy;

    if (policy.blockRevokedCredentials && stateCache.revocations.some(r => r.credentialId === credentialId)) {
      violations.push('PASSKEY_REVOKED');
    }

    const createdAt = new Date(binding.meta.createdAt).getTime();
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    if (ageDays > policy.maxBindingAgeDays) {
      violations.push('PASSKEY_ROTATION_REQUIRED');
    }

    return violations;
  },

  /**
   * Reset all passkey state.
   */
  async reset(db: any): Promise<void> {
    stateCache = cloneState(DEFAULT_STATE);
    await this.persist(db);
    DeviceEventEmitter.emit(PASSKEY_STATE_CHANGED, stateCache);
  },

  _resetForTest(): void {
    stateCache = cloneState(DEFAULT_STATE);
    initialized = false;
  }
};
