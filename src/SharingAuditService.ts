/**
 * SharingAuditService — Aegis Vault Android v4.02
 * Records security-relevant events for shared spaces and credentials.
 * Ported from desktop SharingAuditService.ts.
 *
 * Paylaşım Denetim Servisi — Paylaşılan alanlar ve kayıtlar için güvenlik olaylarını kaydeder.
 */

import { SecureAppSettings, type SharingAuditEvent } from './SecureAppSettings';

export class SharingAuditService {
  /**
   * Records a sharing-related event.
   */
  static async recordEvent(
    event: Omit<SharingAuditEvent, 'id' | 'at'>,
    db: any
  ): Promise<void> {
    const settings = SecureAppSettings.get();
    const newEvent: SharingAuditEvent = {
      ...event,
      id: Math.random().toString(36).substring(7), // Simple ID for audit log
      at: new Date().toISOString(),
    };

    const newLog = [...settings.sharingAuditLog, newEvent].slice(-100); // Keep last 100 events
    await SecureAppSettings.update({ sharingAuditLog: newLog }, db);
  }

  static getLog(): SharingAuditEvent[] {
    return SecureAppSettings.get().sharingAuditLog;
  }
}
