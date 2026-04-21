import { BrowserPairingService } from '../src/BrowserPairingService';
import { SecureAppSettings } from '../src/SecureAppSettings';

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

  it('creates a pending pairing with a code', async () => {
    const record = await BrowserPairingService.createPairing({
      label: 'Chrome',
      platform: 'browser_extension',
      origin: 'https://app.example.com',
    });

    expect(record.status).toBe('pending');
    expect(record.pairingCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(BrowserPairingService.list()).toHaveLength(1);
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
});
