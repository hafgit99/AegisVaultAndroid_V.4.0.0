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

/**
 * Regex guard for SQL column names — defense-in-depth.
 * Only lowercase letters and underscores are allowed.
 *
 * SQL sütun isimleri için regex koruması — derinlemesine savunma.
 * Yalnızca küçük harf ve alt çizgi karakterlerine izin verilir.
 */
const SAFE_COLUMN_NAME = /^[a-z_]+$/;

/**
 * Validates that a column name is in the allowed set AND passes
 * the safe-character regex. Both checks must pass (defense-in-depth).
 *
 * Sütun adının izin listesinde VE güvenli karakter regex'inde
 * olduğunu doğrular. Her iki kontrol de geçmelidir.
 */
export const isAllowedVaultItemUpdateColumn = (column: string): boolean =>
  SAFE_COLUMN_NAME.test(column) && VAULT_ITEM_UPDATE_COLUMNS.has(column);
