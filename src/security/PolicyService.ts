type DeviceTrustPolicy = 'strict' | 'moderate' | 'permissive';
type DegradedDeviceAction = 'warn' | 'allow' | 'block';

export interface SecurityPolicyShape {
  deviceTrustPolicy: DeviceTrustPolicy;
  requireBiometric: boolean;
  rootDetectionEnabled: boolean;
  rootBlocksVault: boolean;
  degradedDeviceAction: DegradedDeviceAction;
}

interface StoredSecurityPolicyValues {
  deviceTrustPolicy?: unknown;
  requireBiometric?: unknown;
  rootDetectionEnabled?: unknown;
  rootBlocksVault?: unknown;
  degradedDeviceAction?: unknown;
}

type BooleanParser = (
  value: string | number | boolean | null | undefined,
  fallback: boolean,
) => boolean;

const isDeviceTrustPolicy = (value: unknown): value is DeviceTrustPolicy =>
  value === 'strict' || value === 'moderate' || value === 'permissive';

const isDegradedDeviceAction = (
  value: unknown,
): value is DegradedDeviceAction =>
  value === 'warn' || value === 'allow' || value === 'block';

export const resolveSecurityPolicy = (
  stored: StoredSecurityPolicyValues,
  defaults: SecurityPolicyShape,
  parseBoolean: BooleanParser,
): SecurityPolicyShape => ({
  deviceTrustPolicy: isDeviceTrustPolicy(stored.deviceTrustPolicy)
    ? stored.deviceTrustPolicy
    : defaults.deviceTrustPolicy,
  requireBiometric: parseBoolean(
    stored.requireBiometric as string | number | boolean | null | undefined,
    defaults.requireBiometric,
  ),
  rootDetectionEnabled: parseBoolean(
    stored.rootDetectionEnabled as string | number | boolean | null | undefined,
    defaults.rootDetectionEnabled,
  ),
  rootBlocksVault: parseBoolean(
    stored.rootBlocksVault as string | number | boolean | null | undefined,
    defaults.rootBlocksVault,
  ),
  degradedDeviceAction: isDegradedDeviceAction(stored.degradedDeviceAction)
    ? stored.degradedDeviceAction
    : defaults.degradedDeviceAction,
});
