/**
 * SyncEnvelope — Aegis Vault Android v4.02
 * Format for synchronization packages sent to/from the relay server.
 * Interoperable with desktop v4.2.0.
 *
 * Senkronizasyon Zarfı — Relay sunucusuna gönderilen/alınan paket formatı.
 */

export interface SyncEnvelope {
  version: string;
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
  };
}

export class SyncEnvelopeUtil {
  static create(
    payload: string,
    iv: string,
    hmac: string,
    deviceId: string,
    options: { sessionId: string; sequenceNumber: number; entryCount?: number; vaultId?: string }
  ): SyncEnvelope {
    return {
      version: '1.0',
      sessionId: options.sessionId,
      deviceId,
      timestamp: new Date().toISOString(),
      sequenceNumber: options.sequenceNumber,
      payload,
      iv,
      hmac,
      metadata: options.entryCount ? { 
          entryCount: options.entryCount,
          vaultId: options.vaultId
      } : undefined,
    };
  }

  static validate(env: SyncEnvelope): boolean {
    if (!env || typeof env !== 'object') return false;
    if (!env.version || !env.sessionId || !env.deviceId || !env.payload || !env.iv || !env.hmac) {
      return false;
    }
    // We only support version 1.0 for now
    return env.version === '1.0';
  }
}
