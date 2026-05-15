/**
 * TamperDetectionService.test.ts — Aegis Vault Android
 * Unit tests for the TamperDetectionService bridge.
 */

import { NativeModules } from 'react-native';

describe('TamperDetectionService', () => {
  let TamperDetectionService: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('performFullScan returns default clean result when native module is missing', async () => {
    // Ensure native module is missing
    delete (NativeModules as any).TamperDetection;
    TamperDetectionService = require('../../src/security/TamperDetectionService').TamperDetectionService;
    
    const result = await TamperDetectionService.performFullScan();
    expect(result.riskLevel).toBe('clean');
    expect(result.signatureValid).toBe(true);
  });

  it('verifySignature calls native module and returns result', async () => {
    const mockResult = { valid: true, checked: true, currentHash: 'hash', reason: '' };
    (NativeModules as any).TamperDetection = {
      verifyApkSignature: jest.fn().mockResolvedValue(mockResult),
    };
    TamperDetectionService = require('../../src/security/TamperDetectionService').TamperDetectionService;

    const result = await TamperDetectionService.verifySignature();
    expect(result).toEqual(mockResult);
    expect(NativeModules.TamperDetection.verifyApkSignature).toHaveBeenCalled();
  });

  it('hasCriticalThreats identifies high risk', async () => {
    (NativeModules as any).TamperDetection = {
      performFullScan: jest.fn().mockResolvedValue({ riskLevel: 'high' }),
    };
    TamperDetectionService = require('../../src/security/TamperDetectionService').TamperDetectionService;

    const result = await TamperDetectionService.hasCriticalThreats();
    expect(result).toBe(true);
  });
});
