/**
 * security/PolicyService.test.ts
 * Unit tests for PolicyService — security policy resolution and type guards.
 */

import { resolveSecurityPolicy, type SecurityPolicyShape } from '../../src/security/PolicyService';

const DEFAULTS: SecurityPolicyShape = {
  deviceTrustPolicy: 'moderate',
  requireBiometric: true,
  rootDetectionEnabled: true,
  rootBlocksVault: true,
  degradedDeviceAction: 'warn',
};

const parseBoolean = (
  value: string | number | boolean | null | undefined,
  fallback: boolean,
): boolean => {
  if (value === true || value === 'true' || value === 1) return true;
  if (value === false || value === 'false' || value === 0) return false;
  return fallback;
};

describe('PolicyService — resolveSecurityPolicy', () => {
  it('returns defaults when stored object is empty', () => {
    const result = resolveSecurityPolicy({}, DEFAULTS, parseBoolean);
    expect(result).toEqual(DEFAULTS);
  });

  it('applies valid deviceTrustPolicy from storage', () => {
    const result = resolveSecurityPolicy({ deviceTrustPolicy: 'strict' }, DEFAULTS, parseBoolean);
    expect(result.deviceTrustPolicy).toBe('strict');
  });

  it('falls back to default for invalid deviceTrustPolicy', () => {
    const result = resolveSecurityPolicy({ deviceTrustPolicy: 'super_strict' }, DEFAULTS, parseBoolean);
    expect(result.deviceTrustPolicy).toBe('moderate'); // default
  });

  it('applies all three valid deviceTrustPolicy values', () => {
    for (const policy of ['strict', 'moderate', 'permissive'] as const) {
      const result = resolveSecurityPolicy({ deviceTrustPolicy: policy }, DEFAULTS, parseBoolean);
      expect(result.deviceTrustPolicy).toBe(policy);
    }
  });

  it('applies valid degradedDeviceAction from storage', () => {
    const result = resolveSecurityPolicy({ degradedDeviceAction: 'block' }, DEFAULTS, parseBoolean);
    expect(result.degradedDeviceAction).toBe('block');
  });

  it('falls back to default for invalid degradedDeviceAction', () => {
    const result = resolveSecurityPolicy({ degradedDeviceAction: 'explode' }, DEFAULTS, parseBoolean);
    expect(result.degradedDeviceAction).toBe('warn'); // default
  });

  it('applies all three valid degradedDeviceAction values', () => {
    for (const action of ['warn', 'allow', 'block'] as const) {
      const result = resolveSecurityPolicy({ degradedDeviceAction: action }, DEFAULTS, parseBoolean);
      expect(result.degradedDeviceAction).toBe(action);
    }
  });

  it('parses requireBiometric boolean from string "true"', () => {
    const result = resolveSecurityPolicy({ requireBiometric: 'true' }, DEFAULTS, parseBoolean);
    expect(result.requireBiometric).toBe(true);
  });

  it('parses requireBiometric boolean from string "false"', () => {
    const result = resolveSecurityPolicy({ requireBiometric: 'false' }, DEFAULTS, parseBoolean);
    expect(result.requireBiometric).toBe(false);
  });

  it('parses rootDetectionEnabled from numeric 0 (false)', () => {
    const result = resolveSecurityPolicy({ rootDetectionEnabled: 0 }, DEFAULTS, parseBoolean);
    expect(result.rootDetectionEnabled).toBe(false);
  });

  it('parses rootDetectionEnabled from numeric 1 (true)', () => {
    const result = resolveSecurityPolicy({ rootDetectionEnabled: 1 }, DEFAULTS, parseBoolean);
    expect(result.rootDetectionEnabled).toBe(true);
  });

  it('parses rootBlocksVault from boolean false', () => {
    const result = resolveSecurityPolicy({ rootBlocksVault: false }, DEFAULTS, parseBoolean);
    expect(result.rootBlocksVault).toBe(false);
  });

  it('uses fallback for null boolean values', () => {
    const result = resolveSecurityPolicy({ requireBiometric: null }, DEFAULTS, parseBoolean);
    expect(result.requireBiometric).toBe(DEFAULTS.requireBiometric);
  });

  it('applies all fields simultaneously', () => {
    const stored = {
      deviceTrustPolicy: 'permissive',
      requireBiometric: false,
      rootDetectionEnabled: false,
      rootBlocksVault: false,
      degradedDeviceAction: 'allow',
    };
    const result = resolveSecurityPolicy(stored, DEFAULTS, parseBoolean);
    expect(result.deviceTrustPolicy).toBe('permissive');
    expect(result.requireBiometric).toBe(false);
    expect(result.rootDetectionEnabled).toBe(false);
    expect(result.rootBlocksVault).toBe(false);
    expect(result.degradedDeviceAction).toBe('allow');
  });

  it('does not mutate the defaults object', () => {
    const originalDefaults = { ...DEFAULTS };
    resolveSecurityPolicy({ deviceTrustPolicy: 'strict' }, DEFAULTS, parseBoolean);
    expect(DEFAULTS).toEqual(originalDefaults);
  });
});
