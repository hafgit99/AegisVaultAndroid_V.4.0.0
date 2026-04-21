/**
 * VaultManager — Professional Multi-Vault Orchestration
 * 
 * Çoklu Kasa Yönetimi — Birden fazla kasa dosyası (Kişisel, İş, Özel vb.)
 * oluşturma, silme ve anahtarlama işlemlerini yönetir.
 */

import RNFS from 'react-native-fs';
// SecurityModule import removed as it was unused in this scope
import { SecureAppSettings } from './SecureAppSettings';

export interface VaultMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  lastOpenedAt: string;
  dbPath: string;
  isPrimary: boolean;
  type: 'personal' | 'work' | 'private' | 'shared';
}

export class VaultManager {
  private static readonly VAULTS_CONFIG_FILE = `${RNFS.DocumentDirectoryPath}/vaults_config.json`;

  /**
   * Get list of all available vaults
   */
  static async listVaults(): Promise<VaultMetadata[]> {
    try {
      const exists = await RNFS.exists(this.VAULTS_CONFIG_FILE);
      if (!exists) {
        // Create primary vault metadata if it doesn't exist
        const primary: VaultMetadata = {
          id: 'primary',
          name: 'Primary Vault',
          createdAt: new Date().toISOString(),
          lastOpenedAt: new Date().toISOString(),
          dbPath: `${RNFS.DocumentDirectoryPath}/vault.db`,
          isPrimary: true,
          type: 'personal',
        };
        await this.saveVaults([primary]);
        return [primary];
      }
      const content = await RNFS.readFile(this.VAULTS_CONFIG_FILE, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error('[VaultManager] listVaults error:', e);
      return [];
    }
  }

  /**
   * Create a new vault
   */
  static async createVault(name: string, type: VaultMetadata['type']): Promise<VaultMetadata> {
    const id = `vault_${Date.now()}`;
    const newVault: VaultMetadata = {
      id,
      name,
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      dbPath: `${RNFS.DocumentDirectoryPath}/${id}.db`,
      isPrimary: false,
      type,
    };

    const vaults = await this.listVaults();
    vaults.push(newVault);
    await this.saveVaults(vaults);
    return newVault;
  }

  /**
   * Switch to another vault
   * Note: This usually requires re-authentication with that vault's password
   */
  static async switchVault(vaultId: string): Promise<boolean> {
    const vaults = await this.listVaults();
    const vault = vaults.find(v => v.id === vaultId);
    if (!vault) return false;

    // Update app settings for the target vault path
    // In a real app, you'd close the current SQLite connection and open the new one
    await SecureAppSettings.update({ lastVaultId: vaultId });
    
    // Update last opened
    vault.lastOpenedAt = new Date().toISOString();
    await this.saveVaults(vaults);
    
    return true;
  }

  private static async saveVaults(vaults: VaultMetadata[]): Promise<void> {
    await RNFS.writeFile(this.VAULTS_CONFIG_FILE, JSON.stringify(vaults), 'utf8');
  }
}
