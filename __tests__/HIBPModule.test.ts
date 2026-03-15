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
    expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
  });

  test('returns cached result when available', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8': {
          count: 12,
          checkedAt: new Date().toISOString(),
        },
      }),
    );

    const result = await HIBPModule.checkPassword('password', { enabled: true });

    expect(result.status).toBe('compromised');
    expect(result.cached).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
