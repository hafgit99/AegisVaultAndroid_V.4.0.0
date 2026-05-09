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
    expect(result.summary).toMatchObject({
      policy: 'last_write_wins',
      remoteInsertions: 1,
      modifiedCount: 1,
    });
  });

  it('resolves conflict with Last-Write-Wins (Remote newer)', () => {
    const local = [makeItem(1, '2024-01-01T00:00:00Z', { title: 'LocalTitle' })];
    const remote = [makeItem(1, '2024-01-02T00:00:00Z', { title: 'RemoteTitle' })];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged[0].title).toBe('RemoteTitle');
    expect(result.modifiedCount).toBe(1);
    expect(result.conflicts).toHaveLength(1); // Content mismatch + same ID
    expect(result.conflicts[0]).toMatchObject({
      id: '1',
      winner: 'remote',
      reason: 'newer_timestamp',
    });
    expect(result.summary.remoteWins).toBe(1);
  });

  it('resolves conflict with Last-Write-Wins (Local newer)', () => {
    const local = [makeItem(1, '2024-02-01T00:00:00Z', { title: 'LocalTitle' })];
    const remote = [makeItem(1, '2024-01-01T00:00:00Z', { title: 'RemoteTitle' })];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged[0].title).toBe('LocalTitle');
    expect(result.modifiedCount).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.summary.localWins).toBe(1);
  });

  it('does not report conflict if contents are identical', () => {
    const local = [makeItem(1, '2024-01-01T00:00:00Z')];
    const remote = [makeItem(1, '2024-01-01T00:00:00Z')];
    
    const result = SyncConflictService.resolve(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it('handles empty lists', () => {
    expect(SyncConflictService.resolve([], [])).toEqual({
      merged: [],
      modifiedCount: 0,
      conflicts: [],
      summary: SyncConflictService.emptySummary(),
    });
  });

  it('flags conflicts when sensitive fields differ even if title and URL stay the same', () => {
    const local = [makeItem(1, '2024-01-01T00:00:00Z', { password: 'local-secret' })];
    const remote = [makeItem(1, '2024-01-02T00:00:00Z', { password: 'remote-secret' })];

    const result = SyncConflictService.resolve(local, remote);

    expect(result.merged[0].password).toBe('remote-secret');
    expect(result.modifiedCount).toBe(1);
    expect(result.conflicts).toHaveLength(1);
  });

  it('prefers local item when timestamps are equal', () => {
    const local = makeItem(7, '2024-01-05T10:00:00Z', { title: 'Local Equal' });
    const remote = makeItem(7, '2024-01-05T10:00:00Z', { title: 'Remote Equal' });

    expect(SyncConflictService.mergeOne(local, remote).title).toBe('Local Equal');
  });

  it('returns remote from mergeOne when local is missing', () => {
    const remote = makeItem(9, '2024-01-05T10:00:00Z', { title: 'Remote Only' });
    expect(SyncConflictService.mergeOne(undefined, remote)).toBe(remote);
  });

  it('combines conflict summaries for multi-envelope pulls', () => {
    expect(
      SyncConflictService.combineSummaries(
        {
          ...SyncConflictService.emptySummary(),
          conflictCount: 1,
          localWins: 1,
        },
        {
          ...SyncConflictService.emptySummary(),
          conflictCount: 2,
          remoteWins: 2,
          modifiedCount: 2,
        },
      ),
    ).toMatchObject({
      conflictCount: 3,
      localWins: 1,
      remoteWins: 2,
      modifiedCount: 2,
    });
  });
});
