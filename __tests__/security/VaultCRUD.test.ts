/**
 * security/VaultCRUD.test.ts
 * Unit tests for VaultCRUD — SQL column whitelist enforcement.
 */

import { isAllowedVaultItemUpdateColumn } from '../../src/security/VaultCRUD';

describe('VaultCRUD — isAllowedVaultItemUpdateColumn', () => {
  const ALLOWED = [
    'title', 'username', 'password', 'url', 'notes',
    'category', 'favorite', 'data', 'is_deleted', 'deleted_at',
  ];

  it('allows all legitimate vault item columns', () => {
    for (const col of ALLOWED) {
      expect(isAllowedVaultItemUpdateColumn(col)).toBe(true);
    }
  });

  it('blocks SQL injection attempt columns', () => {
    const injections = [
      'title; DROP TABLE vault_items; --',
      "title' OR '1'='1",
      '1=1',
      'id',            // Protected PK — must not be updatable
      'created_at',    // Protected timestamp — immutable
      '; DROP TABLE vault_items --',
      'updated_at',    // Managed by trigger, not user input
    ];
    for (const col of injections) {
      expect(isAllowedVaultItemUpdateColumn(col)).toBe(false);
    }
  });

  it('blocks empty string', () => {
    expect(isAllowedVaultItemUpdateColumn('')).toBe(false);
  });

  it('blocks columns with whitespace around name', () => {
    expect(isAllowedVaultItemUpdateColumn(' title ')).toBe(false);
    expect(isAllowedVaultItemUpdateColumn('title ')).toBe(false);
  });

  it('blocks uppercase column names (case-sensitive)', () => {
    expect(isAllowedVaultItemUpdateColumn('Title')).toBe(false);
    expect(isAllowedVaultItemUpdateColumn('PASSWORD')).toBe(false);
    expect(isAllowedVaultItemUpdateColumn('USERNAME')).toBe(false);
  });

  it('blocks unknown column names', () => {
    const unknowns = ['admin', 'role', 'hash', 'iv', 'salt', 'sync_id', '__proto__', 'constructor'];
    for (const col of unknowns) {
      expect(isAllowedVaultItemUpdateColumn(col)).toBe(false);
    }
  });

  it('returns boolean type for all inputs', () => {
    expect(typeof isAllowedVaultItemUpdateColumn('title')).toBe('boolean');
    expect(typeof isAllowedVaultItemUpdateColumn('malicious')).toBe('boolean');
  });
});
