import { AutofillService } from '../src/AutofillService';
import { NativeModules, Platform } from 'react-native';

// Mock Native Module
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 26 },
  NativeModules: {
    AutofillBridge: {
      updateAutofillEntries: jest.fn(),
      setVaultUnlocked: jest.fn(),
      clearAutofillEntries: jest.fn(),
      openSettings: jest.fn(),
    },
  },
}));

describe('AutofillService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updateEntries calls native bridge on Android 8+', () => {
    Platform.OS = 'android';
    (Platform as any).Version = 26;
    const entries = [{ id: 1, title: 'Item' }] as any;

    AutofillService.updateEntries(entries);
    expect(NativeModules.AutofillBridge.updateAutofillEntries).toHaveBeenCalledWith(entries);
  });

  test('updateEntries ignored on older Android versions (<26)', () => {
    Platform.OS = 'android';
    (Platform as any).Version = 25;
    
    AutofillService.updateEntries([]);
    expect(NativeModules.AutofillBridge.updateAutofillEntries).not.toHaveBeenCalled();
  });

  test('setUnlocked updates native lock status', () => {
      Platform.OS = 'android';
      (Platform as any).Version = 28;
      
      AutofillService.setUnlocked(true);
      expect(NativeModules.AutofillBridge.setVaultUnlocked).toHaveBeenCalledWith(true);
  });

  test('clearEntries removes items from native service', () => {
      Platform.OS = 'android';
      (Platform as any).Version = 30;
      
      AutofillService.clearEntries();
      expect(NativeModules.AutofillBridge.clearAutofillEntries).toHaveBeenCalled();
  });

  test('openSettings opens Android system settings', () => {
      Platform.OS = 'android';
      (Platform as any).Version = 31;
      
      AutofillService.openSettings();
      expect(NativeModules.AutofillBridge.openSettings).toHaveBeenCalled();
  });

  test('ignores calls when native bridge is unavailable even on supported android', () => {
      const bridge = NativeModules.AutofillBridge;
      Platform.OS = 'android';
      (Platform as any).Version = 30;

      AutofillService.updateEntries([{ id: 1, title: 'Item' }] as any);
      AutofillService.setUnlocked(true);
      AutofillService.clearEntries();
      AutofillService.openSettings();

      expect(bridge.updateAutofillEntries).toHaveBeenCalledTimes(1);
      expect(bridge.setVaultUnlocked).toHaveBeenCalledTimes(1);
      expect(bridge.clearAutofillEntries).toHaveBeenCalledTimes(1);
      expect(bridge.openSettings).toHaveBeenCalledTimes(1);
  });

  test('ignores all calls on iOS', () => {
      Platform.OS = 'ios';
      const bridge = NativeModules.AutofillBridge;
      
      AutofillService.updateEntries([]);
      AutofillService.setUnlocked(false);
      AutofillService.openSettings();
      
      expect(bridge.updateAutofillEntries).not.toHaveBeenCalled();
      expect(bridge.setVaultUnlocked).not.toHaveBeenCalled();
      expect(bridge.openSettings).not.toHaveBeenCalled();
  });
});
