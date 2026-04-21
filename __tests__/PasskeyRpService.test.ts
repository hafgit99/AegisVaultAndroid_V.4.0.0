jest.mock('../src/PasskeyModule', () => ({
  PasskeyModule: {
    isAvailable: jest.fn(),
    buildRegistrationRequestFromServer: jest.fn(),
    buildAuthenticationRequestFromServer: jest.fn(),
    createPasskey: jest.fn(),
    authenticatePasskey: jest.fn(),
  },
}));

jest.mock('../src/PasskeyRpApi', () => ({
  PasskeyRpApi: {
    getRegistrationOptions: jest.fn(),
    verifyRegistration: jest.fn(),
    getAuthenticationOptions: jest.fn(),
    verifyAuthentication: jest.fn(),
  },
}));

jest.mock('../src/SecureAppSettings', () => ({
  SecureAppSettings: {
    get: jest.fn(),
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    normalizePasskeyRpId: jest.fn((url: string, rpId?: string) =>
      rpId || new URL(url).hostname,
    ),
    sanitizeBase64Url: jest.fn((value: string) =>
      value.replace(/[^A-Za-z0-9\-_]/g, ''),
    ),
    parsePasskeyPayload: jest.fn(() => ({
      normalized: {
        credential_id: 'cred123',
        rp_id: 'example.com',
        display_name: 'Harun Passkey',
      },
    })),
  },
}));

import { PasskeyModule } from '../src/PasskeyModule';
import { PasskeyRpApi } from '../src/PasskeyRpApi';
import { PasskeyRpService } from '../src/PasskeyRpService';
import { SecureAppSettings } from '../src/SecureAppSettings';

describe('PasskeyRpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      passkeyRp: {
        baseUrl: 'https://rp.example.com',
        accountId: 'acct_123',
        authToken: 'token_abc',
        tenantHeaderName: 'X-Tenant',
        tenantHeaderValue: 'tenant-1',
      },
    });
    (PasskeyModule.isAvailable as jest.Mock).mockResolvedValue(true);
    (PasskeyModule.buildRegistrationRequestFromServer as jest.Mock).mockReturnValue(
      'native-reg-request',
    );
    (PasskeyModule.buildAuthenticationRequestFromServer as jest.Mock).mockReturnValue(
      'native-auth-request',
    );
    (PasskeyModule.createPasskey as jest.Mock).mockResolvedValue({
      registrationResponseJson: JSON.stringify({ id: 'cred123' }),
    });
    (PasskeyModule.authenticatePasskey as jest.Mock).mockResolvedValue({
      authenticationResponseJson: JSON.stringify({ id: 'cred123' }),
    });
  });

  it('registers and verifies a passkey with backend settings', async () => {
    (PasskeyRpApi.getRegistrationOptions as jest.Mock).mockResolvedValue({
      requestId: 'req_reg_1',
      publicKey: {
        challenge: 'challenge',
        rp: { id: 'example.com', name: 'Example' },
        user: {
          id: 'user123',
          name: 'harun@example.com',
          displayName: 'Harun',
        },
      },
    });
    (PasskeyRpApi.verifyRegistration as jest.Mock).mockResolvedValue({
      verified: true,
      credentialId: 'cred123',
      rpId: 'example.com',
    });

    const result = await PasskeyRpService.enrollWithBackend({
      title: 'Aegis',
      username: 'harun@example.com',
      url: 'https://example.com',
      displayName: 'Harun',
    });

    expect(PasskeyRpApi.getRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct_123',
        username: 'harun@example.com',
        rpId: 'example.com',
      }),
      expect.objectContaining({
        baseUrl: 'https://rp.example.com',
        authToken: 'token_abc',
        headers: { 'X-Tenant': 'tenant-1' },
      }),
    );
    expect(PasskeyRpApi.verifyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_reg_1',
        credentialResponseJson: JSON.stringify({ id: 'cred123' }),
      }),
      expect.any(Object),
    );
    expect(result.dataPatch.mode).toBe('rp_connected');
    expect(result.dataPatch.server_verified).toBe(true);
  });

  it('authenticates a passkey against the backend', async () => {
    (PasskeyRpApi.getAuthenticationOptions as jest.Mock).mockResolvedValue({
      requestId: 'req_auth_1',
      publicKey: {
        challenge: 'challenge',
        rpId: 'example.com',
      },
    });
    (PasskeyRpApi.verifyAuthentication as jest.Mock).mockResolvedValue({
      verified: true,
      credentialId: 'cred123',
      rpId: 'example.com',
    });

    const result = await PasskeyRpService.authenticateWithBackend({
      url: 'https://example.com',
      credentialId: 'cred123',
      transport: 'internal',
    });

    expect(PasskeyRpApi.getAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct_123',
        rpId: 'example.com',
        credentialId: 'cred123',
      }),
      expect.any(Object),
    );
    expect(PasskeyRpApi.verifyAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_auth_1',
        credentialResponseJson: JSON.stringify({ id: 'cred123' }),
      }),
      expect.any(Object),
    );
    expect(result.dataPatch.mode).toBe('rp_connected');
    expect(result.dataPatch.challenge_source).toBe('server');
  });

  it('requires backend configuration before proceeding', async () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      passkeyRp: {
        baseUrl: '',
        accountId: '',
      },
    });

    await expect(
      PasskeyRpService.enrollWithBackend({
        title: 'Aegis',
        username: 'harun@example.com',
        url: 'https://example.com',
      }),
    ).rejects.toThrow('Passkey RP backend URL is required.');
  });
});
