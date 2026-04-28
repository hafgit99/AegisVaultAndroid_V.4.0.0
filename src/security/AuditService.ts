/**
 * AuditService — Aegis Vault Android
 * Extracted from SecurityModule.ts.
 * Provides security event logging utilities independent of the main SecurityModule.
 *
 * Denetim Servisi — Güvenlik olaylarını loglayan yardımcı fonksiyonlar.
 * SecurityModule'den bağımsız şekilde test edilebilir.
 */

// ── Event severity helpers ────────────────────────────────────────────────────

/**
 * Derives the correct audit status from an event type string.
 * Negative event keywords → 'failed'; positive outcomes → 'success'; informational → 'info'.
 *
 * This prevents the common bug of logging failure events with 'success' status.
 *
 * @param eventType - e.g. 'recovery_initiate_failed', 'vault_unlock', 'kdf_migrated'
 */
export type AuditStatus = 'success' | 'failed' | 'blocked' | 'info';

// Negative lookahead prevents matching 'unlock' as a 'lock' failure.
const FAILED_KEYWORDS =
  /failed|error|expired|invalid|denied|wrong|weak|not_found|rejected|lockout/i;
const BLOCKED_KEYWORDS = /blocked|prevent|refused|refuse/i;
const INFO_KEYWORDS = /warn|degraded|info|notice/i;

export const deriveAuditStatus = (eventType: string): AuditStatus => {
  if (BLOCKED_KEYWORDS.test(eventType)) return 'blocked';
  if (FAILED_KEYWORDS.test(eventType)) return 'failed';
  if (INFO_KEYWORDS.test(eventType)) return 'info';
  return 'success';
};

// ── Log entry shape ───────────────────────────────────────────────────────────

export interface AuditLogEntry {
  event: string;
  status: AuditStatus;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface AuditEventRow {
  id?: number;
  event_type: string;
  event_status: AuditStatus;
  details: string;
  created_at: string;
}

/**
 * Builds a structured audit log entry.
 * Automatically derives status from event type if not explicitly provided.
 */
export const buildAuditEntry = (
  event: string,
  details: Record<string, unknown>,
  overrideStatus?: AuditStatus,
): AuditLogEntry => ({
  event,
  status: overrideStatus ?? deriveAuditStatus(event),
  details,
  timestamp: new Date().toISOString(),
});

// ── Sensitive field masking ───────────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set([
  'password', 'secret', 'key', 'token', 'pin', 'passphrase',
  'unlockSecret', 'rawHash', 'salt',
]);

/**
 * Redacts sensitive fields in audit log details to prevent credential leakage.
 */
export const redactSensitiveFields = (
  details: Record<string, unknown>,
): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    sanitized[k] = SENSITIVE_FIELDS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return sanitized;
};

// ── Audit log entry cap (prevent unbounded growth) ───────────────────────────

export const MAX_AUDIT_LOG_ENTRIES = 500;

export const truncateAuditLog = (entries: AuditLogEntry[]): AuditLogEntry[] => {
  if (entries.length <= MAX_AUDIT_LOG_ENTRIES) return entries;
  return entries.slice(entries.length - MAX_AUDIT_LOG_ENTRIES);
};

export const normalizeAuditLimit = (limit: number): number =>
  Math.max(1, Math.min(MAX_AUDIT_LOG_ENTRIES, limit));

export const buildBufferedAuditEvent = (
  eventType: string,
  eventStatus: AuditStatus,
  details: Record<string, unknown>,
): AuditEventRow => ({
  event_type: eventType,
  event_status: eventStatus,
  details: JSON.stringify(details),
  created_at: new Date().toISOString(),
});

export const redactBufferedAuditEvents = (
  events: AuditEventRow[],
): AuditEventRow[] =>
  events.slice(-200).map(ev => ({
    ...ev,
    details: '{}',
  }));

export const toBufferedAuditRows = (
  events: AuditEventRow[],
): AuditEventRow[] =>
  events.map((ev, index) => ({
    id: -(index + 1),
    event_type: ev.event_type,
    event_status: ev.event_status,
    details: ev.details || '{}',
    created_at: ev.created_at || new Date().toISOString(),
  }));

export const sortAndLimitAuditRows = <T extends { created_at: string }>(
  rows: T[],
  limit: number,
): T[] =>
  rows
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, normalizeAuditLimit(limit));
