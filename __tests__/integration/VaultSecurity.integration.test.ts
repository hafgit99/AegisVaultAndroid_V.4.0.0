/**
 * VaultSecurity.integration.test.ts — Aegis Vault Android
 * Automated integration tests for the hardened security layer.
 *
 * This suite verifies the interplay between:
 *  - Native Tamper Detection (Frida/Xposed/Debugger)
 *  - APK Signature Verification
 *  - Device Integrity (Root/Emulator)
 *  - Vault Locking Policy (Strict/Moderate/Permissive)
 *  - Entropy-based Password Validation
 *
 * Bu test paketi şunlar arasındaki etkileşimi doğrular:
 *  - Native Kurcalama Tespiti (Frida/Xposed/Debugger)
 *  - APK İmza Doğrulaması
 *  - Cihaz Bütünlüğü (Root/Emülatör)
 *  - Kasa Kilitleme Politikası (Katı/Orta/Esnek)
 *  - Entropi Tabanlı Şifre Doğrulaması
 */

import { SecurityModule } from '../../src/SecurityModule';
import { IntegrityModule } from '../../src/IntegrityModule';
import { TamperDetectionService } from '../../src/security/TamperDetectionService';
import { calculateEntropy } from '../../src/security/EntropyService';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/security/TamperDetectionService', () => ({
  TamperDetectionService: {
    performFullScan: jest.fn(),
    isDebuggerAttached: jest.fn(),
    isFridaDetected: jest.fn(),
    isXposedDetected: jest.fn(),
  },
}));

jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  rn.NativeModules.TamperDetection = {
    performFullScan: jest.fn(),
  };
  rn.NativeModules.DeviceIntegrity = {
    getIntegritySignals: jest.fn().mockResolvedValue({
      rooted: false,
      emulator: false,
      riskLevel: 'low',
      score: 100,
    }),
  };
  return rn;
});

// Mock SecurityModule internal methods to avoid real DB/FS calls where possible
// but keep the policy logic intact.
jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue('{}'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/doc',
}));

// ── Integration Tests ────────────────────────────────────────────────────────

describe('Vault Security Integration — End-to-End Hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TEST: Strict Policy blocks vault on Frida detection.
   * SENARYO: Katı politika, Frida tespiti durumunda kasayı engeller.
   */
  it('should block vault access when Frida is detected under Strict policy', async () => {
    // 1. Simulate Frida detected via TamperDetectionService
    (TamperDetectionService.performFullScan as jest.Mock).mockResolvedValue({
      signatureValid: true,
      debuggerDetected: false,
      fridaDetected: true,
      xposedDetected: false,
      threats: ['frida_detected'],
      threatScore: 35,
      riskLevel: 'high',
    });

    // 2. Configure Strict Policy
    const strictPolicy = {
      rootDetectionEnabled: true,
      rootBlocksVault: true,
      deviceTrustPolicy: 'strict',
      degradedDeviceAction: 'block',
    };

    // 3. Attempt to unlock — unlockVaultDetailed uses IntegrityModule.getIntegritySignals
    // which in turn uses TamperDetectionService.performFullScan
    const result = await (SecurityModule as any).unlockVaultDetailed(
      new Uint8Array([1, 2, 3]),
      strictPolicy
    );

    // 4. Verify lockout
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('integrity_blocked');
    expect(result.riskLevel).toBe('critical'); // Frida triggers critical in IntegrityModule.ts
  });

  /**
   * TEST: Permissive Policy allows vault despite threats but logs event.
   * SENARYO: Esnek politika, tehditlere rağmen kasaya izin verir ancak olayı günlüğe kaydeder.
   */
  it('should allow vault access with warning when Debugger is attached under Permissive policy', async () => {
    // 1. Simulate Debugger detected
    (TamperDetectionService.performFullScan as jest.Mock).mockResolvedValue({
      signatureValid: true,
      debuggerDetected: true,
      fridaDetected: false,
      xposedDetected: false,
      threats: ['debugger_attached'],
      threatScore: 30,
      riskLevel: 'medium',
    });

    // 2. Configure Permissive Policy
    const permissivePolicy = {
      rootDetectionEnabled: true,
      rootBlocksVault: false,
      deviceTrustPolicy: 'permissive',
      degradedDeviceAction: 'allow',
    };

    // 3. Mock database opening to simulate success
    jest.spyOn(SecurityModule as any, 'getDeviceSalt').mockResolvedValue(Buffer.alloc(16));
    jest.spyOn(SecurityModule as any, 'deriveVaultDatabaseKeyHex').mockResolvedValue('mock-key');
    jest.spyOn(SecurityModule as any, 'tryOpenVaultWithKey').mockReturnValue({ executeSync: jest.fn() });

    // 4. Attempt to unlock
    const result = await (SecurityModule as any).unlockVaultDetailed(
      new Uint8Array([1, 2, 3]),
      permissivePolicy
    );

    // 5. Verify access allowed
    expect(result.ok).toBe(true);
  });

  /**
   * TEST: APK Signature Mismatch is treated as Critical threat.
   * SENARYO: APK imza uyuşmazlığı kritik tehdit olarak değerlendirilir.
   */
  it('should treat APK signature mismatch as a critical threat', async () => {
    (TamperDetectionService.performFullScan as jest.Mock).mockResolvedValue({
      signatureValid: false,
      fridaDetected: false,
      xposedDetected: false,
      threats: ['apk_signature_mismatch'],
      threatScore: 40,
      riskLevel: 'high',
    });

    const signals = await IntegrityModule.getIntegritySignals();
    expect(signals.signatureValid).toBe(false);
    expect(signals.riskLevel).toBe('critical'); // Hardened logic treats this as critical
  });

  /**
   * TEST: Password Entropy correctly identifies weak vs strong secrets.
   * SENARYO: Şifre entropisi zayıf ve güçlü sırları doğru şekilde ayırır.
   */
  describe('Entropy & Password Quality Integration', () => {
    it('should identify a common dictionary password as critical/weak', () => {
      const weak = calculateEntropy('password123');
      expect(weak.level).toBe('critical');
      expect(weak.score).toBeLessThan(30);
      expect(weak.penalties).toContainEqual(expect.objectContaining({ type: 'common_password' }));
    });

    it('should identify a high-entropy random string as excellent', () => {
      const strong = calculateEntropy('Tr0ub4dur&3!_99_XzQ');
      expect(strong.level).toBe('excellent');
      expect(strong.score).toBeGreaterThan(90);
      expect(strong.effectiveEntropy).toBeGreaterThan(80);
    });

    it('should apply penalties for keyboard sequences', () => {
      const seq = calculateEntropy('qwertyuiop123');
      expect(seq.penalties).toContainEqual(expect.objectContaining({ type: 'keyboard_sequence' }));
    });
  });
});
