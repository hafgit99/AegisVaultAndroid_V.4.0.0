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

  test('recordHandledError stores non-fatal reports through the same pipeline', async () => {
    await AppMonitoring.recordHandledError('api', 'request failed', {
      route: 'settings',
    });

    const [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    const reports = JSON.parse(payload);
    expect(reports[0].source).toBe('api');
    expect(reports[0].isFatal).toBe(false);
    expect(reports[0].context.route).toBe('settings');
  });

  test('getCrashReports enforces min/max bounds on result limit', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify(
        Array.from({ length: 3 }, (_, index) => ({
          id: `${index + 1}`,
          source: 'console.error',
          name: 'Error',
          message: `failed-${index + 1}`,
          isFatal: false,
          createdAt: '2026-03-15T00:00:00.000Z',
        })),
      ),
    );

    await expect(AppMonitoring.getCrashReports(0)).resolves.toHaveLength(1);
    await expect(AppMonitoring.getCrashReports(50)).resolves.toHaveLength(3);
  });

  describe('serialization edge cases', () => {
    test('recordCrash handles string errors', async () => {
      await AppMonitoring.recordCrash('string error');
      const [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
      const reports = JSON.parse(payload);
      expect(reports[0].message).toBe('string error');
      expect(reports[0].name).toBe('Error');
    });

    test('recordCrash handles object errors', async () => {
      await AppMonitoring.recordCrash({ custom: 'object' });
      const [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
      const reports = JSON.parse(payload);
      expect(reports[0].message).toBe('{"custom":"object"}');
    });

    test('recordCrash handles cyclic objects gracefully', async () => {
      const cyclic: any = { a: 1 };
      cyclic.self = cyclic;
      await AppMonitoring.recordCrash(cyclic);
      const [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
      const reports = JSON.parse(payload);
      expect(reports[0].message).toBe('[object Object]');
    });

    test('serializeContext handles null and non-objects', async () => {
      await AppMonitoring.recordCrash('err', false, 'src', null as any);
      let [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
      expect(JSON.parse(payload)[0].context).toBeUndefined();

      await AppMonitoring.recordCrash('err', false, 'src', 123 as any);
      [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[1];
      expect(JSON.parse(payload)[0].context).toBeUndefined();
    });

    test('serializeContext handles non-serializable objects', async () => {
      const nonSerializable = { a: 1n }; // BigInt cannot be stringified
      await AppMonitoring.recordCrash('err', false, 'src', nonSerializable as any);
      const [, payload] = (RNFS.writeFile as jest.Mock).mock.calls[0];
      expect(JSON.parse(payload)[0].context.raw).toBeDefined();
    });
  });

  describe('console overrides', () => {
    test('initialize sets up global handler and overrides console.error when not in __DEV__', async () => {
      const originalDev = (global as any).__DEV__;
      (global as any).__DEV__ = false;
      const originalError = console.error;
      const originalUtils = (global as any).ErrorUtils;
      
      const mockHandler = jest.fn();
      (global as any).ErrorUtils = {
        getGlobalHandler: jest.fn().mockReturnValue(mockHandler),
        setGlobalHandler: jest.fn(),
      };

      await AppMonitoring.initialize();

      expect((global as any).ErrorUtils.setGlobalHandler).toHaveBeenCalled();
      expect(console.error).not.toBe(originalError);

      // Trigger overridden console.error
      console.error('test error', { detail: 1 });
      
      // Wait for async recordHandledError to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(RNFS.writeFile).toHaveBeenCalled();

      // Restore
      console.error = originalError;
      (global as any).__DEV__ = originalDev;
      (global as any).ErrorUtils = originalUtils;
    });
  });
});
