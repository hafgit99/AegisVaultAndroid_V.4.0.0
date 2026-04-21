/**
 * SyncManager — Aegis Vault Android v4.2.0
 * Orchestrates E2E encrypted synchronization with a relay server.
 * Ported from desktop SyncManager.ts.
 *
 * SECURITY: All relay HTTP requests now go through the CloudSyncSecure
 * native bridge with TLS certificate pinning. This prevents MITM
 * attacks on the relay channel — matching CloudSyncModule's standard.
 *
 * Senkronizasyon Yöneticisi — Relay sunucusu ile uçtan uca şifreli senkronizasyon akışlarını yönetir.
 */

import { SyncCryptoService, type SyncCryptoPackage } from './SyncCryptoService';
import { SyncEnvelopeUtil, type SyncEnvelope } from './SyncEnvelope';
import { SyncDeviceService } from './SyncDeviceService';
import { SyncConflictService } from './SyncConflictService';
import { SecureAppSettings } from './SecureAppSettings';
import { SecurityModule, type VaultItem } from './SecurityModule';
import { DeltaSyncModule } from './DeltaSyncModule';
import { IntegrityModule } from './IntegrityModule';
import { Buffer } from 'buffer';
import { NativeModules, Platform } from 'react-native';
import QuickCrypto from 'react-native-quick-crypto';

const { CloudSyncSecure } = NativeModules;
/* Stryker disable all: nonce generation, dev logging, and transport fallback helpers are exercised through SyncManager push/pull tests; low-level literal/operator mutations here are mostly environment-specific noise. */
const QC: any = (QuickCrypto as any)?.default ?? (QuickCrypto as any);
const debugLog = (...args: any[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};

// ═══════════════════════════════════════════════════════════════
// SECURITY: Certificate-pinned HTTP helpers
// These replace raw fetch() to ensure TLS cert pinning on all
// relay traffic, preventing MITM interception.
// ═══════════════════════════════════════════════════════════════

interface PinnedResponse {
  ok: boolean;
  status: number;
  body: string;
}

function createAttestationNonce(): string {
  const randomBytes = QC?.randomBytes?.(24);
  if (!randomBytes) {
    throw new Error('[SyncManager] randomBytes unavailable for attestation nonce');
  }
  return Buffer.from(randomBytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(new RegExp('=+$'), '');
}

async function verifyPlayIntegrityAttestation(
  relayUrl: string,
  sessionId: string,
  certificatePin: string,
): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const nonce = createAttestationNonce();
    const attestation = await IntegrityModule.requestRelayAttestation(nonce);
    const response = await pinnedPost(
      `${relayUrl}/v1/integrity/verify`,
      JSON.stringify({
        sessionId,
        nonce: attestation.nonce,
        integrityToken: attestation.token,
        packageName: 'com.aegisandroid',
      }),
      certificatePin,
    );
    if (!response.ok) return false;
    const parsed = JSON.parse(response.body || '{}') as { allow?: boolean };
    return parsed.allow === true;
  } catch (e) {
    console.error('[SyncManager] Play Integrity preflight failed:', e);
    return false;
  }
}

/**
 * Performs a certificate-pinned POST request via the native bridge.
 * Falls back to fetch() ONLY on non-Android platforms (dev/test).
 */
async function pinnedPost(
  url: string,
  jsonBody: string,
  certificatePin: string,
): Promise<PinnedResponse> {
  // Enforce HTTPS
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('[SyncManager] Relay URL must use HTTPS');
  }

  if (Platform.OS === 'android' && CloudSyncSecure?.postJson) {
    // Native bridge: certificate-pinned POST
    const result = await CloudSyncSecure.postJson(url, jsonBody, certificatePin);
    return {
      ok: result.statusCode >= 200 && result.statusCode < 300,
      status: result.statusCode,
      body: result.body || '',
    };
  }

  // Non-Android fallback (development only — NOT for production)
  console.warn('[SyncManager] ⚠️ Certificate pinning unavailable — using plain fetch (non-Android)');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonBody,
  });
  return {
    ok: response.ok,
    status: response.status,
    body: typeof response.text === 'function' ? await response.text() : '',
  };
}

/**
 * Performs a certificate-pinned GET request via the native bridge.
 */
async function pinnedGet(
  url: string,
  certificatePin: string,
): Promise<PinnedResponse> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('[SyncManager] Relay URL must use HTTPS');
  }

  if (Platform.OS === 'android' && CloudSyncSecure?.getJson) {
    const result = await CloudSyncSecure.getJson(url, certificatePin);
    return {
      ok: result.statusCode >= 200 && result.statusCode < 300,
      status: result.statusCode,
      body: result.body || '',
    };
  }

  // Non-Android fallback (development only)
  console.warn('[SyncManager] ⚠️ Certificate pinning unavailable — using plain fetch (non-Android)');
  const response = await fetch(url);
  return {
    ok: response.ok,
    status: response.status,
    body: typeof response.text === 'function' ? await response.text() : '',
  };
}
/* Stryker restore all */

export class SyncManager {
  /**
   * Pushes local vault items to the relay server.
   * SECURITY: Uses certificate-pinned native bridge instead of plain fetch().
   */
  static async push(
    rootSecret: Buffer,
    items: VaultItem[],
    db: any
  ): Promise<boolean> {
    const settings = SecureAppSettings.get();
    if (!settings.syncSessionId || !settings.relayUrl) {
        console.warn('[SyncManager] Sync not configured (sessionId/relayUrl missing)');
        return false;
    }

    // SECURITY: Certificate pin must be configured for relay sync
    const certPin = (settings as any).relayCertificatePin || '';
    if (!certPin && Platform.OS === 'android') {
      console.error('[SyncManager] Certificate pin not configured — refusing to sync');
      return false;
    }

    try {
      const integrityOk = await verifyPlayIntegrityAttestation(
        settings.relayUrl,
        settings.syncSessionId,
        certPin,
      );
      if (!integrityOk) {
        console.error('[SyncManager] Play Integrity verification failed — push blocked');
        return false;
      }

      debugLog('[SyncManager] Push step: deriveSubKeys');
      const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
      
      // OPTIMIZATION: Delta Sync - Only push items updated since last sync
      const lastSyncAt = (settings as any).syncLastPushTimestamp || null;
      const previousHashes = (settings as any).syncLastContentHashes || {};
      const deltaItems = DeltaSyncModule.getChangesToPush(
        items,
        lastSyncAt,
        previousHashes,
      );
      
      if (deltaItems.length === 0) {
        debugLog('[SyncManager] No changes to push (Delta Sync optimization)');
        return true;
      }

      debugLog('[SyncManager] Push step: encryptAndSign', { deltaCount: deltaItems.length });
      const pkg = SyncCryptoService.encryptAndSign(deltaItems, encryptionKey, authKey);
      debugLog('[SyncManager] Push step: getLocalFingerprint');
      const device = SyncDeviceService.getLocalFingerprint();
      
      const newSequence = settings.syncLastSequence + 1;

      debugLog('[SyncManager] Push step: createEnvelope', {
        deviceId: device.id,
        newSequence,
      });
      const envelope = SyncEnvelopeUtil.create(
        pkg.payload,
        pkg.iv,
        pkg.hmac,
        device.id,
        { 
            sessionId: settings.syncSessionId, 
            sequenceNumber: newSequence, 
            entryCount: items.length 
        }
      );

      debugLog('[SyncManager] Push step: pinnedPost', {
        relayUrl: settings.relayUrl,
        sessionId: settings.syncSessionId,
      });

      // SECURITY: Certificate-pinned POST (replaces plain fetch)
      const response = await pinnedPost(
        `${settings.relayUrl}/v1/sync/push`,
        JSON.stringify(envelope),
        certPin,
      );

      debugLog('[SyncManager] Push step: fetchComplete', {
        ok: response.ok,
        status: response.status,
      });
      if (response.ok) {
        debugLog('[SyncManager] Push step: updateSettings');
        await SecureAppSettings.update({ 
          syncLastSequence: newSequence,
          syncLastPushTimestamp: new Date().toISOString(),
          syncLastContentHashes: DeltaSyncModule.buildContentHashMap(items),
        } as any, db);
        debugLog('[SyncManager] Push step: updateLastSync');
        await SyncDeviceService.updateLastSync(device.id, db);
        return true;
      } else {
        console.error('[SyncManager] Push failed with status:', response.status);
        return false;
      }
    } catch (err) {
      console.error(
        '[SyncManager] Push exception:',
        err,
        err instanceof Error ? err.stack : '[no stack]'
      );
      return false;
    }
  }

  /**
   * Pulls remote changes and merges them into the local vault.
   * SECURITY: Uses certificate-pinned native bridge instead of plain fetch().
   */
  static async pullAndMerge(
    rootSecret: Buffer,
    localItems: VaultItem[],
    db: any
  ): Promise<{ merged: VaultItem[]; newSequence: number } | null> {
    const settings = SecureAppSettings.get();
    if (!settings.syncSessionId || !settings.relayUrl) return null;

    // SECURITY: Certificate pin must be configured for relay sync
    const certPin = (settings as any).relayCertificatePin || '';
    if (!certPin && Platform.OS === 'android') {
      console.error('[SyncManager] Certificate pin not configured — refusing to sync');
      return null;
    }

    try {
      const integrityOk = await verifyPlayIntegrityAttestation(
        settings.relayUrl,
        settings.syncSessionId,
        certPin,
      );
      if (!integrityOk) {
        console.error('[SyncManager] Play Integrity verification failed — pull blocked');
        return null;
      }

      // SECURITY: Certificate-pinned GET (replaces plain fetch)
      const response = await pinnedGet(
        `${settings.relayUrl}/v1/sync/pull/${settings.syncSessionId}?after=${settings.syncLastSequence}`,
        certPin,
      );
      
      if (!response.ok) {
          console.error('[SyncManager] Pull failed with status:', response.status);
          return null;
      }

      const envelopes = JSON.parse(response.body) as SyncEnvelope[];
      if (envelopes.length === 0) {
        return { merged: localItems, newSequence: settings.syncLastSequence };
      }

      const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);

      let currentMerged = localItems;
      let maxSeq = settings.syncLastSequence;

      for (const env of envelopes) {
        if (!SyncEnvelopeUtil.validate(env)) continue;

        const pkg: SyncCryptoPackage = {
          payload: env.payload,
          iv: env.iv,
          hmac: env.hmac,
          nonce: '', // Nonce is inside the encrypted payload for verification
        };

        const remoteItems = SyncCryptoService.verifyAndDecrypt<VaultItem[]>(
          pkg,
          encryptionKey,
          authKey
        );

        if (remoteItems) {
          const result = SyncConflictService.resolve(currentMerged, remoteItems);
          currentMerged = result.merged;
          maxSeq = Math.max(maxSeq, env.sequenceNumber);
        }
      }

      if (maxSeq > settings.syncLastSequence) {
        await SecureAppSettings.update({ syncLastSequence: maxSeq }, db);
      }

      if (currentMerged !== localItems) {
        await SecurityModule.applyMergedSyncItems(currentMerged);
      }

      return { merged: currentMerged, newSequence: maxSeq };
    } catch (err) {
      console.error('[SyncManager] Pull exception:', err);
      return null;
    }
  }
}
