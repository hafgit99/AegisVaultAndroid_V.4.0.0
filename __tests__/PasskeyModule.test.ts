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
});
