import RNFS from 'react-native-fs';
import { HIBPModule } from '../src/HIBPModule';

describe('HIBPModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.readFile as jest.Mock).mockResolvedValue('');
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
    global.fetch = jest.fn();
  });

  test('returns disabled when feature is not enabled', async () => {
    const result = await HIBPModule.checkPassword('secret', { enabled: false });

    expect(result.status).toBe('disabled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('queries only hash prefix and caches result', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () =>
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:12\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1',
    });

    const result = await HIBPModule.checkPassword('password', { enabled: true });

    expect(result.status).toBe('compromised');
    expect(result.count).toBe(12);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/range/5BAA6');
    expect(RNFS.writeFile).toHaveBeenCalledTimes(2);
    const cacheWrite = (RNFS.writeFile as jest.Mock).mock.calls.find(([path]) =>
      String(path).includes('aegis_breach_cache.json'),
    );
    expect(cacheWrite).toBeDefined();
    const [, payload] = cacheWrite!;
    expect(payload).not.toContain('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  test('returns cached result when available', async () => {
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      path.includes('aegis_breach_cache.json'),
    );
    const legacyCache = JSON.stringify({
      '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8': {
        count: 12,
        checkedAt: new Date().toISOString(),
      },
    });
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      legacyCache,
    );

    const result = await HIBPModule.checkPassword('password', { enabled: true });

    expect(result.status).toBe('compromised');
    expect(result.cached).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    const cacheWrite = (RNFS.writeFile as jest.Mock).mock.calls.find(([path]) =>
      String(path).includes('aegis_breach_cache.json'),
    );
    expect(cacheWrite).toBeDefined();
    const [, migratedPayload] = cacheWrite!;
    expect(migratedPayload).not.toContain('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  test('returns safe immediately for empty passwords even when enabled', async () => {
    const result = await HIBPModule.checkPassword('', { enabled: true });

    expect(result).toEqual({
      status: 'safe',
      count: 0,
      checkedAt: null,
      cached: false,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns unavailable when API responds with non-2xx status', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    });

    const result = await HIBPModule.checkPassword('password', { enabled: true });

    expect(result.status).toBe('unavailable');
    expect(result.cached).toBe(false);
  });

  test('forceRefresh bypasses valid cache and performs a fresh range query', async () => {
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      path.includes('aegis_breach_cache.json'),
    );
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8': {
          count: 12,
          checkedAt: new Date().toISOString(),
        },
      }),
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => '',
    });

    const result = await HIBPModule.checkPassword('password', {
      enabled: true,
      forceRefresh: true,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.cached).toBe(false);
    expect(result.status).toBe('safe');
  });

  test('falls back to stale cache miss as unavailable when network throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const result = await HIBPModule.checkPassword('password', { enabled: true });

    expect(result).toEqual({
      status: 'unavailable',
      count: 0,
      checkedAt: null,
      cached: false,
    });
  });

  test('clearCache removes both cache and device secret files when present', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);

    const result = await HIBPModule.clearCache();

    expect(result).toBe(true);
    expect(RNFS.unlink).toHaveBeenCalledTimes(2);
  });
});
