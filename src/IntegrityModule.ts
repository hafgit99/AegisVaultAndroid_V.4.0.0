import { NativeModules, Platform } from 'react-native';
import { TamperDetectionService } from './security/TamperDetectionService';


const { DeviceIntegrity } = NativeModules;

export interface IntegritySignals {
  rooted: boolean;
  emulator: boolean;
  debugBuild: boolean;
  testKeys: boolean;
  adbEnabled: boolean;
  playServicesAvailable?: boolean;
  playIntegritySupported?: boolean;
  playIntegrityStatus?:
    | 'token_obtained'
    | 'not_configured'
    | 'unavailable'
    | 'request_failed';
  playIntegrityTokenReceived?: boolean;
  playIntegrityTokenLength?: number;
  playIntegrityNonce?: string | null;
  fridaDetected: boolean;
  xposedDetected: boolean;
  signatureValid: boolean;
  tamperRiskLevel: 'clean' | 'medium' | 'high' | 'critical';
  score: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  reasons: string[];
  artifacts: string[];
  checkedAt: string;
}

// SECURITY: Fail-closed defaults — when native module is unavailable or
// throws, we assume the WORST case (rooted/emulated) instead of silently
// granting a clean bill of health. This prevents an attacker from simply
// disabling the native module to bypass all device integrity checks.
const FAIL_CLOSED_SIGNALS: IntegritySignals = {
  rooted: true,
  emulator: true,
  debugBuild: true,
  testKeys: true,
  adbEnabled: true,
  playServicesAvailable: false,
  playIntegritySupported: false,
  playIntegrityStatus: 'unavailable',
  playIntegrityTokenReceived: false,
  playIntegrityTokenLength: 0,
  playIntegrityNonce: null,
  fridaDetected: true,
  xposedDetected: true,
  signatureValid: false,
  tamperRiskLevel: 'critical',
  score: 0,
  riskLevel: 'critical',
  reasons: ['native_integrity_module_unavailable'],
  artifacts: [],
  checkedAt: new Date(0).toISOString(),
};

export const IntegrityModule = {
  async getIntegritySignals(): Promise<IntegritySignals> {
    // SECURITY: Fail-closed — if we're not on Android or the native module
    // is missing/stripped, return critical risk so the app can enforce
    // appropriate restrictions (e.g. block sync, show warning).
    if (Platform.OS !== 'android' || !DeviceIntegrity?.getIntegritySignals) {
      return {
        ...FAIL_CLOSED_SIGNALS,
        reasons: ['native_integrity_module_unavailable', 'platform_not_android_or_module_missing'],
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const raw = await DeviceIntegrity.getIntegritySignals();
      const tamperResult = await TamperDetectionService.performFullScan();

      const combinedReasons = [
        ...(Array.isArray(raw?.reasons) ? raw.reasons : []),
        ...tamperResult.threats,
      ];

      // Recalculate aggregate risk level based on both native signals and tamper scan
      let finalRiskLevel: IntegritySignals['riskLevel'] = (raw?.riskLevel || 'low') as any;
      if (tamperResult.riskLevel === 'critical') finalRiskLevel = 'critical';
      else if (tamperResult.riskLevel === 'high' && finalRiskLevel !== 'critical') finalRiskLevel = 'high';
      else if (tamperResult.riskLevel === 'medium' && (finalRiskLevel === 'low')) finalRiskLevel = 'medium';

      return {
        rooted: !!raw?.rooted,
        emulator: !!raw?.emulator,
        debugBuild: !!raw?.debugBuild,
        testKeys: !!raw?.testKeys,
        adbEnabled: !!raw?.adbEnabled,
        playServicesAvailable: !!raw?.playServicesAvailable,
        playIntegritySupported: !!raw?.playIntegritySupported,
        playIntegrityStatus: raw?.playIntegrityStatus || 'unavailable',
        playIntegrityTokenReceived: !!raw?.playIntegrityTokenReceived,
        playIntegrityTokenLength: Number(raw?.playIntegrityTokenLength ?? 0),
        playIntegrityNonce:
          typeof raw?.playIntegrityNonce === 'string'
            ? raw.playIntegrityNonce
            : null,
        fridaDetected: tamperResult.fridaDetected,
        xposedDetected: tamperResult.xposedDetected,
        signatureValid: tamperResult.signatureValid,
        tamperRiskLevel: tamperResult.riskLevel,
        score: Math.min(Number(raw?.score ?? 100), 100 - tamperResult.threatScore),
        riskLevel: finalRiskLevel,
        reasons: combinedReasons,
        artifacts: Array.isArray(raw?.artifacts) ? raw.artifacts : [],
        checkedAt: raw?.checkedAt
          ? new Date(Number(raw.checkedAt)).toISOString()
          : new Date().toISOString(),
      };
    } catch (error) {
      // SECURITY: Fail-closed — any native module error is treated as
      // a potential tamper attempt. Never fall back to "all clear".
      return {
        ...FAIL_CLOSED_SIGNALS,
        reasons: ['native_integrity_check_failed', String(error)],
        checkedAt: new Date().toISOString(),
      };
    }
  },

  /**
   * Evaluates current device integrity signals and returns a simple risk level.
   * Useful for policy enforcement in SecurityModule.
   */
  async checkDeviceIntegrity(): Promise<{
    riskLevel: IntegritySignals['riskLevel'];
    score: number;
    reasons: string[];
  }> {
    const signals = await this.getIntegritySignals();

    // Default: no risk
    if (
      signals.score >= 90 &&
      !signals.rooted &&
      !signals.emulator &&
      signals.playIntegrityStatus === 'token_obtained'
    ) {
      return {
        riskLevel: 'low',
        score: signals.score,
        reasons: [],
      };
    }

    // Highest risk: rooted, emulator, frida, or signature mismatch
    if (
      signals.rooted ||
      signals.emulator ||
      signals.fridaDetected ||
      !signals.signatureValid
    ) {
      return {
        riskLevel: 'critical',
        score: signals.score,
        reasons: signals.reasons,
      };
    }

    // High risk: Xposed
    if (signals.xposedDetected) {
      return {
        riskLevel: 'high',
        score: signals.score,
        reasons: signals.reasons,
      };
    }

    // Play Integrity request failures are often transient (service unavailable,
    // quota/network issues). Treat as high only when no token is returned for
    // non-transient reasons; otherwise medium so users are not over-penalized.
    if (
      signals.playIntegritySupported &&
      signals.playIntegrityStatus !== 'token_obtained'
    ) {
      const transientFailure =
        signals.playIntegrityStatus === 'request_failed' &&
        signals.reasons.some(reason =>
          /play_services_unavailable_or_request_blocked|request_failed/i.test(
            reason,
          ),
        );
      return {
        riskLevel: transientFailure ? 'medium' : 'high',
        score: signals.score,
        reasons: signals.reasons,
      };
    }

    // Medium risk: debug build or ADB enabled
    if (signals.debugBuild || signals.adbEnabled) {
      return {
        riskLevel: 'medium',
        score: signals.score,
        reasons: signals.reasons,
      };
    }

    return {
      riskLevel: signals.riskLevel,
      score: signals.score,
      reasons: signals.reasons,
    };
  },

  async requestRelayAttestation(
    nonce: string,
  ): Promise<{ nonce: string; token: string; tokenLength: number }> {
    if (Platform.OS !== 'android' || !DeviceIntegrity?.requestPlayIntegrityToken) {
      throw new Error('play_integrity_unavailable');
    }
    if (!nonce || nonce.length < 16) {
      throw new Error('play_integrity_invalid_nonce');
    }
    const result = await DeviceIntegrity.requestPlayIntegrityToken(nonce);
    const token = typeof result?.token === 'string' ? result.token : '';
    const resNonce = typeof result?.nonce === 'string' ? result.nonce : '';
    if (!token || !resNonce) {
      throw new Error('play_integrity_request_failed');
    }
    return {
      nonce: resNonce,
      token,
      tokenLength: Number(result?.tokenLength ?? token.length),
    };
  },
};
