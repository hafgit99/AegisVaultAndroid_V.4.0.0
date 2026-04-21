/**
 * VaultManager.test.ts — Aegis Vault Android v4.2.0
 * Hardened mutation-killing tests for multi-vault orchestration.
 */
import { VaultManager } from '../src/VaultManager';
import RNFS from 'react-native-fs';
import { SecureAppSettings } from '../src/SecureAppSettings';

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(false),
  readFile: jest.fn().mockResolvedValue('[]'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/doc',
}));

jest.mock('../src/SecureAppSettings', () => ({
  SecureAppSettings: {
    update: jest.fn().mockResolvedValue(true),
  },
}));

describe('VaultManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── listVaults ──────────────────────────────────────────────

  describe('listVaults', () => {
    it('creates primary vault when config does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      const vaults = await VaultManager.listVaults();

      expect(vaults).toHaveLength(1);
      expect(vaults[0].id).toBe('primary');
      expect(vaults[0].name).toBe('Primary Vault');
      expect(vaults[0].isPrimary).toBe(true);
      expect(vaults[0].type).toBe('personal');
      expect(vaults[0].dbPath).toBe('/doc/vault.db');
      expect(typeof vaults[0].createdAt).toBe('string');
      expect(typeof vaults[0].lastOpenedAt).toBe('string');
      expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
    });

    it('reads existing vaults from config', async () => {
      const existing = [
        { id: 'primary', name: 'Main', isPrimary: true },
        { id: 'v2', name: 'Work', isPrimary: false },
      ];
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(existing));

      const vaults = await VaultManager.listVaults();
      expect(vaults).toHaveLength(2);
      expect(vaults[0].id).toBe('primary');
      expect(vaults[1].id).toBe('v2');
    });

    it('returns empty array on read error', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockRejectedValue(new Error('read err'));
      const vaults = await VaultManager.listVaults();
      expect(vaults).toEqual([]);
    });
  });

  // ── createVault ─────────────────────────────────────────────

  describe('createVault', () => {
    it('creates a new vault with correct metadata', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify([{ id: 'primary' }]));

      const vault = await VaultManager.createVault('Work Vault', 'work');

      expect(vault.name).toBe('Work Vault');
      expect(vault.type).toBe('work');
      expect(vault.isPrimary).toBe(false);
      expect(vault.id).toMatch(/^vault_\d+$/);
      expect(vault.dbPath).toContain(vault.id);
      expect(typeof vault.createdAt).toBe('string');
      expect(typeof vault.lastOpenedAt).toBe('string');
    });

    it('appends to existing vault list and persists', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify([{ id: 'primary' }]));

      await VaultManager.createVault('Private', 'private');

      expect(RNFS.writeFile).toHaveBeenCalled();
      const writtenData = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
      expect(writtenData).toHaveLength(2);
      expect(writtenData[1].name).toBe('Private');
    });

    it('creates vault with correct type variants', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue('[]');

      const shared = await VaultManager.createVault('Team', 'shared');
      expect(shared.type).toBe('shared');

      const personal = await VaultManager.createVault('Me', 'personal');
      expect(personal.type).toBe('personal');
    });
  });

  // ── switchVault ─────────────────────────────────────────────

  describe('switchVault', () => {
    const mockVaults = [
      { id: 'primary', name: 'Main', lastOpenedAt: '2020-01-01' },
      { id: 'v2', name: 'Other', lastOpenedAt: '2020-01-01' },
    ];

    it('switches to existing vault and updates settings', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockVaults));

      const result = await VaultManager.switchVault('v2');

      expect(result).toBe(true);
      expect(SecureAppSettings.update).toHaveBeenCalledWith({ lastVaultId: 'v2' });
      // Should persist updated lastOpenedAt
      expect(RNFS.writeFile).toHaveBeenCalled();
    });

    it('returns false for non-existent vault', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockVaults));

      const result = await VaultManager.switchVault('non-existent');

      expect(result).toBe(false);
      expect(SecureAppSettings.update).not.toHaveBeenCalled();
    });

    it('updates lastOpenedAt on switch', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockVaults));

      await VaultManager.switchVault('v2');

      const writtenData = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
      const switched = writtenData.find((v: any) => v.id === 'v2');
      expect(switched.lastOpenedAt).not.toBe('2020-01-01');
    });

    it('returns false for empty vault list', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue('[]');

      const result = await VaultManager.switchVault('any');
      expect(result).toBe(false);
    });
  });
});
