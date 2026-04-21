import { PasskeyRpApi } from '../src/PasskeyRpApi';

describe('PasskeyRpApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  test('getRegistrationOptions posts JSON to registration options endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'req_reg_1',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rp: { id: 'example.com', name: 'Example' },
          user: {
            id: 'USER_ID',
            name: 'user@example.com',
            displayName: 'User',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        },
      }),
    });

    const result = await PasskeyRpApi.getRegistrationOptions(
      { accountId: 'acc_1' },
      { baseUrl: 'https://rp.example.com', authToken: 'token-123' },
    );

    expect(result.requestId).toBe('req_reg_1');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://rp.example.com/api/webauthn/passkeys/register/options',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  test('getRegistrationOptions rejects malformed staging contracts', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: '',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
        },
      }),
    });

    await expect(
      PasskeyRpApi.getRegistrationOptions(
        { accountId: 'acc_1' },
        { baseUrl: 'https://rp.example.com' },
      ),
    ).rejects.toThrow('Passkey RP API contract error');
  });

  test('verifyAuthentication throws useful error on non-2xx responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'invalid challenge',
    });

    await expect(
      PasskeyRpApi.verifyAuthentication(
        { requestId: 'req_auth_1' },
        { baseUrl: 'https://rp.example.com' },
      ),
    ).rejects.toThrow('Passkey RP API request failed: 400 invalid challenge');
  });

  test('verifyRegistration forwards custom headers without auth token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        verified: true,
        credentialId: 'cred_1',
      }),
    });

    const result = await PasskeyRpApi.verifyRegistration(
      { requestId: 'req_reg_2' },
      {
        baseUrl: 'https://rp.example.com',
        headers: { 'X-Tenant': 'tenant-1' },
      },
    );

    expect(result.verified).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://rp.example.com/api/webauthn/passkeys/register/verify',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Tenant': 'tenant-1',
        }),
      }),
    );
    expect(
      (global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization,
    ).toBeUndefined();
  });

  test('verifyRegistration validates verification payload shape', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        verified: 'yes',
      }),
    });

    await expect(
      PasskeyRpApi.verifyRegistration(
        { requestId: 'req_reg_2', credentialResponseJson: '{}' },
        {
          baseUrl: 'https://rp.example.com',
        },
      ),
    ).rejects.toThrow('Passkey RP API contract error');
  });

  test('getAuthenticationOptions posts to auth options endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'req_auth_2',
        publicKey: {
          challenge: 'SERVER_CHALLENGE',
          rpId: 'example.com',
        },
      }),
    });

    const result = await PasskeyRpApi.getAuthenticationOptions(
      { accountId: 'acc_2' },
      { baseUrl: 'https://rp.example.com' },
    );

    expect(result.requestId).toBe('req_auth_2');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://rp.example.com/api/webauthn/passkeys/auth/options',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ accountId: 'acc_2' }),
      }),
    );
  });

  test('verifyAuthentication falls back to statusText when response body is empty', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => '',
    });

    await expect(
      PasskeyRpApi.verifyAuthentication(
        { requestId: 'req_auth_3' },
        { baseUrl: 'https://rp.example.com' },
      ),
    ).rejects.toThrow(
      'Passkey RP API request failed: 503 Service Unavailable',
    );
  });

  test('healthCheck hits the backend health endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
    });

    await expect(
      PasskeyRpApi.healthCheck({ baseUrl: 'https://rp.example.com' }),
    ).resolves.toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://rp.example.com/health',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });
});
