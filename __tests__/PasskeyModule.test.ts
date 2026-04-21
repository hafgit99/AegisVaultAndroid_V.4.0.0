jest.mock('react-native', () => ({
  NativeModules: {
    PasskeyModule: {
      isAvailable: jest.fn().mockResolvedValue(true),
      createPasskey: jest.fn(),
      authenticatePasskey: jest.fn(),
    },
  },
  Platform: {
    OS: 'android',
    Version: 34,
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    generatePasskeyData: jest.fn((input?: any) => ({
      rp_id: input?.rpId || 'example.com',
      credential_id: 'LOCAL_GENERATED_CHALLENGE',
      user_handle: 'LOCAL_USER_HANDLE',
      display_name: input?.displayName || 'Device passkey',
      transport: 'internal',
      algorithm: 'ES256',
    })),
    sanitizeBase64Url: jest.fn((value: string) =>
      value.replace(/[^A-Za-z0-9\-_]/g, ''),
    ),
    normalizePasskeyRpId: jest.fn((url: string, rpId?: string) =>
      rpId || new URL(url).hostname,
    ),
  },
}));

import { PasskeyModule } from '../src/PasskeyModule';

describe('PasskeyModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { NativeModules, Platform } = require('react-native');
    Platform.OS = 'android';
    NativeModules.PasskeyModule.isAvailable.mockReset();
    NativeModules.PasskeyModule.isAvailable.mockResolvedValue(true);
    NativeModules.PasskeyModule.createPasskey.mockReset();
    NativeModules.PasskeyModule.authenticatePasskey.mockReset();
  });

  test('isAvailable returns false when native bridge reports unavailable', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.PasskeyModule.isAvailable.mockResolvedValueOnce(false);

    await expect(PasskeyModule.isAvailable()).resolves.toBe(false);
  });

  test('isAvailable returns false when platform is not android', async () => {
    const { Platform } = require('react-native');
    Platform.OS = 'ios';

    await expect(PasskeyModule.isAvailable()).resolves.toBe(false);
  });

  test('createPasskey rejects when native module is unavailable', async () => {
    const { Platform } = require('react-native');
    Platform.OS = 'ios';

    await expect(PasskeyModule.createPasskey('{}')).rejects.toThrow(
      'Android passkey integration is not available on this build.',
    );
  });

  test('authenticatePasskey delegates to native module', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.PasskeyModule.authenticatePasskey.mockResolvedValueOnce({
      authenticationResponseJson: '{"ok":true}',
    });

    await expect(PasskeyModule.authenticatePasskey('{"challenge":"x"}')).resolves.toEqual({
      authenticationResponseJson: '{"ok":true}',
    });
    expect(NativeModules.PasskeyModule.authenticatePasskey).toHaveBeenCalledWith(
      '{"challenge":"x"}',
    );
  });

  test('createPasskey delegates to native module', async () => {
    const { NativeModules } = require('react-native');
    NativeModules.PasskeyModule.createPasskey.mockResolvedValueOnce({
      registrationResponseJson: '{"ok":true}',
    });

    await expect(PasskeyModule.createPasskey('{"challenge":"x"}')).resolves.toEqual({
      registrationResponseJson: '{"ok":true}',
    });
    expect(NativeModules.PasskeyModule.createPasskey).toHaveBeenCalledWith(
      '{"challenge":"x"}',
    );
  });

  test('buildRegistrationRequest prefers server-provided challenge when available', () => {
    const request = JSON.parse(
      PasskeyModule.buildRegistrationRequest({
        title: 'Example',
        username: 'user@example.com',
        url: 'https://example.com',
        challenge: 'SERVER_CHALLENGE-_123',
      }),
    );

    expect(request.challenge).toBe('SERVER_CHALLENGE-_123');
    expect(request.rp.id).toBe('example.com');
    expect(request.user.id).toBe('LOCAL_USER_HANDLE');
  });

  test('buildRegistrationRequest falls back to local helper challenge and display defaults', () => {
    const request = JSON.parse(
      PasskeyModule.buildRegistrationRequest({
        title: '',
        username: 'user@example.com',
        url: 'https://example.com',
      }),
    );

    expect(request.challenge).toBe('LOCAL_GENERATED_CHALLENGE');
    expect(request.rp.name).toBe('example.com');
    expect(request.user.displayName).toBe('Device passkey');
  });

  test('buildAuthenticationRequest falls back to local helper challenge when server challenge is missing', () => {
    const request = JSON.parse(
      PasskeyModule.buildAuthenticationRequest({
        url: 'https://accounts.example.com/login',
        credentialId: 'CREDENTIAL_123',
      }),
    );

    expect(request.challenge).toBe('LOCAL_GENERATED_CHALLENGE');
    expect(request.rpId).toBe('accounts.example.com');
    expect(request.allowCredentials[0].id).toBe('CREDENTIAL_123');
  });

  test('buildAuthenticationRequest sanitizes credential ids and defaults transport to internal', () => {
    const request = JSON.parse(
      PasskeyModule.buildAuthenticationRequest({
        url: 'https://accounts.example.com/login',
        credentialId: 'CRED+/=123',
      }),
    );

    expect(request.allowCredentials[0]).toEqual({
      id: 'CRED123',
      type: 'public-key',
      transports: ['internal'],
    });
  });

  test('buildAuthenticationRequest preserves explicit transport and server challenge', () => {
    const request = JSON.parse(
      PasskeyModule.buildAuthenticationRequest({
        url: 'https://accounts.example.com/login',
        rpId: 'custom.example.com',
        credentialId: 'CRED123',
        transport: 'USB',
        challenge: 'SERVER+/=CHALLENGE',
      }),
    );

    expect(request).toEqual({
      challenge: 'SERVERCHALLENGE',
      rpId: 'custom.example.com',
      timeout: 180000,
      userVerification: 'preferred',
      allowCredentials: [
        {
          id: 'CRED123',
          type: 'public-key',
          transports: ['USB'],
        },
      ],
    });
  });

  test('buildRegistrationRequestFromServer maps server WebAuthn options into native request JSON', () => {
    const request = JSON.parse(
      PasskeyModule.buildRegistrationRequestFromServer({
        requestId: 'req_reg_1',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rp: { id: 'example.com', name: 'Example' },
          user: {
            id: 'SERVER_USER_ID',
            name: 'user@example.com',
            displayName: 'User Example',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          excludeCredentials: [
            { id: 'CREDENTIAL+/=', type: 'public-key', transports: ['INTERNAL'] },
          ],
        },
      }),
    );

    expect(request.challenge).toBe('SERVER_CHALLENGE');
    expect(request.user.id).toBe('SERVER_USER_ID');
    expect(request.excludeCredentials[0].id).toBe('CREDENTIAL');
    expect(request.excludeCredentials[0].transports).toEqual(['internal']);
  });

  test('buildRegistrationRequestFromServer applies secure defaults when optional fields are omitted', () => {
    const request = JSON.parse(
      PasskeyModule.buildRegistrationRequestFromServer({
        requestId: 'req_reg_2',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rp: { id: 'example.com', name: 'Example' },
          user: {
            id: 'SERVER_USER+/=ID',
            name: 'user@example.com',
            displayName: 'User Example',
          },
          pubKeyCredParams: [],
        },
      }),
    );

    expect(request.user.id).toBe('SERVER_USERID');
    expect(request.timeout).toBe(180000);
    expect(request.attestation).toBe('none');
    expect(request.authenticatorSelection).toEqual({
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'preferred',
    });
  });

  test('buildRegistrationRequestFromServer rejects malformed server payloads', () => {
    expect(() =>
      PasskeyModule.buildRegistrationRequestFromServer({
        requestId: 'req_reg_bad',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rp: { id: '', name: 'Example' },
          user: {
            id: '',
            name: '',
            displayName: 'User Example',
          },
        },
      } as any),
    ).toThrow('Registration options are missing RP or user fields');
  });

  test('buildRegistrationRequestFromServer keeps server supplied timeout and attestation', () => {
    const request = JSON.parse(
      PasskeyModule.buildRegistrationRequestFromServer({
        requestId: 'req_reg_3',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rp: { id: 'example.com', name: 'Example' },
          user: {
            id: 'SERVER_USER_ID',
            name: 'user@example.com',
            displayName: 'User Example',
          },
          timeout: 60000,
          attestation: 'direct',
          authenticatorSelection: {
            authenticatorAttachment: 'cross-platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
          excludeCredentials: [],
        },
      }),
    );

    expect(request.timeout).toBe(60000);
    expect(request.attestation).toBe('direct');
    expect(request.authenticatorSelection).toEqual({
      authenticatorAttachment: 'cross-platform',
      residentKey: 'preferred',
      userVerification: 'required',
    });
  });

  test('buildAuthenticationRequestFromServer rejects malformed server payloads', () => {
    expect(() =>
      PasskeyModule.buildAuthenticationRequestFromServer({
        requestId: 'req_auth_1',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rpId: '',
        },
      } as any),
    ).toThrow('Authentication options are missing RP ID');
  });

  test('buildAuthenticationRequestFromServer normalizes descriptor transports and challenge', () => {
    const request = JSON.parse(
      PasskeyModule.buildAuthenticationRequestFromServer({
        requestId: 'req_auth_2',
        publicKey: {
          challenge: 'SERVER+/=CHALLENGE',
          rpId: 'example.com',
          allowCredentials: [
            { id: 'CRED+/=123', type: 'public-key', transports: ['USB', 'INTERNAL'] },
          ],
        },
      }),
    );

    expect(request.challenge).toBe('SERVERCHALLENGE');
    expect(request.allowCredentials[0]).toEqual({
      id: 'CRED123',
      type: 'public-key',
      transports: ['usb', 'internal'],
    });
    expect(request.userVerification).toBe('preferred');
  });

  test('buildAuthenticationRequestFromServer keeps optional timeout and explicit user verification', () => {
    const request = JSON.parse(
      PasskeyModule.buildAuthenticationRequestFromServer({
        requestId: 'req_auth_3',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rpId: 'example.com',
          timeout: 90000,
          userVerification: 'required',
          allowCredentials: [],
        },
      }),
    );

    expect(request).toEqual({
      challenge: 'SERVER_CHALLENGE',
      rpId: 'example.com',
      timeout: 90000,
      userVerification: 'required',
      allowCredentials: [],
    });
  });
});
