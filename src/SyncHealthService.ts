import type { SecureAppSettingsState, SyncHealthSnapshot } from './SecureAppSettings';

export interface SyncHealthSummary {
  configured: boolean;
  certificatePinned: boolean;
  relayHealthy: boolean;
  relayPending: boolean;
  syncValidated: boolean;
  confidence: 'low' | 'medium' | 'high';
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

function toBool(value?: string): boolean {
  return Boolean(value && value.trim());
}

export const SyncHealthService = {
  buildSummary(settings: SecureAppSettingsState): SyncHealthSummary {
    const snapshot: SyncHealthSnapshot = settings.syncHealth || {
      relayReachable: null,
    };
    const configured =
      toBool(settings.relayUrl) && toBool(settings.syncSessionId);
    const certificatePinned = toBool(settings.relayCertificatePin);
    const relayHealthy = snapshot.relayReachable === true;
    const relayPending = snapshot.relayReachable === null;
    const syncValidated = Boolean(
      settings.syncLastSequence > 0 || settings.syncLastPushTimestamp,
    );

    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (configured && certificatePinned && relayHealthy) {
      confidence = syncValidated ? 'high' : 'medium';
    }

    return {
      configured,
      certificatePinned,
      relayHealthy,
      relayPending,
      syncValidated,
      confidence,
      lastCheckAt: snapshot.relayCheckedAt || null,
      lastSuccessAt:
        snapshot.lastSyncSuccessAt || settings.syncLastPushTimestamp || null,
      lastError: snapshot.lastSyncError || null,
    };
  },
};
