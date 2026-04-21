/**
 * IntegrityModule.test.ts — Aegis Vault Android v4.2.0
 * Hardened mutation-killing tests for device integrity verification.
 */

describe('IntegrityModule', () => {
  afterEach(() => {
    jest.resetModules();
  });

  // ── getIntegritySignals ─────────────────────────────────────

  test('getIntegritySignals does not expose Play Integrity token to JS callers', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: false, emulator: false, debugBuild: false,
            testKeys: false, adbEnabled: false,
            playServicesAvailable: true, playIntegritySupported: true,
            playIntegrityStatus: 'token_obtained',
            playIntegrityTokenReceived: true, playIntegrityTokenLength: 1234,
            playIntegrityNonce: 'nonce-1',
            playIntegrityToken: 'secret-token-that-must-not-leak',
            score: 98, riskLevel: 'low', reasons: [], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));

    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.getIntegritySignals();

    expect(result.playIntegrityTokenReceived).toBe(true);
    expect(result.playIntegrityTokenLength).toBe(1234);
    expect('playIntegrityToken' in result).toBe(false);
    // Verify all boolean normalizations
    expect(result.rooted).toBe(false);
    expect(result.emulator).toBe(false);
    expect(result.debugBuild).toBe(false);
    expect(result.testKeys).toBe(false);
    expect(result.adbEnabled).toBe(false);
    expect(result.playServicesAvailable).toBe(true);
    expect(result.playIntegritySupported).toBe(true);
    expect(result.score).toBe(98);
    expect(result.riskLevel).toBe('low');
    expect(result.playIntegrityNonce).toBe('nonce-1');
    expect(result.playIntegrityStatus).toBe('token_obtained');
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(Array.isArray(result.artifacts)).toBe(true);
    expect(typeof result.checkedAt).toBe('string');
  });

  test('getIntegritySignals returns fail-closed defaults on non-android', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      NativeModules: {},
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.getIntegritySignals();

    expect(result.rooted).toBe(true);
    expect(result.emulator).toBe(true);
    expect(result.debugBuild).toBe(true);
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe('critical');
    expect(result.reasons).toContain('native_integrity_module_unavailable');
    expect(result.reasons).toContain('platform_not_android_or_module_missing');
  });

  test('getIntegritySignals returns fail-closed defaults when native module throws', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockRejectedValue(new Error('native crash')),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.getIntegritySignals();

    expect(result.rooted).toBe(true);
    expect(result.emulator).toBe(true);
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe('critical');
    expect(result.reasons).toContain('native_integrity_check_failed');
  });

  test('getIntegritySignals normalizes missing/null native fields', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: null, emulator: undefined, debugBuild: 0,
            testKeys: '', adbEnabled: false,
            playIntegrityStatus: null,
            playIntegrityNonce: 12345, // non-string
            score: null, riskLevel: null,
            reasons: 'not-an-array', artifacts: null,
            checkedAt: null,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.getIntegritySignals();

    expect(result.rooted).toBe(false);
    expect(result.emulator).toBe(false);
    expect(result.debugBuild).toBe(false);
    expect(result.testKeys).toBe(false);
    expect(result.playIntegrityStatus).toBe('unavailable');
    expect(result.playIntegrityNonce).toBeNull(); // non-string should be null
    expect(result.score).toBe(100); // default
    expect(result.riskLevel).toBe('low'); // default
    expect(result.reasons).toEqual([]); // non-array => empty
    expect(result.artifacts).toEqual([]);
    expect(typeof result.checkedAt).toBe('string');
  });

  // ── checkDeviceIntegrity ────────────────────────────────────

  test('checkDeviceIntegrity returns low risk for clean device', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: false, emulator: false, debugBuild: false,
            testKeys: false, adbEnabled: false,
            playServicesAvailable: true, playIntegritySupported: true,
            playIntegrityStatus: 'token_obtained',
            playIntegrityTokenReceived: true, playIntegrityTokenLength: 100,
            score: 95, riskLevel: 'low', reasons: [], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.checkDeviceIntegrity();
    expect(result.riskLevel).toBe('low');
    expect(result.reasons).toEqual([]);
    expect(result.score).toBe(95);
  });

  test('checkDeviceIntegrity returns critical for rooted device', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: true, emulator: false, debugBuild: false,
            testKeys: false, adbEnabled: false,
            playIntegritySupported: true,
            playIntegrityStatus: 'token_obtained',
            score: 20, riskLevel: 'critical',
            reasons: ['root_detected'], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.checkDeviceIntegrity();
    expect(result.riskLevel).toBe('critical');
    expect(result.reasons).toContain('root_detected');
  });

  test('checkDeviceIntegrity returns critical for emulator', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: false, emulator: true, debugBuild: false,
            testKeys: false, adbEnabled: false,
            playIntegritySupported: true,
            playIntegrityStatus: 'token_obtained',
            score: 10, riskLevel: 'critical',
            reasons: ['emulator_detected'], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.checkDeviceIntegrity();
    expect(result.riskLevel).toBe('critical');
  });

  test('checkDeviceIntegrity returns medium for debug build', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: false, emulator: false, debugBuild: true,
            testKeys: false, adbEnabled: false,
            playIntegritySupported: false,
            score: 60, riskLevel: 'medium',
            reasons: ['debug_build'], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.checkDeviceIntegrity();
    expect(result.riskLevel).toBe('medium');
  });

  test('checkDeviceIntegrity returns high for Play Integrity failure (non-transient)', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: false, emulator: false, debugBuild: false,
            testKeys: false, adbEnabled: false,
            playIntegritySupported: true,
            playIntegrityStatus: 'not_configured',
            score: 50, riskLevel: 'high',
            reasons: ['play_integrity_not_configured'], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.checkDeviceIntegrity();
    expect(result.riskLevel).toBe('high');
  });

  test('checkDeviceIntegrity returns medium for transient Play Integrity failure', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          getIntegritySignals: jest.fn().mockResolvedValue({
            rooted: false, emulator: false, debugBuild: false,
            testKeys: false, adbEnabled: false,
            playIntegritySupported: true,
            playIntegrityStatus: 'request_failed',
            score: 55, riskLevel: 'medium',
            reasons: ['play_services_unavailable_or_request_blocked'], artifacts: [],
            checkedAt: `${Date.now()}`,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.checkDeviceIntegrity();
    expect(result.riskLevel).toBe('medium');
  });

  // ── requestRelayAttestation ─────────────────────────────────

  test('requestRelayAttestation returns token for valid nonce', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          requestPlayIntegrityToken: jest.fn().mockResolvedValue({
            nonce: 'relay-nonce', token: 'relay-token', tokenLength: 11,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    const result = await IntegrityModule.requestRelayAttestation('0123456789abcdef');
    expect(result).toEqual({ nonce: 'relay-nonce', token: 'relay-token', tokenLength: 11 });
  });

  test('requestRelayAttestation throws for short nonce', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          requestPlayIntegrityToken: jest.fn(),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    await expect(IntegrityModule.requestRelayAttestation('short')).rejects.toThrow('play_integrity_invalid_nonce');
  });

  test('requestRelayAttestation throws for empty nonce', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          requestPlayIntegrityToken: jest.fn(),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    await expect(IntegrityModule.requestRelayAttestation('')).rejects.toThrow('play_integrity_invalid_nonce');
  });

  test('requestRelayAttestation throws on non-android', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      NativeModules: {},
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    await expect(IntegrityModule.requestRelayAttestation('0123456789abcdef'))
      .rejects.toThrow('play_integrity_unavailable');
  });

  test('requestRelayAttestation throws when native returns empty token', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          requestPlayIntegrityToken: jest.fn().mockResolvedValue({
            nonce: 'n', token: '', tokenLength: 0,
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    await expect(IntegrityModule.requestRelayAttestation('0123456789abcdef'))
      .rejects.toThrow('play_integrity_request_failed');
  });

  test('requestRelayAttestation throws when native returns null nonce', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      NativeModules: {
        DeviceIntegrity: {
          requestPlayIntegrityToken: jest.fn().mockResolvedValue({
            nonce: null, token: 'tok',
          }),
        },
      },
    }));
    const { IntegrityModule } = require('../src/IntegrityModule');
    await expect(IntegrityModule.requestRelayAttestation('0123456789abcdef'))
      .rejects.toThrow('play_integrity_request_failed');
  });
});
