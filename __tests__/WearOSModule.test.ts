describe('WearOSModule', () => {
  const loadModule = () => require('../src/WearOSModule');

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('syncs only favorite items with secrets to the watch on Android', async () => {
    const syncItems = jest.fn().mockResolvedValue(undefined);
    const logSecurityEvent = jest.fn().mockResolvedValue(undefined);
    const createEnvelope = jest.fn().mockReturnValue({ ciphertext: 'enc' });

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: { syncItems },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue('root-secret'),
        logSecurityEvent,
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    const result = await WearOSModule.syncFavoritesToWatch([
      { id: 1, title: 'OTP 1', password: 'totp-secret', category: 'otp', favorite: 1 },
      { id: 2, title: 'Ignored', password: '', category: 'otp', favorite: 1 },
      { id: 3, title: 'Ignored 2', password: 'x', category: 'otp', favorite: 0 },
    ] as any);

    expect(result).toBe(true);
    expect(createEnvelope).toHaveBeenCalledWith(
      [
        {
          id: 1,
          title: 'OTP 1',
          secret: 'totp-secret',
          issuer: 'otp',
        },
      ],
      expect.any(Object),
    );
    expect(syncItems).toHaveBeenCalledWith(JSON.stringify({ ciphertext: 'enc' }));
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'wear_os_sync_complete',
      'success',
      { count: 1 },
    );
  });

  it('fails sync when the vault sync secret is unavailable', async () => {
    const syncItems = jest.fn();
    const logSecurityEvent = jest.fn();
    const createEnvelope = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: { syncItems },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue(''),
        logSecurityEvent,
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(
      WearOSModule.syncFavoritesToWatch([
        { id: 1, title: 'OTP 1', password: 'totp-secret', category: '', favorite: 1 },
      ] as any),
    ).resolves.toBe(false);

    expect(createEnvelope).not.toHaveBeenCalled();
    expect(syncItems).not.toHaveBeenCalled();
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0][1]).toBeInstanceOf(Error);
    expect((consoleErrorSpy.mock.calls[0][1] as Error).message).toBe(
      'Vault is locked, Wear OS sync key is unavailable.',
    );

    consoleErrorSpy.mockRestore();
  });

  it('uses Aegis as issuer fallback when category is missing', async () => {
    const syncItems = jest.fn().mockResolvedValue(undefined);
    const createEnvelope = jest.fn().mockReturnValue({ ciphertext: 'enc' });

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: { syncItems },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue('root-secret'),
        logSecurityEvent: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    await WearOSModule.syncFavoritesToWatch([
      { id: 9, title: 'Fallback Issuer', password: 'secret', category: '', favorite: 1 },
    ] as any);

    expect(createEnvelope).toHaveBeenCalledWith(
      [
        {
          id: 9,
          title: 'Fallback Issuer',
          secret: 'secret',
          issuer: 'Aegis',
        },
      ],
      expect.any(Object),
    );
  });

  it('skips payload creation when syncItems bridge is unavailable but still logs success', async () => {
    const createEnvelope = jest.fn();
    const logSecurityEvent = jest.fn().mockResolvedValue(undefined);

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {},
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue('root-secret'),
        logSecurityEvent,
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(
      WearOSModule.syncFavoritesToWatch([
        { id: 1, title: 'OTP 1', password: 'totp-secret', category: 'otp', favorite: 1 },
      ] as any),
    ).resolves.toBe(true);

    expect(createEnvelope).not.toHaveBeenCalled();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'wear_os_sync_complete',
      'success',
      { count: 1 },
    );
  });

  it('tolerates a completely missing WearOS bridge during sync', async () => {
    const createEnvelope = jest.fn();
    const logSecurityEvent = jest.fn().mockResolvedValue(undefined);

    jest.doMock('react-native', () => ({
      NativeModules: {},
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue('root-secret'),
        logSecurityEvent,
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(
      WearOSModule.syncFavoritesToWatch([
        { id: 1, title: 'OTP 1', password: 'totp-secret', category: 'otp', favorite: 1 },
      ] as any),
    ).resolves.toBe(true);

    expect(createEnvelope).not.toHaveBeenCalled();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      'wear_os_sync_complete',
      'success',
      { count: 1 },
    );
  });

  it('returns false when native sync bridge throws', async () => {
    const syncItems = jest.fn().mockRejectedValue(new Error('bridge-failed'));
    const logSecurityEvent = jest.fn();
    const createEnvelope = jest.fn().mockReturnValue({ ciphertext: 'enc' });
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: { syncItems },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue('root-secret'),
        logSecurityEvent,
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(
      WearOSModule.syncFavoritesToWatch([
        { id: 1, title: 'OTP 1', password: 'totp-secret', category: 'otp', favorite: 1 },
      ] as any),
    ).resolves.toBe(false);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[WearOS] Sync error:',
      expect.any(Error),
    );
    expect(logSecurityEvent).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('returns false on non-android platforms', async () => {
    const syncItems = jest.fn();
    const logSecurityEvent = jest.fn();
    const createEnvelope = jest.fn();

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: { syncItems },
      },
      Platform: { OS: 'ios' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn().mockResolvedValue('root-secret'),
        logSecurityEvent,
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope,
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(
      WearOSModule.syncFavoritesToWatch([
        { id: 1, title: 'OTP 1', password: 'totp-secret', category: 'otp', favorite: 1 },
      ] as any),
    ).resolves.toBe(false);

    expect(createEnvelope).not.toHaveBeenCalled();
    expect(syncItems).not.toHaveBeenCalled();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('returns the first connected watch when native bridge responds', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {
          getConnectedNodes: jest.fn().mockResolvedValue([
            { id: 'watch-1', displayName: 'Pixel Watch' },
          ]),
        },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();
    const device = await WearOSModule.getConnectedWatch();

    expect(device).toMatchObject({
      id: 'watch-1',
      name: 'Pixel Watch',
      status: 'connected',
    });
    expect(new Date(device!.lastSeen).toString()).not.toBe('Invalid Date');
  });

  it('returns null when watch bridge is unavailable on android', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {},
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.getConnectedWatch()).resolves.toBeNull();
  });

  it('returns null when WearOS bridge object is completely missing on android', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {},
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.getConnectedWatch()).resolves.toBeNull();
  });

  it('returns null on non-android platforms even if a watch bridge exists', async () => {
    const getConnectedNodes = jest.fn();

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {
          getConnectedNodes,
        },
      },
      Platform: { OS: 'ios' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.getConnectedWatch()).resolves.toBeNull();
    expect(getConnectedNodes).not.toHaveBeenCalled();
  });

  it('returns null when no connected nodes are reported', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {
          getConnectedNodes: jest.fn().mockResolvedValue([]),
        },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.getConnectedWatch()).resolves.toBeNull();
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('falls back to generic watch name when display name is missing', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {
          getConnectedNodes: jest.fn().mockResolvedValue([{ id: 'watch-2' }]),
        },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.getConnectedWatch()).resolves.toMatchObject({
      id: 'watch-2',
      name: 'Wear OS Watch',
      status: 'connected',
    });
  });

  it('returns null and warns when watch discovery throws', async () => {
    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {
          getConnectedNodes: jest.fn().mockRejectedValue(new Error('discovery-failed')),
        },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.getConnectedWatch()).resolves.toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('delegates standalone mode toggling when bridge exists', async () => {
    const setStandaloneMode = jest.fn().mockResolvedValue(true);

    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {
          setStandaloneMode,
        },
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.setStandaloneMode(true)).resolves.toBe(true);
    expect(setStandaloneMode).toHaveBeenCalledWith(true);
  });

  it('returns false when standalone mode bridge is missing', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {
        WearOSBridge: {},
      },
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.setStandaloneMode(true)).resolves.toBe(false);
  });

  it('returns false when WearOS bridge object is completely missing for standalone mode', async () => {
    jest.doMock('react-native', () => ({
      NativeModules: {},
      Platform: { OS: 'android' },
    }));
    jest.doMock('../src/SecurityModule', () => ({
      SecurityModule: {
        getActiveSyncRootSecret: jest.fn(),
        logSecurityEvent: jest.fn(),
      },
    }));
    jest.doMock('../src/WearSyncCrypto', () => ({
      WearSyncCrypto: {
        createEnvelope: jest.fn(),
      },
    }));

    const { WearOSModule } = loadModule();

    await expect(WearOSModule.setStandaloneMode(true)).resolves.toBe(false);
  });
});
