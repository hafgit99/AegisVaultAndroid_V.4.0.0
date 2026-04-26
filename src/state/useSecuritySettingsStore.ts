import { create } from 'zustand';
import {
  PasskeyRpSettings,
  SecureAppSettings,
} from '../SecureAppSettings';

type PasskeyRpDraft = Required<PasskeyRpSettings>;

interface SecuritySettingsStore {
  passkeyRpDraft: PasskeyRpDraft;
  hydrateFromSecureSettings: () => void;
  updatePasskeyRpDraft: (patch: Partial<PasskeyRpDraft>) => void;
}

const normalizePasskeyRp = (settings?: PasskeyRpSettings): PasskeyRpDraft => ({
  baseUrl: settings?.baseUrl || '',
  accountId: settings?.accountId || '',
  authToken: settings?.authToken || '',
  tenantHeaderName: settings?.tenantHeaderName || '',
  tenantHeaderValue: settings?.tenantHeaderValue || '',
});

export const useSecuritySettingsStore = create<SecuritySettingsStore>(set => ({
  passkeyRpDraft: normalizePasskeyRp(SecureAppSettings.get().passkeyRp),
  hydrateFromSecureSettings: () =>
    set({
      passkeyRpDraft: normalizePasskeyRp(SecureAppSettings.get().passkeyRp),
    }),
  updatePasskeyRpDraft: patch =>
    set(state => ({
      passkeyRpDraft: {
        ...state.passkeyRpDraft,
        ...patch,
      },
    })),
}));
