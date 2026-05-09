import { BrowserPairingService } from '../src/BrowserPairingService';
import { SecureAppSettings } from '../src/SecureAppSettings';

jest.mock('react-native-quick-crypto', () => require('crypto'));

jest.mock('../src/SecureAppSettings', () => ({
  SecureAppSettings: {
    get: jest.fn(),
    update: jest.fn(),
  },
}));

describe('BrowserPairingService', () => {
  beforeEach(() => {
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      browserPairings: [],
    });
    (SecureAppSettings.update as jest.Mock).mockImplementation(async patch => {
      const current = (SecureAppSettings.get as jest.Mock)();
      (SecureAppSettings.get as jest.Mock).mockReturnValue({
        ...current,
        ...patch,
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a pending pairing with a code', async () => {
    const record = await BrowserPairingService.createPairing({
      label: '  Chrome   Work  ',
      platform: 'browser_extension',
      origin: 'https://app.example.com',
    });

    expect(record.status).toBe('pending');
    expect(record.label).toBe('Chrome Work');
    expect(record.pairingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(BrowserPairingService.list()).toHaveLength(1);
  });

  it('builds a desktop v5 handshake payload without exposing app secrets', async () => {
    const record = await BrowserPairingService.createPairing({
      label: 'Desktop',
      platform: 'desktop_app',
      origin: 'desktop.local',
    });

    const handshake = BrowserPairingService.buildDesktopV5Handshake(record);

    expect(handshake).toMatchObject({
      kind: 'aegis-desktop-bridge-pairing',
      schemaVersion: '5.0.0',
      pairingId: record.id,
      pairingCode: record.pairingCode,
      platform: 'desktop_app',
      origin: 'desktop.local',
    });
    expect(handshake.capabilities).toEqual(
      expect.arrayContaining([
        'canonical_vault_v5',
        'encrypted_sync_envelope',
        'autofill_handoff',
        'passkey_handoff',
      ]),
    );
    expect(JSON.stringify(handshake)).not.toContain('authToken');
  });

  it('marks a pending pairing as paired', async () => {
    await BrowserPairingService.createPairing({
      label: 'Desktop',
      platform: 'desktop_app',
    });
    const created = BrowserPairingService.list()[0];

    const paired = await BrowserPairingService.markPaired(created.id);

    expect(paired?.status).toBe('paired');
    expect(BrowserPairingService.getSummary().paired).toBe(1);
  });

  it('does not pair expired pending codes and reports them in summary', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    await BrowserPairingService.createPairing({
      label: 'Expired Desktop',
      platform: 'desktop_app',
    });
    const created = BrowserPairingService.list()[0];

    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000 + 11 * 60 * 1000);

    const paired = await BrowserPairingService.markPaired(created.id);

    expect(paired).toBeNull();
    expect(BrowserPairingService.getSummary().expiredPending).toBe(1);
  });

  it('revokes an existing pairing', async () => {
    await BrowserPairingService.createPairing({
      label: 'Chrome',
      platform: 'browser_extension',
    });
    const created = BrowserPairingService.list()[0];
    await BrowserPairingService.markPaired(created.id);

    const revoked = await BrowserPairingService.revokePairing(created.id);

    expect(revoked?.status).toBe('revoked');
    expect(BrowserPairingService.getSummary().revoked).toBe(1);
  });

  it('rejects unsafe pairing origins', async () => {
    await expect(
      BrowserPairingService.createPairing({
        label: 'Unsafe',
        platform: 'browser_extension',
        origin: 'http://unsafe.example.com',
      }),
    ).rejects.toThrow('Pairing origin must be HTTPS');
  });
});
