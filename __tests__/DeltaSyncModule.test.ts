import { DeltaSyncModule } from '../src/DeltaSyncModule';
import { VaultItem } from '../src/SecurityModule';

describe('DeltaSyncModule Tests', () => {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

  const mockItems: VaultItem[] = [
    {
      id: 1,
      title: 'Item 1',
      updated_at: iso(-2 * 60 * 60 * 1000),
      created_at: iso(-2 * 60 * 60 * 1000),
      data: '{}',
    } as VaultItem,
    {
      id: 2,
      title: 'Item 2',
      updated_at: iso(-30 * 60 * 1000),
      created_at: iso(-30 * 60 * 1000),
      data: '{}',
    } as VaultItem,
  ];

  test('Yalnızca belirtilen tarihten sonra güncellenen kayıtları filtrelemeli', () => {
    const lastSync = iso(-60 * 60 * 1000);
    const previousHashes = DeltaSyncModule.buildContentHashMap(mockItems);
    const delta = DeltaSyncModule.getChangesToPush(
      mockItems as any,
      lastSync,
      previousHashes,
    );

    expect(delta.length).toBe(1);
    expect(delta[0].id).toBe(2);
  });

  test('Tarih belirtilmezse tüm kayıtları dönmeli (Full Sync)', () => {
    const delta = DeltaSyncModule.getChangesToPush(mockItems as any, null);
    expect(delta.length).toBe(2);
  });

  test('Kayıtlar değişmemişse boş liste dönmeli', () => {
    const stableItems: VaultItem[] = [
      {
        id: 1,
        title: 'Stable 1',
        updated_at: iso(-3 * 60 * 60 * 1000),
        created_at: iso(-3 * 60 * 60 * 1000),
        data: '{}',
      } as unknown as VaultItem,
      {
        id: 2,
        title: 'Stable 2',
        updated_at: iso(-2 * 60 * 60 * 1000),
        created_at: iso(-2 * 60 * 60 * 1000),
        data: '{}',
      } as unknown as VaultItem,
    ];
    const lastSync = iso(-60 * 60 * 1000);
    const previousHashes = DeltaSyncModule.buildContentHashMap(stableItems);
    const delta = DeltaSyncModule.getChangesToPush(
      stableItems as any,
      lastSync,
      previousHashes,
    );
    expect(delta.length).toBe(0);
  });

  test('Gelecekteki son senkron zamanı varsa güvenli fallback ile full senkron yapmalı', () => {
    const futureSync = iso(24 * 60 * 60 * 1000);
    const delta = DeltaSyncModule.getChangesToPush(mockItems as any, futureSync);
    expect(delta.length).toBe(mockItems.length);
  });

  test('İçerik hash değiştiyse tarih aynı olsa bile kaydı delta listesine almalı', () => {
    const previousHashes = DeltaSyncModule.buildContentHashMap(mockItems);
    const changedItems = mockItems.map(item =>
      item.id === 1 ? ({ ...item, notes: 'updated-notes' } as VaultItem) : item,
    );
    const lastSync = iso(-5 * 60 * 1000);
    const delta = DeltaSyncModule.getChangesToPush(
      changedItems as any,
      lastSync,
      previousHashes,
    );
    expect(delta.some(item => item.id === 1)).toBe(true);
  });

  test('buildContentHashMap eksik kimlikleri atlamalı ve varsayılan alanları normalize etmeli', () => {
    const hashMap = DeltaSyncModule.buildContentHashMap([
      {
        id: 10,
        title: 'Normalized',
      } as VaultItem,
      {
        title: 'No Id',
      } as VaultItem,
    ]);

    expect(Object.keys(hashMap)).toEqual(['10']);
    expect(hashMap['10']).toContain('"username":""');
    expect(hashMap['10']).toContain('"data":"{}"');
    expect(hashMap['10']).toContain('"is_deleted":0');
  });

  test('buildContentHashMap null ve falsy alanlari deterministic fallback ile normalize etmeli', () => {
    const hashMap = DeltaSyncModule.buildContentHashMap([
      {
        id: 11,
        title: '',
        username: undefined,
        password: undefined,
        url: undefined,
        notes: '',
        category: undefined,
        favorite: 0,
        data: '',
        is_deleted: 0,
        deleted_at: null,
      } as unknown as VaultItem,
      null as unknown as VaultItem,
      {
        id: '11',
        title: 'invalid id type',
      } as unknown as VaultItem,
    ]);

    expect(Object.keys(hashMap)).toEqual(['11']);
    expect(hashMap['11']).toBe(
      JSON.stringify({
        title: '',
        username: '',
        password: '',
        url: '',
        notes: '',
        category: '',
        favorite: 0,
        data: '{}',
        is_deleted: 0,
        deleted_at: null,
      }),
    );
  });

  test('Silinme durumu değiştiyse zaman damgası eski olsa bile kaydı delta listesine almalı', () => {
    const stableItem = {
      id: 5,
      title: 'Deleted Candidate',
      updated_at: iso(-3 * 60 * 60 * 1000),
      created_at: iso(-3 * 60 * 60 * 1000),
      data: '{}',
      is_deleted: 0,
    } as VaultItem;
    const previousHashes = DeltaSyncModule.buildContentHashMap([stableItem]);
    const deletedVariant = [{ ...stableItem, is_deleted: 1 }] as VaultItem[];

    const delta = DeltaSyncModule.getChangesToPush(
      deletedVariant,
      iso(-60 * 60 * 1000),
      previousHashes,
    );

    expect(delta).toHaveLength(1);
    expect(delta[0].is_deleted).toBe(1);
  });

  test('Geçersiz son senkron zamanı varsa güvenli fallback ile full senkron yapmalı', () => {
    const delta = DeltaSyncModule.getChangesToPush(mockItems as any, 'not-a-date');
    expect(delta.length).toBe(mockItems.length);
  });

  test('kesim zamanina esit updated_at veya created_at degismis sayilmamali', () => {
    const lastSync = iso(-60 * 60 * 1000);
    const boundaryItems: VaultItem[] = [
      {
        id: 31,
        title: 'Boundary Updated',
        updated_at: lastSync,
        created_at: iso(-2 * 60 * 60 * 1000),
        data: '{}',
      } as VaultItem,
      {
        id: 32,
        title: 'Boundary Created',
        updated_at: iso(-2 * 60 * 60 * 1000),
        created_at: lastSync,
        data: '{}',
      } as VaultItem,
    ];

    const previousHashes = DeltaSyncModule.buildContentHashMap(boundaryItems);
    const delta = DeltaSyncModule.getChangesToPush(boundaryItems, lastSync, previousHashes);

    expect(delta).toEqual([]);
  });

  test('id olmayan eski kayitlari onceki hash karsilastirmasi yapilamadigi icin delta olarak tutmali', () => {
    const anonymousItems: VaultItem[] = [
      {
        title: 'Anonymous',
        updated_at: iso(-4 * 60 * 60 * 1000),
        created_at: iso(-4 * 60 * 60 * 1000),
        data: '{}',
      } as VaultItem,
    ];

    const delta = DeltaSyncModule.getChangesToPush(
      anonymousItems,
      iso(-60 * 60 * 1000),
      {},
    );

    expect(delta).toHaveLength(1);
    expect(delta[0].title).toBe('Anonymous');
  });

  test('hasLocalChanges yalnızca gerçek değişiklik olduğunda true dönmeli', () => {
    const previousHashes = DeltaSyncModule.buildContentHashMap(mockItems);

    expect(
      DeltaSyncModule.hasLocalChanges(
        mockItems as any,
        iso(-60 * 60 * 1000),
        previousHashes,
      ),
    ).toBe(true);

    const unchangedItems: VaultItem[] = mockItems.map(item => ({
      ...item,
      updated_at: iso(-3 * 60 * 60 * 1000),
      created_at: iso(-3 * 60 * 60 * 1000),
    })) as VaultItem[];
    const unchangedHashes = DeltaSyncModule.buildContentHashMap(unchangedItems);

    expect(
      DeltaSyncModule.hasLocalChanges(
        unchangedItems,
        iso(-60 * 60 * 1000),
        unchangedHashes,
      ),
    ).toBe(false);
  });

  test('hasLocalChanges lastPushedAt olmadiginda full sync nedeniyle true donmeli', () => {
    expect(DeltaSyncModule.hasLocalChanges(mockItems, null)).toBe(true);
  });
});
