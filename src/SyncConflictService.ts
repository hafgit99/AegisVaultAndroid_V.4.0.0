/**
 * SyncConflictService — Aegis Vault Android v4.02
 * Implements "Last-Write-Wins" (LWW) conflict resolution for vault items.
 * Ported from desktop SyncConflictService.ts.
 *
 * Çatışma Çözümleme Servisi — Kasa öğeleri için "Last-Write-Wins" (LWW) çatışma çözümleme.
 */

import type { VaultItem } from './SecurityModule';

export interface SyncConflictResult {
  merged: VaultItem[];
  modifiedCount: number;
  conflicts: SyncConflict[];
  summary: SyncConflictSummary;
}

export interface SyncConflict {
  id: string;
  local: VaultItem;
  remote: VaultItem;
  winner: 'local' | 'remote';
  reason: 'newer_timestamp' | 'equal_timestamp_local_preferred';
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export interface SyncConflictSummary {
  policy: 'last_write_wins';
  conflictCount: number;
  localWins: number;
  remoteWins: number;
  remoteInsertions: number;
  modifiedCount: number;
}

export class SyncConflictService {
  static emptySummary(): SyncConflictSummary {
    return {
      policy: 'last_write_wins',
      conflictCount: 0,
      localWins: 0,
      remoteWins: 0,
      remoteInsertions: 0,
      modifiedCount: 0,
    };
  }

  static combineSummaries(
    left: SyncConflictSummary,
    right: SyncConflictSummary,
  ): SyncConflictSummary {
    return {
      policy: 'last_write_wins',
      conflictCount: left.conflictCount + right.conflictCount,
      localWins: left.localWins + right.localWins,
      remoteWins: left.remoteWins + right.remoteWins,
      remoteInsertions: left.remoteInsertions + right.remoteInsertions,
      modifiedCount: left.modifiedCount + right.modifiedCount,
    };
  }

  private static buildSignature(item: VaultItem): string {
    return JSON.stringify({
      id: item.id ?? null,
      title: item.title ?? '',
      username: item.username ?? '',
      password: item.password ?? '',
      url: item.url ?? '',
      notes: item.notes ?? '',
      category: item.category ?? '',
      favorite: item.favorite ?? 0,
      data: item.data ?? '{}',
      is_deleted: item.is_deleted ?? 0,
      deleted_at: item.deleted_at ?? null,
      updated_at: item.updated_at ?? null,
      created_at: item.created_at ?? null,
    });
  }

  /**
   * Resolves conflicts between a local list and a remote list of items.
   * Merges based on 'updated_at' timestamp.
   */
  static resolve(local: VaultItem[], remote: VaultItem[]): SyncConflictResult {
    const localMap = new Map(local.map(i => [String(i.id), i]));
    const remoteMap = new Map(remote.map(i => [String(i.id), i]));
    
    const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
    const merged: VaultItem[] = [];
    const conflicts: SyncConflict[] = [];
    let modifiedCount = 0;
    let localWins = 0;
    let remoteWins = 0;
    let remoteInsertions = 0;

    allIds.forEach(id => {
      const l = localMap.get(id);
      const r = remoteMap.get(id);

      if (l && r) {
        // Conflict detected
        const lTime = new Date(l.updated_at || 0).getTime();
        const rTime = new Date(r.updated_at || 0).getTime();

        // If contents differ, we log a conflict, but resolve automatically by time
        const lSig = this.buildSignature(l);
        const rSig = this.buildSignature(r);

        if (lTime >= rTime) {
          merged.push(l);
          if (lSig !== rSig) {
            localWins++;
            conflicts.push({
              id,
              local: l,
              remote: r,
              winner: 'local',
              reason: lTime === rTime ? 'equal_timestamp_local_preferred' : 'newer_timestamp',
              localUpdatedAt: l.updated_at,
              remoteUpdatedAt: r.updated_at,
            });
          }
        } else {
          merged.push(r);
          modifiedCount++;
          if (lSig !== rSig) {
            remoteWins++;
            conflicts.push({
              id,
              local: l,
              remote: r,
              winner: 'remote',
              reason: 'newer_timestamp',
              localUpdatedAt: l.updated_at,
              remoteUpdatedAt: r.updated_at,
            });
          }
        }
      } else if (l) {
        // Local only
        merged.push(l);
      } else if (r) {
        // Remote only (newly added elsewhere)
        merged.push(r);
        modifiedCount++;
        remoteInsertions++;
      }
    });

    return {
      merged,
      modifiedCount,
      conflicts,
      summary: {
        policy: 'last_write_wins',
        conflictCount: conflicts.length,
        localWins,
        remoteWins,
        remoteInsertions,
        modifiedCount,
      },
    };
  }

  /**
   * Helper to merge two maps of items (useful for state sync).
   */
  static mergeOne(local: VaultItem | undefined, remote: VaultItem): VaultItem {
    if (!local) return remote;
    const lTime = new Date(local.updated_at || 0).getTime();
    const rTime = new Date(remote.updated_at || 0).getTime();
    return lTime >= rTime ? local : remote;
  }
}
