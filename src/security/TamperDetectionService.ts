/**
 * TamperDetectionService — Aegis Vault Android
 * TypeScript bridge for the native TamperDetection module.
 *
 * Provides runtime tamper detection: APK signature verification,
 * Frida/Xposed/debugger detection via native Android APIs.
 *
 * Çalışma zamanı kurcalama tespiti sağlar: APK imza doğrulaması,
 * Frida/Xposed/debugger tespiti (native Android API'leri üzerinden).
 */
import { NativeModules } from 'react-native';

const { TamperDetection } = NativeModules as {
  TamperDetection?: {
    performFullScan: () => Promise<TamperScanResult>;
    verifyApkSignature: () => Promise<SignatureResult>;
    checkDebugger: () => Promise<boolean>;
    checkFrida: () => Promise<boolean>;
    checkXposed: () => Promise<boolean>;
  };
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface TamperScanResult {
  signatureValid: boolean;
  signatureChecked: boolean;
  signatureHash: string;
  debuggerDetected: boolean;
  fridaDetected: boolean;
  xposedDetected: boolean;
  threats: string[];
  threatScore: number;
  riskLevel: 'clean' | 'medium' | 'high' | 'critical';
  scannedAt: string;
}

export interface SignatureResult {
  valid: boolean;
  checked: boolean;
  currentHash: string;
  reason: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class TamperDetectionService {
  /**
   * Perform a comprehensive tamper detection scan.
   * Kapsamlı bir kurcalama tespit taraması gerçekleştirir.
   */
  static async performFullScan(): Promise<TamperScanResult> {
    if (!TamperDetection?.performFullScan) {
      console.warn('[TamperDetection] Native module not available');
      return {
        signatureValid: true,
        signatureChecked: false,
        signatureHash: '',
        debuggerDetected: false,
        fridaDetected: false,
        xposedDetected: false,
        threats: [],
        threatScore: 0,
        riskLevel: 'clean',
        scannedAt: new Date().toISOString(),
      };
    }
    return TamperDetection.performFullScan();
  }

  /**
   * Verify APK signing certificate only.
   * Yalnızca APK imza sertifikasını doğrular.
   */
  static async verifySignature(): Promise<SignatureResult> {
    if (!TamperDetection?.verifyApkSignature) {
      return { valid: true, checked: false, currentHash: '', reason: 'native_unavailable' };
    }
    return TamperDetection.verifyApkSignature();
  }

  /**
   * Check for debugger attachment.
   * Debugger bağlantısını kontrol eder.
   */
  static async isDebuggerAttached(): Promise<boolean> {
    if (!TamperDetection?.checkDebugger) return false;
    return TamperDetection.checkDebugger();
  }

  /**
   * Check for Frida injection.
   * Frida enjeksiyonunu kontrol eder.
   */
  static async isFridaDetected(): Promise<boolean> {
    if (!TamperDetection?.checkFrida) return false;
    return TamperDetection.checkFrida();
  }

  /**
   * Check for Xposed Framework.
   * Xposed Framework'ü kontrol eder.
   */
  static async isXposedDetected(): Promise<boolean> {
    if (!TamperDetection?.checkXposed) return false;
    return TamperDetection.checkXposed();
  }

  /**
   * Determine if any critical threat was detected.
   * Herhangi bir kritik tehdit tespit edilip edilmediğini belirler.
   */
  static async hasCriticalThreats(): Promise<boolean> {
    const scan = await this.performFullScan();
    return scan.riskLevel === 'critical' || scan.riskLevel === 'high';
  }
}
