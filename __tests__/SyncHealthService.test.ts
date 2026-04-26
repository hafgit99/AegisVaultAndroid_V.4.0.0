import { SyncHealthService } from '../src/SyncHealthService';
import type { SecureAppSettingsState } from '../src/SecureAppSettings';

const baseSettings: SecureAppSettingsState = {
  autoLockSeconds: 60,
  biometricEnabled: true,
  clipboardClearSeconds: 20,
  passwordLength: 20,
  excludeAmbiguousCharacters: false,
  darkMode: false,
  themeMode: 'light',
  breachCheckEnabled: false,
  securityCenterReviews: {},
  securityCenterHistory: [],
  passkeyRp: {
    baseUrl: '',
    accountId: '',
    authToken: '',
    tenantHeaderName: '',
    tenantHeaderValue: '',
  },
  validationRecords: [],
  relayUrl: '',
  relayCertificatePin: '',
  syncSessionId: '',
  syncLastSequence: 0,
  syncLastPushTimestamp: undefined,
  syncLastContentHashes: {},
  syncHealth: {
    relayReachable: null,
  },
  sharedSpaces: [],
  sharingAuditLog: [],
  browserPairings: [],
  deviceTrustPolicy: 'moderate',
  rootDetectionEnabled: true,
  rootBlocksVault: false,
  degradedDeviceAction: 'warn',
  lastVaultId: undefined,
};

describe('SyncHealthService', () => {
  it('returns low confidence when relay is not configured', () => {
    const summary = SyncHealthService.buildSummary(baseSettings);
    expect(summary.confidence).toBe('low');
    expect(summary.configured).toBe(false);
    expect(summary.relayPending).toBe(true);
  });

  it('returns medium confidence when relay is healthy but sync is not yet validated', () => {
    const summary = SyncHealthService.buildSummary({
      ...baseSettings,
      relayUrl: 'https://relay.example.com',
      relayCertificatePin: 'sha256/test',
      syncSessionId: 'session-1',
      syncHealth: {
        relayReachable: true,
        relayCheckedAt: '2026-04-16T10:00:00.000Z',
      },
    });
    expect(summary.confidence).toBe('medium');
    expect(summary.relayHealthy).toBe(true);
    expect(summary.syncValidated).toBe(false);
  });

  it('returns high confidence when relay, pin, and sync validation are present', () => {
    const summary = SyncHealthService.buildSummary({
      ...baseSettings,
      relayUrl: 'https://relay.example.com',
      relayCertificatePin: 'sha256/test',
      syncSessionId: 'session-1',
      syncLastSequence: 4,
      syncLastPushTimestamp: '2026-04-16T11:00:00.000Z',
      syncHealth: {
        relayReachable: true,
        relayCheckedAt: '2026-04-16T10:00:00.000Z',
        lastSyncSuccessAt: '2026-04-16T11:00:00.000Z',
      },
    });
    expect(summary.confidence).toBe('high');
    expect(summary.lastSuccessAt).toBe('2026-04-16T11:00:00.000Z');
  });
});
