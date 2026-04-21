/**
 * WearOSModule — Android Smartwatch Synchronization & Lifecycle
 * 
 * Wear OS Companion Modülü — Akıllı saat ile telefon arasındaki 
 * uçtan uca şifreli veri senkronizasyonunu (Google Data Layer API) yönetir.
 * Bu modül v5.0.0 yol haritasındaki ana giyilebilir teknoloji köprüsüdür.
 */

import { NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';
import { SecurityModule, VaultItem } from './SecurityModule';
import { WearSyncCrypto } from './WearSyncCrypto';

const { WearOSBridge } = NativeModules;

export interface WearOSDeviceInfo {
  name: string;
  id: string;
  batteryLevel?: number;
  lastSeen: string;
  status: 'connected' | 'disconnected' | 'syncing';
}

export class WearOSModule {
  private static async buildEncryptedFavoritesPayload(
    favorites: VaultItem[],
  ): Promise<string> {
    const syncRootSecret = await SecurityModule.getActiveSyncRootSecret();
    if (!syncRootSecret) {
      throw new Error('Vault is locked, Wear OS sync key is unavailable.');
    }
    const rootSecretBuffer = Buffer.from(syncRootSecret);

    const envelope = WearSyncCrypto.createEnvelope(
      favorites.map(f => ({
        id: f.id,
        title: f.title,
        secret: f.password,
        issuer: f.category || 'Aegis',
      })),
      rootSecretBuffer,
    );

    return JSON.stringify(envelope);
  }
  
  /**
   * Sync favorite TOTP items to the watch
   * SECURITY: Only selected favorites are synchronized to the watch storage.
   * Encryption on the watch uses the same master key derivation logic if standalone.
   */
  static async syncFavoritesToWatch(items: VaultItem[]): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    // Favori ve TOTP içeren kayıtları saatin küçük ekranı için filtrele
    const favorites = items.filter(item => item.favorite === 1 && (item.password || '').length > 0);
    
    try {
      console.log(`[WearOS] Syncing ${favorites.length} items to Google Play Data Layer...`);
      
      // Native bridge calls the standard Android Wearable.getDataClient()
      if (typeof WearOSBridge?.syncItems === 'function') {
        const payload = await this.buildEncryptedFavoritesPayload(favorites);
        
        await WearOSBridge.syncItems(payload);
      }
      
      await SecurityModule.logSecurityEvent('wear_os_sync_complete', 'success', { count: favorites.length });
      return true;
    } catch (e) {
      console.error('[WearOS] Sync error:', e);
      return false;
    }
  }

  /**
   * Check if a watch is currently paired and reachable
   */
  static async getConnectedWatch(): Promise<WearOSDeviceInfo | null> {
    if (Platform.OS !== 'android' || !WearOSBridge?.getConnectedNodes) return null;

    try {
      const nodes = await WearOSBridge.getConnectedNodes();
      if (nodes && nodes.length > 0) {
        return {
          name: nodes[0].displayName || 'Wear OS Watch',
          id: nodes[0].id,
          lastSeen: new Date().toISOString(),
          status: 'connected'
        };
      }
    } catch (e) {
      console.warn('[WearOS] Could not reach paired watch:', e);
    }
    return null;
  }

  /**
   * Toggle persistent standalone mode on the watch
   */
  static async setStandaloneMode(enabled: boolean): Promise<boolean> {
    // If true, watch keeps passwords decrypted in watch-keystore for offline use
    if (WearOSBridge?.setStandaloneMode) {
      return await WearOSBridge.setStandaloneMode(enabled);
    }
    return false;
  }
}

export default WearOSModule;
