import { SyncDeviceService } from '../src/SyncDeviceService';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 15,
    constants: {
      Model: 'Pixel Test',
    },
  },
}));

const createExecuteSyncDb = () => {
  const store: Record<string, string> = {};
  return {
    executeSync: jest.fn((sql: string, params?: any[]) => {
      if (sql.includes('INSERT OR REPLACE')) {
        store[params![0]] = params![1];
        return { rows: [] };
      }
      if (sql.includes('SELECT')) {
        const key = params![0];
        return { rows: store[key] ? [{ value: store[key] }] : [] };
      }
      return { rows: [] };
    }),
    _store: store,
  };
};

describe('SyncDeviceService', () => {
  it('returns the local fingerprint when db is missing', async () => {
    const devices = await SyncDeviceService.getDevices(null);

    expect(devices).toHaveLength(1);
    expect(devices[0].isCurrent).toBe(true);
    expect(devices[0].status).toBe('active');
  });

  it('persists and reloads device state with executeSync databases', async () => {
    const db = createExecuteSyncDb();
    const local = SyncDeviceService.getLocalFingerprint();

    await SyncDeviceService.setDevices([local], db);
    const devices = await SyncDeviceService.getDevices(db);

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe(local.id);
    expect(devices[0].isCurrent).toBe(true);
  });

  it('does not duplicate an already known device', async () => {
    const db = createExecuteSyncDb();
    const local = SyncDeviceService.getLocalFingerprint();

    await SyncDeviceService.setDevices([local], db);
    await SyncDeviceService.addDevice(local, db);
    const devices = await SyncDeviceService.getDevices(db);

    expect(devices).toHaveLength(1);
  });

  it('marks a target device as revoked without altering others', async () => {
    const db = createExecuteSyncDb();
    const local = SyncDeviceService.getLocalFingerprint();
    const peer = {
      ...local,
      id: 'peer-1',
      label: 'Peer Device',
      isCurrent: false,
    };

    await SyncDeviceService.setDevices([local, peer], db);
    const result = await SyncDeviceService.revokeDevice('peer-1', db);
    const devices = await SyncDeviceService.getDevices(db);

    expect(result).toBe(true);
    expect(devices.find(device => device.id === 'peer-1')?.status).toBe('revoked');
    expect(devices.find(device => device.id === local.id)?.status).toBe('active');
  });

  it('updates lastSyncAt only for the selected device', async () => {
    const db = createExecuteSyncDb();
    const local = SyncDeviceService.getLocalFingerprint();
    const peer = {
      ...local,
      id: 'peer-2',
      label: 'Peer Device',
      isCurrent: false,
    };

    await SyncDeviceService.setDevices([local, peer], db);
    await SyncDeviceService.updateLastSync('peer-2', db);
    const devices = await SyncDeviceService.getDevices(db);

    expect(devices.find(device => device.id === 'peer-2')?.lastSyncAt).toEqual(
      expect.any(String),
    );
    expect(devices.find(device => device.id === local.id)?.lastSyncAt).toBeUndefined();
  });
});
