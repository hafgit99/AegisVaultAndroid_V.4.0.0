const VAULT_ITEM_UPDATE_COLUMNS = new Set([
  'title',
  'username',
  'password',
  'url',
  'notes',
  'category',
  'favorite',
  'data',
  'is_deleted',
  'deleted_at',
]);

export const isAllowedVaultItemUpdateColumn = (column: string): boolean =>
  VAULT_ITEM_UPDATE_COLUMNS.has(column);
