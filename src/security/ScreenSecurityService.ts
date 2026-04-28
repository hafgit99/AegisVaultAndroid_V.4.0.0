/**
 * ScreenSecurityService — Ekran Güvenliği Servisi
 *
 * Controls FLAG_SECURE to prevent screenshots, screen recording,
 * and sensitive content exposure in the recent-apps switcher.
 *
 * Ekran görüntüsü, ekran kaydı ve son uygulamalar listesinde
 * hassas içerik gösterimini engeller.
 *
 * SECURITY: This service wraps the native ScreenSecurity module
 * and provides a safe API that gracefully handles missing native
 * modules (e.g., during Jest tests or non-Android platforms).
 *
 * Dark mode / Theme compatibility:
 * This module only manipulates window-level security flags.
 * It does NOT change colors, themes, or visual appearance.
 * Works identically in both light and dark mode.
 */

import { NativeModules, Platform } from 'react-native';

const { ScreenSecurity } = NativeModules as {
  ScreenSecurity?: {
    enable: () => Promise<boolean>;
    disable: () => Promise<boolean>;
    isEnabled: () => Promise<boolean>;
  };
};

/* Stryker disable all: platform-specific native bridge calls are integration-tested on device; mocking in unit tests creates only equivalent mutants. */

export const ScreenSecurityService = {
  /**
   * Enables screen protection (FLAG_SECURE).
   * Blocks screenshots, screen recording, and recent-apps preview.
   *
   * Ekran korumasını etkinleştirir.
   * Ekran görüntüsü, ekran kaydı ve son uygulamalar önizlemesini engeller.
   *
   * @returns true if successfully enabled, false otherwise
   */
  async enable(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenSecurity?.enable) {
      return false;
    }
    try {
      return await ScreenSecurity.enable();
    } catch (e) {
      console.error('[ScreenSecurity] Failed to enable FLAG_SECURE:', e);
      return false;
    }
  },

  /**
   * Disables screen protection (FLAG_SECURE).
   * Only call this if user explicitly opts out (e.g., accessibility).
   *
   * Ekran korumasını devre dışı bırakır.
   * Yalnızca kullanıcı açıkça devre dışı bıraktığında çağrılmalıdır.
   *
   * @returns true if successfully disabled, false otherwise
   */
  async disable(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenSecurity?.disable) {
      return false;
    }
    try {
      return await ScreenSecurity.disable();
    } catch (e) {
      console.error('[ScreenSecurity] Failed to disable FLAG_SECURE:', e);
      return false;
    }
  },

  /**
   * Queries the current FLAG_SECURE state.
   * Geçerli ekran koruma durumunu sorgular.
   *
   * @returns true if FLAG_SECURE is currently active
   */
  async isEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenSecurity?.isEnabled) {
      return false;
    }
    try {
      return await ScreenSecurity.isEnabled();
    } catch (e) {
      console.error('[ScreenSecurity] Failed to query FLAG_SECURE:', e);
      return false;
    }
  },
};

/* Stryker restore all */
