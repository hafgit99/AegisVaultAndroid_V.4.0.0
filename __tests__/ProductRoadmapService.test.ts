import { ProductRoadmapService } from '../src/ProductRoadmapService';
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

describe('ProductRoadmapService', () => {
  it('prioritizes the least mature initiatives first', () => {
    const summary = ProductRoadmapService.buildSummary({
      entries: [],
      settings: baseSettings,
      autofillSupported: false,
    });

    expect(summary.overallProgress).toBeGreaterThanOrEqual(0);
    expect(summary.focusInitiatives).toEqual(['passkey', 'sync']);
    expect(summary.initiatives.find(x => x.id === 'passkey')?.status).toBe(
      'planned',
    );
    expect(summary.initiatives.find(x => x.id === 'sync')?.nextStepKey).toBe(
      'roadmap_center.initiatives.sync.next_configure_relay',
    );
    expect(summary.initiatives.find(x => x.id === 'sync')?.ctaTarget).toBe(
      'validation_workspace',
    );
  });

  it('recognizes mature foundations across passkey, sync, sharing, and pairing', () => {
    const summary = ProductRoadmapService.buildSummary({
      entries: [
        {
          id: 1,
          title: 'Example Login',
          category: 'login',
          username: 'harun@example.com',
          url: 'https://example.com',
          data: JSON.stringify({
            totp_secret: 'ABC',
            shared_space_id: 'space-1',
            shared_reviewed: true,
          }),
          is_deleted: 0,
        },
        {
          id: 2,
          title: 'Example Passkey',
          category: 'passkey',
          url: 'https://example.com',
          data: JSON.stringify({
            rp_id: 'example.com',
            mode: 'rp_connected',
            server_verified: true,
          }),
          is_deleted: 0,
        },
      ] as any,
      settings: {
        ...baseSettings,
        breachCheckEnabled: true,
        passkeyRp: {
          baseUrl: 'https://rp.example.com',
          accountId: 'acct_1',
          authToken: 'token',
          tenantHeaderName: '',
          tenantHeaderValue: '',
        },
        relayUrl: 'https://relay.example.com',
        relayCertificatePin: 'sha256/abc123',
        syncSessionId: 'session-1',
        syncLastSequence: 4,
        sharedSpaces: [
          {
            id: 'space-1',
            name: 'Family',
            kind: 'family',
            created_at: '2026-04-16T00:00:00.000Z',
            updated_at: '2026-04-16T00:00:00.000Z',
            members: [
              {
                id: 'm1',
                name: 'Owner',
                role: 'owner',
                status: 'active',
              },
              {
                id: 'm2',
                name: 'Pending',
                role: 'viewer',
                status: 'pending',
              },
            ],
          },
        ],
        browserPairings: [
          {
            id: 'pair-1',
            label: 'Chrome',
            platform: 'browser_extension',
            status: 'paired',
            pairingCode: 'ABCD-EFGH',
            createdAt: '2026-04-16T00:00:00.000Z',
            pairedAt: '2026-04-16T00:10:00.000Z',
          },
        ],
      },
      autofillSupported: true,
    });

    expect(summary.overallProgress).toBeGreaterThan(70);
    expect(summary.initiatives.find(x => x.id === 'passkey')?.status).toBe(
      'ready',
    );
    expect(summary.initiatives.find(x => x.id === 'sync')?.status).toBe(
      'ready',
    );
    expect(summary.initiatives.find(x => x.id === 'sharing')?.status).toBe(
      'ready',
    );
    expect(summary.initiatives.find(x => x.id === 'pairing')?.status).toBe(
      'ready',
    );
  });
});
