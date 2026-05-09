import {
  SecureAppSettings,
  type BrowserPairingRecord,
} from './SecureAppSettings';
import QuickCrypto from 'react-native-quick-crypto';

type PairingPlatform = BrowserPairingRecord['platform'];

const PAIRING_TTL_MS = 1000 * 60 * 10;
const STALE_PAIRED_MS = 1000 * 60 * 60 * 24 * 30;
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const V5_BRIDGE_CAPABILITIES = [
  'canonical_vault_v5',
  'encrypted_sync_envelope',
  'autofill_handoff',
  'passkey_handoff',
] as const;

export interface PairingSessionState {
  expiresAt: string;
  expired: boolean;
  stale: boolean;
  capabilities: string[];
}

export interface DesktopV5HandshakePayload {
  kind: 'aegis-desktop-bridge-pairing';
  schemaVersion: '5.0.0';
  pairingId: string;
  pairingCode: string;
  label: string;
  platform: PairingPlatform;
  origin?: string;
  createdAt: string;
  expiresAt: string;
  capabilities: string[];
}

function buildId(): string {
  return `pairing_${Date.now()}_${secureToken(6)}`;
}

function buildPairingCode(): string {
  return `${secureToken(4)}-${secureToken(4)}`;
}

function secureToken(length: number): string {
  const cryptoImpl: any = (QuickCrypto as any)?.default ?? QuickCrypto;
  const bytes = cryptoImpl?.randomBytes?.(length * 2);
  if (!bytes) {
    throw new Error('Secure random source is unavailable for pairing.');
  }

  let token = '';
  for (let i = 0; i < bytes.length && token.length < length; i++) {
    token += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return token;
}

function normalizeLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new Error('Pairing label is required.');
  }
  return normalized.slice(0, 64);
}

function normalizeOrigin(origin?: string): string | undefined {
  const normalized = (origin || '').trim();
  if (!normalized) {
    return undefined;
  }

  if (
    /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(normalized) ||
    /^[a-z0-9.-]+(?::\d+)?$/i.test(normalized)
  ) {
    return normalized.slice(0, 160);
  }

  throw new Error('Pairing origin must be HTTPS or a trusted local host name.');
}

function getExpiresAt(record: BrowserPairingRecord): string {
  return new Date(new Date(record.createdAt).getTime() + PAIRING_TTL_MS).toISOString();
}

function isPendingExpired(record: BrowserPairingRecord): boolean {
  return record.status === 'pending' && Date.now() > new Date(getExpiresAt(record)).getTime();
}

function isPairedStale(record: BrowserPairingRecord): boolean {
  if (record.status !== 'paired') {
    return false;
  }
  const lastSeen = record.lastSeenAt || record.pairedAt;
  if (!lastSeen) {
    return true;
  }
  return Date.now() - new Date(lastSeen).getTime() > STALE_PAIRED_MS;
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
      expiredPending: pairings.filter(isPendingExpired).length,
      stalePaired: pairings.filter(isPairedStale).length,
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
      label: normalizeLabel(input.label),
      platform: input.platform,
      status: 'pending',
      pairingCode: buildPairingCode(),
      origin: normalizeOrigin(input.origin),
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
      if (item.status !== 'pending' || isPendingExpired(item)) {
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

  getSessionState(record: BrowserPairingRecord): PairingSessionState {
    return {
      expiresAt: getExpiresAt(record),
      expired: isPendingExpired(record),
      stale: isPairedStale(record),
      capabilities: [...V5_BRIDGE_CAPABILITIES],
    };
  },

  buildDesktopV5Handshake(record: BrowserPairingRecord): DesktopV5HandshakePayload {
    const state = this.getSessionState(record);
    return {
      kind: 'aegis-desktop-bridge-pairing',
      schemaVersion: '5.0.0',
      pairingId: record.id,
      pairingCode: record.pairingCode,
      label: record.label,
      platform: record.platform,
      origin: record.origin,
      createdAt: record.createdAt,
      expiresAt: state.expiresAt,
      capabilities: state.capabilities,
    };
  },
};
