/**
 * security/AuditService.test.ts
 * Unit tests for AuditService — status derivation, field masking, log truncation.
 */

import {
  deriveAuditStatus,
  buildAuditEntry,
  redactSensitiveFields,
  truncateAuditLog,
  MAX_AUDIT_LOG_ENTRIES,
  type AuditLogEntry,
} from '../../src/security/AuditService';

describe('AuditService — deriveAuditStatus', () => {
  it('returns "success" for neutral event types', () => {
    expect(deriveAuditStatus('vault_unlock')).toBe('success');
    expect(deriveAuditStatus('item_added')).toBe('success');
    expect(deriveAuditStatus('kdf_migrated')).toBe('success');
    expect(deriveAuditStatus('backup_export')).toBe('success');
  });

  it('returns "failed" for event types containing failure keywords', () => {
    expect(deriveAuditStatus('vault_unlock_failed')).toBe('failed');
    expect(deriveAuditStatus('recovery_initiate_failed')).toBe('failed');
    expect(deriveAuditStatus('backup_import_error')).toBe('failed');
    expect(deriveAuditStatus('session_expired')).toBe('failed');
    expect(deriveAuditStatus('invalid_token')).toBe('failed');
    expect(deriveAuditStatus('session_not_found')).toBe('failed');
    expect(deriveAuditStatus('wrong_password')).toBe('failed'); // 'wrong' keyword
  });

  it('returns "blocked" for blocking event types', () => {
    expect(deriveAuditStatus('vault_unlock_blocked')).toBe('blocked');
    expect(deriveAuditStatus('sync_refused')).toBe('blocked');
  });

  it('returns "info" for warning/degraded events', () => {
    expect(deriveAuditStatus('device_integrity_degraded')).toBe('info');
    expect(deriveAuditStatus('integrity_warn')).toBe('info');
  });

  it('is case-insensitive', () => {
    expect(deriveAuditStatus('VAULT_UNLOCK_FAILED')).toBe('failed');
    expect(deriveAuditStatus('Recovery_Error')).toBe('failed');
  });

  it('blocked takes precedence over failed', () => {
    expect(deriveAuditStatus('access_blocked_failed')).toBe('blocked');
  });
});

describe('AuditService — buildAuditEntry', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });
  afterAll(() => { jest.useRealTimers(); });

  it('auto-derives status from event type', () => {
    const entry = buildAuditEntry('vault_unlock', { id: 1 });
    expect(entry.status).toBe('success');
    expect(entry.event).toBe('vault_unlock');
    expect(entry.timestamp).toBe('2026-01-01T12:00:00.000Z');
  });

  it('uses overrideStatus when provided', () => {
    const entry = buildAuditEntry('vault_unlock', {}, 'info');
    expect(entry.status).toBe('info');
  });

  it('auto-derives "failed" for failure events', () => {
    const entry = buildAuditEntry('recovery_initiate_failed', { reason: 'invalid_email' });
    expect(entry.status).toBe('failed');
    expect(entry.details).toEqual({ reason: 'invalid_email' });
  });

  it('includes all required fields', () => {
    const entry = buildAuditEntry('item_updated', { id: 5 });
    expect(entry).toHaveProperty('event');
    expect(entry).toHaveProperty('status');
    expect(entry).toHaveProperty('details');
    expect(entry).toHaveProperty('timestamp');
  });
});

describe('AuditService — redactSensitiveFields', () => {
  it('redacts known sensitive keys', () => {
    const result = redactSensitiveFields({
      password: 'SuperSecret123!',
      secret: 'totp_secret_abc',
      key: 'aabbccdd',
      token: 'bearer_xyz',
      pin: '1234',
    });
    expect(result.password).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.key).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.pin).toBe('[REDACTED]');
  });

  it('passes through safe fields unchanged', () => {
    const result = redactSensitiveFields({
      id: 42,
      title: 'My Account',
      email: 'user@example.com',
      count: 5,
    });
    expect(result.id).toBe(42);
    expect(result.title).toBe('My Account');
    expect(result.email).toBe('user@example.com');
    expect(result.count).toBe(5);
  });

  it('handles empty details', () => {
    expect(redactSensitiveFields({})).toEqual({});
  });

  it('handles mixed safe and sensitive fields', () => {
    const result = redactSensitiveFields({ username: 'alice', password: 'secret' });
    expect(result.username).toBe('alice');
    expect(result.password).toBe('[REDACTED]');
  });
});

describe('AuditService — truncateAuditLog', () => {
  const makeEntries = (n: number): AuditLogEntry[] =>
    Array.from({ length: n }, (_, i) => ({
      event: `event_${i}`,
      status: 'success' as const,
      details: {},
      timestamp: new Date(i * 1000).toISOString(),
    }));

  it('returns log unchanged when under the limit', () => {
    const entries = makeEntries(10);
    expect(truncateAuditLog(entries)).toHaveLength(10);
    expect(truncateAuditLog(entries)).toBe(entries); // same reference
  });

  it('truncates to MAX_AUDIT_LOG_ENTRIES when over limit', () => {
    const entries = makeEntries(MAX_AUDIT_LOG_ENTRIES + 50);
    const result = truncateAuditLog(entries);
    expect(result).toHaveLength(MAX_AUDIT_LOG_ENTRIES);
  });

  it('keeps the MOST RECENT entries when truncating', () => {
    const entries = makeEntries(MAX_AUDIT_LOG_ENTRIES + 100);
    const result = truncateAuditLog(entries);
    // Last entry should be preserved
    expect(result[result.length - 1].event).toBe(
      entries[entries.length - 1].event,
    );
    // First entry should be the (100+1)th original entry
    expect(result[0].event).toBe(entries[100].event);
  });

  it('handles empty log', () => {
    expect(truncateAuditLog([])).toEqual([]);
  });

  it('handles exactly MAX_AUDIT_LOG_ENTRIES entries', () => {
    const entries = makeEntries(MAX_AUDIT_LOG_ENTRIES);
    expect(truncateAuditLog(entries)).toHaveLength(MAX_AUDIT_LOG_ENTRIES);
  });
});
