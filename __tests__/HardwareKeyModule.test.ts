import RNFS from 'react-native-fs';
import { HardwareKeyModule } from '../src/HardwareKeyModule';
import { SecurityModule } from '../src/SecurityModule';
import { NativeModules, Platform } from 'react-native';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    PasskeyModule: {
      isAvailable: jest.fn().mockResolvedValue(true),
      createPasskey: jest.fn().mockResolvedValue({
        registrationResponseJson: JSON.stringify({
          id: 'cred_hw_1',
          response: { transports: ['nfc'], publicKey: 'pk_test_1' },
        }),
      }),
      authenticatePasskey: jest.fn().mockResolvedValue({
        authenticationResponseJson: JSON.stringify({ id: 'cred_hw_1' }),
      }),
    },
    HardwareKeyBridge: {
      isNfcAvailable: jest.fn().mockResolvedValue(true),
    },
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    logSecurityEvent: jest.fn().mockResolvedValue(true),
    sanitizeBase64Url: jest.fn((v: string) => v),
    generatePasskeyData: jest.fn(() => ({
      credential_id: 'challenge_123',
      user_handle: 'user_handle_1',
    })),
  },
}));

describe('HardwareKeyModule Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.readFile as jest.Mock).mockResolvedValue('[]');
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  test('Yeni donanim anahtari native bridge ile kaydedebilmeli', async () => {
    const key = await HardwareKeyModule.registerKey('My YubiKey');

    expect(key).not.toBeNull();
    expect(key?.name).toBe('My YubiKey');
    expect(NativeModules.PasskeyModule.createPasskey).toHaveBeenCalled();
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'hardware_key_registered',
      'success',
      expect.objectContaining({ name: 'My YubiKey' }),
    );
  });

  test('Anahtar dogrulama native assertion ile gerceklesmeli', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify([
        {
          id: 'cred_hw_1',
          name: 'My YubiKey',
          publicKey: 'pk_test_1',
          counter: 0,
          addedAt: new Date().toISOString(),
          interface: 'nfc',
        },
      ]),
    );

    const result = await HardwareKeyModule.verifyKey('cred_hw_1', 'challenge_abc');
    expect(result).toBe(true);
    expect(NativeModules.PasskeyModule.authenticatePasskey).toHaveBeenCalled();
  });

  test('NFC kullanilabilirligini native bridge uzerinden kontrol etmeli', async () => {
    Platform.OS = 'ios';
    expect(await HardwareKeyModule.isNfcAvailable()).toBe(true);

    Platform.OS = 'android';
    expect(await HardwareKeyModule.isNfcAvailable()).toBe(true);
    expect(NativeModules.HardwareKeyBridge.isNfcAvailable).toHaveBeenCalled();
  });
});
