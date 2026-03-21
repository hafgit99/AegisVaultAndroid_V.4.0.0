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
});
