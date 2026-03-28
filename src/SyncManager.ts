/**
 * SyncManager — Aegis Vault Android v4.02
 * Orchestrates E2E encrypted synchronization with a relay server.
 * Ported from desktop SyncManager.ts.
 *
 * Senkronizasyon Yöneticisi — Relay sunucusu ile uçtan uca şifreli senkronizasyon akışlarını yönetir.
 */

import { SyncCryptoService, type SyncCryptoPackage } from './SyncCryptoService';
import { SyncEnvelopeUtil, type SyncEnvelope } from './SyncEnvelope';
import { SyncDeviceService } from './SyncDeviceService';
import { SyncConflictService } from './SyncConflictService';
import { SecureAppSettings } from './SecureAppSettings';
import { SecurityModule, type VaultItem } from './SecurityModule';
import { Buffer } from 'buffer';

export class SyncManager {
  /**
   * Pushes local vault items to the relay server.
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

    try {
      console.log('[SyncManager] Push step: deriveSubKeys');
      const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
      console.log('[SyncManager] Push step: encryptAndSign', { itemCount: items.length });
      const pkg = SyncCryptoService.encryptAndSign(items, encryptionKey, authKey);
      console.log('[SyncManager] Push step: getLocalFingerprint');
      const device = SyncDeviceService.getLocalFingerprint();
      
      const newSequence = settings.syncLastSequence + 1;

      console.log('[SyncManager] Push step: createEnvelope', {
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

      console.log('[SyncManager] Push step: fetch', {
        relayUrl: settings.relayUrl,
        sessionId: settings.syncSessionId,
      });
      const response = await fetch(`${settings.relayUrl}/v1/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });

      console.log('[SyncManager] Push step: fetchComplete', {
        ok: response?.ok,
        status: response?.status,
      });
      if (response.ok) {
        console.log('[SyncManager] Push step: updateSettings');
        await SecureAppSettings.update({ syncLastSequence: newSequence }, db);
        console.log('[SyncManager] Push step: updateLastSync');
        await SyncDeviceService.updateLastSync(device.id, db);
        return true;
      } else {
        const errBody =
          typeof response.text === 'function'
            ? await response.text()
            : '[response.text unavailable]';
        console.error('[SyncManager] Push failed with status:', response.status, errBody);
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
   */
  static async pullAndMerge(
    rootSecret: Buffer,
    localItems: VaultItem[],
    db: any
  ): Promise<{ merged: VaultItem[]; newSequence: number } | null> {
    const settings = SecureAppSettings.get();
    if (!settings.syncSessionId || !settings.relayUrl) return null;

    try {
      const response = await fetch(
        `${settings.relayUrl}/v1/sync/pull/${settings.syncSessionId}?after=${settings.syncLastSequence}`
      );
      
      if (!response.ok) {
          console.error('[SyncManager] Pull failed with status:', response.status);
          return null;
      }

      const envelopes = (await response.json()) as SyncEnvelope[];
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
