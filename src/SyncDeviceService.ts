/**
 * SyncDeviceService — Aegis Vault Android v4.02
 * Manages device registration, fingerprinting, and trust for synchronization.
 * Ported from desktop SyncDeviceService.ts, adapted for Android/SQLCipher.
 *
 * Cihaz Kayıt Servisi — Senkronizasyon için cihaz kaydı, parmak izi ve güven yönetimi.
 */

import { Platform } from 'react-native';

export interface SyncDeviceFingerprint {
  id: string; // Unique hash or UUID
  label: string; // "Aegis Android-14", "Aegis iOS-18"
  addedAt: string;
  lastSyncAt?: string;
  isCurrent: boolean;
  status: 'active' | 'revoked';
}

const SETTINGS_TABLE = 'aegis_settings_v1';
const DEVICES_KEY = 'aegis_sync_devices_v1';

type DbQueryResult = {
  rows?: Array<Record<string, any>> | { length: number; item: (index: number) => any };
};

function getRows(result: DbQueryResult | null | undefined): Array<Record<string, any>> {
  const rows = result?.rows;
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows.length === 'number' && typeof rows.item === 'function') {
    return Array.from({ length: rows.length }, (_, index) => rows.item(index));
  }
  return [];
}

async function runDbQuery(db: any, sql: string, params?: any[]): Promise<DbQueryResult | undefined> {
  if (typeof db?.executeSync === 'function') {
    return params ? db.executeSync(sql, params) : db.executeSync(sql);
  }
  if (typeof db?.execute === 'function') {
    return params ? await db.execute(sql, params) : await db.execute(sql);
  }
  throw new Error('Database connection does not support execute or executeSync');
}

function leftPad(value: string, length: number, fill = '0'): string {
  if (value.length >= length) return value;
  let prefix = '';
  for (let i = value.length; i < length; i++) {
    prefix += fill;
  }
  return prefix + value;
}

export class SyncDeviceService {
  /**
   * Generates a deterministic device ID for the current local device.
   */
  static getLocalFingerprint(): SyncDeviceFingerprint {
    const platform = Platform.OS;
    const version = Platform.Version || 'unknown';
    const model = (Platform.constants as any)?.Model || 'Android Device';
    
    // Hash of device specific strings
    const hashStr = `${platform}-${version}-${model}`;
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
        hash = (hash * 31 + hashStr.charCodeAt(i)) % 0x7fffffff;
    }
    const id = `dv-${leftPad(Math.abs(hash).toString(16), 8)}`;

    return {
      id,
      label: `Aegis on ${model} (${platform} ${version})`,
      addedAt: new Date().toISOString(),
      isCurrent: true,
      status: 'active',
    };
  }

  /**
   * Retrieves the list of known devices from SQLCipher.
   */
  static async getDevices(db: any): Promise<SyncDeviceFingerprint[]> {
    if (!db) return [this.getLocalFingerprint()];

    try {
      const result = await runDbQuery(
        db,
        `SELECT value FROM ${SETTINGS_TABLE} WHERE key = ?`,
        [DEVICES_KEY]
      );

      const local = this.getLocalFingerprint();
      const rows = getRows(result);
      if (rows.length > 0) {
        const list = JSON.parse(rows[0].value) as SyncDeviceFingerprint[];
        return list.map(d => ({
          ...d,
          isCurrent: d.id === local.id
        }));
      } else {
        return [local];
      }
    } catch (e) {
      console.warn('[SyncDeviceService] Failed to load devices:', e);
      return [this.getLocalFingerprint()];
    }
  }

  /**
   * Persists the device list to SQLCipher.
   */
  static async setDevices(devices: SyncDeviceFingerprint[], db: any): Promise<void> {
    if (!db) return;
    try {
      await runDbQuery(
        db,
        `INSERT OR REPLACE INTO ${SETTINGS_TABLE} (key, value) VALUES (?, ?)`,
        [DEVICES_KEY, JSON.stringify(devices)]
      );
    } catch (e) {
      console.warn('[SyncDeviceService] Failed to save devices:', e);
    }
  }

  /**
   * Adds a new device (e.g. after pairing or syncing).
   */
  static async addDevice(device: SyncDeviceFingerprint, db: any): Promise<void> {
    const devices = await this.getDevices(db);
    if (devices.find(d => d.id === device.id)) return;
    
    devices.push({ ...device, isCurrent: false });
    await this.setDevices(devices, db);
  }

  /**
   * Revokes a device (Trust Revocation).
   */
  static async revokeDevice(deviceId: string, db: any): Promise<boolean> {
    const devices = await this.getDevices(db);
    const updated = devices.map(d => {
      if (d.id === deviceId) {
        return { ...d, status: 'revoked' as const };
      }
      return d;
    });

    await this.setDevices(updated, db);
    return true;
  }

  /**
   * Updates last sync timestamp for a device.
   */
  static async updateLastSync(deviceId: string, db: any): Promise<void> {
    const devices = await this.getDevices(db);
    const updated = devices.map(d => {
        if (d.id === deviceId) {
            return { ...d, lastSyncAt: new Date().toISOString() };
        }
        return d;
    });
    await this.setDevices(updated, db);
  }
}
