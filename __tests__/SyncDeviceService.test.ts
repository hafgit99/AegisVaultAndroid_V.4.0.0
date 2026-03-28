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
  it('persists and reloads device state with executeSync databases', async () => {
    const db = createExecuteSyncDb();
    const local = SyncDeviceService.getLocalFingerprint();

    await SyncDeviceService.setDevices([local], db);
    const devices = await SyncDeviceService.getDevices(db);

    expect(devices).toHaveLength(1);
    expect(devices[0].id).toBe(local.id);
    expect(devices[0].isCurrent).toBe(true);
  });
});
