import { NativeModules, Platform } from 'react-native';

const { AutofillBridge } = NativeModules;

export interface AutofillEntry {
  id: number;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  category?: string;
}

/**
 * Interface to communicate with the Android Autofill Service.
 */
export const AutofillService = {
  /**
   * Syncs the latest vault entries to the native autofill service.
   * Only supported on Android 8.0+ (API 26).
   */
  updateEntries: (entries: AutofillEntry[]) => {
    if (Platform.OS === 'android' && Platform.Version >= 26 && AutofillBridge) {
      try {
        AutofillBridge.updateAutofillEntries(entries);
      } catch (e) {
        console.error('[Autofill] Failed to update entries:', e);
      }
    }
  },

  /**
   * Updates the lock status in the autofill service.
   */
  setUnlocked: (unlocked: boolean) => {
    if (Platform.OS === 'android' && Platform.Version >= 26 && AutofillBridge) {
      try {
        AutofillBridge.setVaultUnlocked(unlocked);
      } catch (e) {
        console.error('[Autofill] Failed to set lock status:', e);
      }
    }
  },

  /**
   * Clears all autofill data memory (called upon locking).
   */
  clearEntries: () => {
    if (Platform.OS === 'android' && Platform.Version >= 26 && AutofillBridge) {
      try {
        AutofillBridge.clearAutofillEntries();
      } catch (e) {
        console.error('[Autofill] Failed to clear entries:', e);
      }
    }
  },

  /**
   * Opens the system Autofill settings.
   */
  openSettings: () => {
    if (Platform.OS === 'android' && Platform.Version >= 26 && AutofillBridge) {
      try {
        AutofillBridge.openSettings();
      } catch (e) {
        console.error('[Autofill] Failed to open settings:', e);
      }
    }
  },
};
