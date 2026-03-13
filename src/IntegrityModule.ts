import { NativeModules, Platform } from 'react-native';

const { DeviceIntegrity } = NativeModules;

export interface IntegritySignals {
  rooted: boolean;
  emulator: boolean;
  debugBuild: boolean;
  testKeys: boolean;
  adbEnabled: boolean;
  score: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
  artifacts: string[];
  checkedAt: string;
}

const DEFAULT_SIGNALS: IntegritySignals = {
  rooted: false,
  emulator: false,
  debugBuild: false,
  testKeys: false,
  adbEnabled: false,
  score: 100,
  riskLevel: 'low',
  reasons: [],
  artifacts: [],
  checkedAt: new Date(0).toISOString(),
};

export const IntegrityModule = {
  async getIntegritySignals(): Promise<IntegritySignals> {
    if (Platform.OS !== 'android' || !DeviceIntegrity?.getIntegritySignals) {
      return {
        ...DEFAULT_SIGNALS,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const raw = await DeviceIntegrity.getIntegritySignals();
      return {
        rooted: !!raw?.rooted,
        emulator: !!raw?.emulator,
        debugBuild: !!raw?.debugBuild,
        testKeys: !!raw?.testKeys,
        adbEnabled: !!raw?.adbEnabled,
        score: Number(raw?.score ?? 100),
        riskLevel: (raw?.riskLevel || 'low') as IntegritySignals['riskLevel'],
        reasons: Array.isArray(raw?.reasons) ? raw.reasons : [],
        artifacts: Array.isArray(raw?.artifacts) ? raw.artifacts : [],
        checkedAt: raw?.checkedAt
          ? new Date(Number(raw.checkedAt)).toISOString()
          : new Date().toISOString(),
      };
    } catch {
      return {
        ...DEFAULT_SIGNALS,
        checkedAt: new Date().toISOString(),
      };
    }
  },
};
