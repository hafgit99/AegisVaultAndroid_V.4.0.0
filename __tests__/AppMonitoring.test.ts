import RNFS from 'react-native-fs';
import { AppMonitoring } from '../src/AppMonitoring';

describe('AppMonitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.readFile as jest.Mock).mockResolvedValue('');
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  });

  test('recordCrash persists a crash report', async () => {
    await AppMonitoring.recordCrash(
      new Error('boom'),
      true,
      'unit-test',
      { screen: 'settings' },
    );

    expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
    const [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    const reports = JSON.parse(payload);

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe('unit-test');
    expect(reports[0].message).toBe('boom');
    expect(reports[0].isFatal).toBe(true);
    expect(reports[0].context.screen).toBe('settings');
  });

  test('getCrashReports returns stored reports', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify([
        {
          id: '1',
          source: 'console.error',
          name: 'Error',
          message: 'failed',
          isFatal: false,
          createdAt: '2026-03-15T00:00:00.000Z',
        },
      ]),
    );

    const reports = await AppMonitoring.getCrashReports();

    expect(reports).toHaveLength(1);
    expect(reports[0].message).toBe('failed');
  });

  test('clearCrashReports removes persisted file when present', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);

    const result = await AppMonitoring.clearCrashReports();

    expect(result).toBe(true);
    expect(RNFS.unlink).toHaveBeenCalledTimes(1);
  });
});
