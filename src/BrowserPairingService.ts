import {
  SecureAppSettings,
  type BrowserPairingRecord,
} from './SecureAppSettings';

type PairingPlatform = BrowserPairingRecord['platform'];

function buildId(): string {
  return `pairing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildPairingCode(): string {
  return (
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

export const BrowserPairingService = {
  list(): BrowserPairingRecord[] {
    return [...SecureAppSettings.get().browserPairings].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  getSummary() {
    const pairings = this.list();
    return {
      total: pairings.length,
      paired: pairings.filter(item => item.status === 'paired').length,
      pending: pairings.filter(item => item.status === 'pending').length,
      revoked: pairings.filter(item => item.status === 'revoked').length,
      browserExtension: pairings.filter(
        item => item.platform === 'browser_extension' && item.status === 'paired',
      ).length,
      desktopApp: pairings.filter(
        item => item.platform === 'desktop_app' && item.status === 'paired',
      ).length,
    };
  },

  async createPairing(input: {
    label: string;
    platform: PairingPlatform;
    origin?: string;
  }, db?: any): Promise<BrowserPairingRecord> {
    const now = new Date().toISOString();
    const record: BrowserPairingRecord = {
      id: buildId(),
      label: input.label.trim(),
      platform: input.platform,
      status: 'pending',
      pairingCode: buildPairingCode(),
      origin: (input.origin || '').trim() || undefined,
      createdAt: now,
    };

    await SecureAppSettings.update(
      { browserPairings: [record, ...SecureAppSettings.get().browserPairings] },
      db,
    );
    return record;
  },

  async markPaired(id: string, db?: any): Promise<BrowserPairingRecord | null> {
    const current = SecureAppSettings.get().browserPairings;
    let updated: BrowserPairingRecord | null = null;
    const next = current.map(item => {
      if (item.id !== id) {
        return item;
      }
      updated = {
        ...item,
        status: 'paired',
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      return updated;
    });
    if (!updated) {
      return null;
    }
    await SecureAppSettings.update({ browserPairings: next }, db);
    return updated;
  },

  async touchPairing(id: string, db?: any): Promise<void> {
    const next = SecureAppSettings.get().browserPairings.map(item =>
      item.id === id
        ? { ...item, lastSeenAt: new Date().toISOString() }
        : item,
    );
    await SecureAppSettings.update({ browserPairings: next }, db);
  },

  async revokePairing(id: string, db?: any): Promise<BrowserPairingRecord | null> {
    const current = SecureAppSettings.get().browserPairings;
    let updated: BrowserPairingRecord | null = null;
    const next = current.map(item => {
      if (item.id !== id) {
        return item;
      }
      updated = {
        ...item,
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      };
      return updated;
    });
    if (!updated) {
      return null;
    }
    await SecureAppSettings.update({ browserPairings: next }, db);
    return updated;
  },
};
