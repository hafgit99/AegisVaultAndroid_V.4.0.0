/**
 * SyncConflictService.test.ts — Aegis Vault Android v4.02
 * Tests for synchronization conflict resolution (LWW).
 */

import { SyncConflictService } from '../src/SyncConflictService';

const makeItem = (id: number, updated: string, extra: any = {}): any => ({
  id,
  title: `Item ${id}`,
  username: 'user',
  url: 'https://test.com',
  updated_at: updated,
  ...extra,
});

describe('SyncConflictService', () => {
  it('merges new remote items into local', () => {
    const local = [makeItem(1, '2024-01-01T00:00:00Z')];
    const remote = [makeItem(2, '2024-01-02T00:00:00Z')];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged).toHaveLength(2);
    expect(result.modifiedCount).toBe(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('resolves conflict with Last-Write-Wins (Remote newer)', () => {
    const local = [makeItem(1, '2024-01-01T00:00:00Z', { title: 'LocalTitle' })];
    const remote = [makeItem(1, '2024-01-02T00:00:00Z', { title: 'RemoteTitle' })];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged[0].title).toBe('RemoteTitle');
    expect(result.modifiedCount).toBe(1);
    expect(result.conflicts).toHaveLength(1); // Content mismatch + same ID
  });

  it('resolves conflict with Last-Write-Wins (Local newer)', () => {
    const local = [makeItem(1, '2024-02-01T00:00:00Z', { title: 'LocalTitle' })];
    const remote = [makeItem(1, '2024-01-01T00:00:00Z', { title: 'RemoteTitle' })];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged[0].title).toBe('LocalTitle');
    expect(result.modifiedCount).toBe(0);
    expect(result.conflicts).toHaveLength(1);
  });

  it('does not report conflict if contents are identical', () => {
    const local = [makeItem(1, '2024-01-01T00:00:00Z')];
    const remote = [makeItem(1, '2024-01-01T00:00:00Z')];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('handles empty lists', () => {
    expect(SyncConflictService.resolve([], [])).toEqual({ merged: [], modifiedCount: 0, conflicts: [] });
  });
});
