/**
 * ScreenSecurityService.test.ts — Aegis Vault Android
 * Unit tests for ScreenSecurityService bridge.
 */

import { NativeModules, Platform } from 'react-native';

describe('ScreenSecurityService', () => {
  let ScreenSecurityService: any;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  it('enable() returns false on non-android platforms', async () => {
    Platform.OS = 'ios';
    ScreenSecurityService = require('../../src/security/ScreenSecurityService').ScreenSecurityService;
    const result = await ScreenSecurityService.enable();
    expect(result).toBe(false);
  });

  it('enable() calls native module on android', async () => {
    (NativeModules as any).ScreenSecurity = {
      enable: jest.fn().mockResolvedValue(true),
    };
    ScreenSecurityService = require('../../src/security/ScreenSecurityService').ScreenSecurityService;
    
    const result = await ScreenSecurityService.enable();
    expect(result).toBe(true);
    expect(NativeModules.ScreenSecurity.enable).toHaveBeenCalled();
  });

  it('disable() calls native module on android', async () => {
    (NativeModules as any).ScreenSecurity = {
      disable: jest.fn().mockResolvedValue(true),
    };
    ScreenSecurityService = require('../../src/security/ScreenSecurityService').ScreenSecurityService;
    
    const result = await ScreenSecurityService.disable();
    expect(result).toBe(true);
    expect(NativeModules.ScreenSecurity.disable).toHaveBeenCalled();
  });

  it('isEnabled() returns current state', async () => {
    (NativeModules as any).ScreenSecurity = {
      isEnabled: jest.fn().mockResolvedValue(true),
    };
    ScreenSecurityService = require('../../src/security/ScreenSecurityService').ScreenSecurityService;
    
    const result = await ScreenSecurityService.isEnabled();
    expect(result).toBe(true);
  });
});
