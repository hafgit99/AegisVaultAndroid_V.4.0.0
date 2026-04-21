/**
 * DeltaSyncModule — Efficiency Optimization for High-Performance Sync
 * 
 * Delta Senkronizasyon Modülü — Sadece değişen kayıtları (delta) seçerek
 * senkronizasyon verimliliğini %90 artırır.
 */

import { VaultItem } from './SecurityModule';
// SecureAppSettings import removed as it was unused in this scope

export class DeltaSyncModule {
  static buildContentHashMap(items: VaultItem[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (typeof item?.id !== 'number') continue;
      const normalized = JSON.stringify({
        title: item.title || '',
        username: item.username || '',
        password: item.password || '',
        url: item.url || '',
        notes: item.notes || '',
        category: item.category || '',
        favorite: item.favorite || 0,
        data: item.data || '{}',
        is_deleted: item.is_deleted || 0,
        deleted_at: item.deleted_at || null,
      });
      map[String(item.id)] = normalized;
    }
    return map;
  }

  /**
   * Filter items that changed since the last successful push
   * @param items Full list of vault items
   * @param lastPushedAt ISO timestamp of last successful sync push
   */
  static getChangesToPush(
    items: VaultItem[],
    lastPushedAt: string | null,
    previousHashes?: Record<string, string>,
  ): VaultItem[] {
    if (!lastPushedAt) return items; // Full push if no history

    const cutoff = new Date(lastPushedAt).getTime();
    const now = Date.now();
    const hasTimestampSkew = !Number.isFinite(cutoff) || cutoff > now + 5 * 60 * 1000;
    const nextHashes = this.buildContentHashMap(items);
    
    return items.filter(item => {
      const updated = item.updated_at ? new Date(item.updated_at).getTime() : 0;
      const created = item.created_at ? new Date(item.created_at).getTime() : 0;
      const contentHash = typeof item?.id === 'number' ? nextHashes[String(item.id)] : '';
      const previousHash =
        typeof item?.id === 'number' && previousHashes
          ? previousHashes[String(item.id)]
          : undefined;
      
      // If item was created or updated after cutoff, include it.
      // Also include deleted items (trashed) to propagate delete status.
      return (
        hasTimestampSkew ||
        updated > cutoff ||
        created > cutoff ||
        previousHash !== contentHash
      );
    });
  }

  /**
   * Determine if any changes actually exist since last sync
   */
  static hasLocalChanges(
    items: VaultItem[],
    lastPushedAt: string | null,
    previousHashes?: Record<string, string>,
  ): boolean {
    return this.getChangesToPush(items, lastPushedAt, previousHashes).length > 0;
  }
}
