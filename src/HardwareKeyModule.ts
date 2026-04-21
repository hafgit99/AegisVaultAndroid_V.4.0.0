/**
 * HardwareKeyModule - High-Security Hardware Authenticator (YubiKey / NFC)
 *
 * Uses native Android passkey/FIDO2 bridge for real security key registration
 * and assertion flows. No mock credential generation in production flow.
 */

import RNFS from 'react-native-fs';
import { NativeModules, Platform } from 'react-native';
import { SecurityModule } from './SecurityModule';

const { PasskeyModule: NativePasskeyModule, HardwareKeyBridge } = NativeModules as {
  PasskeyModule?: {
    isAvailable?: () => Promise<boolean>;
    createPasskey?: (requestJson: string) => Promise<{ registrationResponseJson: string }>;
    authenticatePasskey?: (requestJson: string) => Promise<{ authenticationResponseJson: string }>;
  };
  HardwareKeyBridge?: {
    isNfcAvailable?: () => Promise<boolean>;
  };
};

const KEYS_FILE = `${RNFS.DocumentDirectoryPath}/hardware_keys.json`;

export interface HardwareKey {
  id: string;
  name: string;
  publicKey: string;
  counter: number;
  addedAt: string;
  interface: 'nfc' | 'usb' | 'ble';
}

function resolveChallenge(input?: string): string {
  if (input && input.trim()) {
    return SecurityModule.sanitizeBase64Url(input);
  }
  return SecurityModule.generatePasskeyData().credential_id || '';
}

function detectInterface(transports?: unknown): HardwareKey['interface'] {
  if (!Array.isArray(transports)) return 'usb';
  const normalized = transports.map(t => `${t}`.toLowerCase());
  if (normalized.includes('nfc')) return 'nfc';
  if (normalized.includes('ble')) return 'ble';
  return 'usb';
}

export class HardwareKeyModule {
  static async registerKey(name: string): Promise<HardwareKey | null> {
    try {
      const available = await this.isNfcAvailable();
      if (!available || !NativePasskeyModule?.createPasskey) {
        throw new Error('Hardware key bridge is unavailable on this device.');
      }

      const requestJson = JSON.stringify({
        challenge: resolveChallenge(),
        rp: {
          id: 'aegis.local',
          name: 'Aegis Vault Hardware Key',
        },
        user: {
          id: SecurityModule.generatePasskeyData().user_handle,
          name,
          displayName: name,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 180000,
        attestation: 'direct',
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          residentKey: 'discouraged',
          userVerification: 'required',
        },
      });

      const result = await NativePasskeyModule.createPasskey(requestJson);
      const registration = JSON.parse(result.registrationResponseJson || '{}');
      const credentialId =
        SecurityModule.sanitizeBase64Url(registration?.id || registration?.rawId || '');
      if (!credentialId) {
        throw new Error('Hardware key credential ID was not returned by native bridge.');
      }

      const key: HardwareKey = {
        id: credentialId,
        name,
        publicKey: `${registration?.response?.publicKey || registration?.response?.publicKeyPem || ''}`,
        counter: 0,
        addedAt: new Date().toISOString(),
        interface: detectInterface(registration?.response?.transports),
      };

      const all = await this.listKeys();
      const merged = [...all.filter(k => k.id !== key.id), key];
      await RNFS.writeFile(KEYS_FILE, JSON.stringify(merged), 'utf8');

      await SecurityModule.logSecurityEvent('hardware_key_registered', 'success', {
        name,
        keyId: key.id,
      });
      return key;
    } catch (e) {
      await SecurityModule.logSecurityEvent('hardware_key_registered', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error('[HardwareKey] Registration error:', e);
      return null;
    }
  }

  static async verifyKey(keyId: string, challenge: string): Promise<boolean> {
    try {
      if (!NativePasskeyModule?.authenticatePasskey) {
        throw new Error('Hardware key authentication bridge is unavailable.');
      }
      const key = (await this.listKeys()).find(k => k.id === keyId);
      if (!key) {
        throw new Error('Hardware key is not registered on this device.');
      }

      const requestJson = JSON.stringify({
        challenge: resolveChallenge(challenge),
        rpId: 'aegis.local',
        timeout: 180000,
        userVerification: 'required',
        allowCredentials: [
          {
            id: SecurityModule.sanitizeBase64Url(key.id),
            type: 'public-key',
            transports: ['nfc', 'usb', 'ble'],
          },
        ],
      });

      const result = await NativePasskeyModule.authenticatePasskey(requestJson);
      const assertion = JSON.parse(result.authenticationResponseJson || '{}');
      const assertionId = SecurityModule.sanitizeBase64Url(
        assertion?.id || assertion?.rawId || '',
      );

      const ok = assertionId === SecurityModule.sanitizeBase64Url(keyId);
      if (!ok) {
        await SecurityModule.logSecurityEvent('hardware_key_verify', 'failed', {
          keyId,
          reason: 'credential_id_mismatch',
        });
        return false;
      }

      const all = await this.listKeys();
      const updated = all.map(item =>
        item.id === key.id ? { ...item, counter: item.counter + 1 } : item,
      );
      await RNFS.writeFile(KEYS_FILE, JSON.stringify(updated), 'utf8');

      await SecurityModule.logSecurityEvent('hardware_key_verify', 'success', {
        keyId,
      });
      return true;
    } catch (e) {
      await SecurityModule.logSecurityEvent('hardware_key_verify', 'failed', {
        keyId,
        reason: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  static async listKeys(): Promise<HardwareKey[]> {
    try {
      if (!(await RNFS.exists(KEYS_FILE))) return [];
      const raw = await RNFS.readFile(KEYS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as HardwareKey[]) : [];
    } catch {
      return [];
    }
  }

  static async isNfcAvailable(): Promise<boolean> {
    if (Platform.OS === 'ios') return true;
    if (HardwareKeyBridge?.isNfcAvailable) {
      return Boolean(await HardwareKeyBridge.isNfcAvailable());
    }
    if (NativePasskeyModule?.isAvailable) {
      return Boolean(await NativePasskeyModule.isAvailable());
    }
    return false;
  }
}
