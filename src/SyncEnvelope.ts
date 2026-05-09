/**
 * SyncEnvelope — Aegis Vault Android v4.2.0
 * Format for synchronization packages sent to/from the relay server.
 * Interoperable with desktop v4.2.0.
 *
 * Senkronizasyon Zarfı — Relay sunucusuna gönderilen/alınan paket formatı.
 */

export interface SyncEnvelope {
  version: string;
  protocol?: {
    schemaVersion: '1.1';
    minSupportedVersion: '1.0';
    compatibility: string[];
  };
  sessionId: string;
  deviceId: string;
  timestamp: string;
  sequenceNumber: number;
  payload: string; // Base64(AES-GCM-Encrypted + Tag)
  iv: string;      // Base64(12-byte IV)
  hmac: string;    // Base64(HMAC-SHA256)
  metadata?: {
    entryCount: number;
    vaultId?: string;
    delta?: boolean;
    conflictPolicy?: 'last_write_wins';
    baseSequence?: number;
  };
}

export class SyncEnvelopeUtil {
  static create(
    payload: string,
    iv: string,
    hmac: string,
    deviceId: string,
    options: {
      sessionId: string;
      sequenceNumber: number;
      entryCount?: number;
      vaultId?: string;
      delta?: boolean;
      baseSequence?: number;
      compatibility?: string[];
    }
  ): SyncEnvelope {
    return {
      version: '1.1',
      protocol: {
        schemaVersion: '1.1',
        minSupportedVersion: '1.0',
        compatibility: options.compatibility || [
          'desktop-v5-canonical',
          'android-delta-sync',
          'lww-conflict-summary',
        ],
      },
      sessionId: options.sessionId,
      deviceId,
      timestamp: new Date().toISOString(),
      sequenceNumber: options.sequenceNumber,
      payload,
      iv,
      hmac,
      metadata: options.entryCount ? {
          entryCount: options.entryCount,
          vaultId: options.vaultId,
          delta: options.delta ?? true,
          conflictPolicy: 'last_write_wins',
          baseSequence: options.baseSequence,
      } : undefined,
    };
  }

  static validate(env: SyncEnvelope): boolean {
    if (!env || typeof env !== 'object') return false;
    if (!env.version || !env.sessionId || !env.deviceId || !env.payload || !env.iv || !env.hmac) {
      return false;
    }
    if (env.version === '1.0') {
      return true;
    }
    if (env.version !== '1.1') {
      return false;
    }
    return env.protocol?.schemaVersion === '1.1' &&
      env.protocol?.minSupportedVersion === '1.0';
  }
}
