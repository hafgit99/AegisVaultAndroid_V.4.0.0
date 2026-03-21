export interface PasskeyPublicKeyCredentialDescriptor {
  id: string;
  type: 'public-key';
  transports?: string[];
}

export interface PasskeyRegistrationOptions {
  challenge: string;
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  timeout?: number;
  attestation?: 'none' | 'direct' | 'indirect' | 'enterprise';
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'required' | 'preferred' | 'discouraged';
  };
  excludeCredentials?: PasskeyPublicKeyCredentialDescriptor[];
}

export interface PasskeyAuthenticationOptions {
  challenge: string;
  rpId: string;
  timeout?: number;
  userVerification?: 'required' | 'preferred' | 'discouraged';
  allowCredentials?: PasskeyPublicKeyCredentialDescriptor[];
}

export interface PasskeyRegistrationOptionsResponse {
  requestId: string;
  publicKey: PasskeyRegistrationOptions;
}

export interface PasskeyAuthenticationOptionsResponse {
  requestId: string;
  publicKey: PasskeyAuthenticationOptions;
}

export interface PasskeyVerificationResponse {
  verified: boolean;
  credentialId?: string;
  rpId?: string;
  signCount?: number;
  accountId?: string;
}

interface RequestOptions {
  baseUrl: string;
  authToken?: string;
  headers?: Record<string, string>;
}

const buildHeaders = (
  authToken?: string,
  headers?: Record<string, string>,
): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  ...(headers || {}),
});

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Passkey RP API request failed: ${response.status} ${errorText || response.statusText}`.trim(),
    );
  }

  return (await response.json()) as T;
};

export const PasskeyRpApi = {
  async getRegistrationOptions(
    request: Record<string, any>,
    options: RequestOptions,
  ): Promise<PasskeyRegistrationOptionsResponse> {
    const response = await fetch(
      `${options.baseUrl}/api/webauthn/passkeys/register/options`,
      {
        method: 'POST',
        headers: buildHeaders(options.authToken, options.headers),
        body: JSON.stringify(request),
      },
    );

    return parseJsonResponse<PasskeyRegistrationOptionsResponse>(response);
  },

  async verifyRegistration(
    request: Record<string, any>,
    options: RequestOptions,
  ): Promise<PasskeyVerificationResponse> {
    const response = await fetch(
      `${options.baseUrl}/api/webauthn/passkeys/register/verify`,
      {
        method: 'POST',
        headers: buildHeaders(options.authToken, options.headers),
        body: JSON.stringify(request),
      },
    );

    return parseJsonResponse<PasskeyVerificationResponse>(response);
  },

  async getAuthenticationOptions(
    request: Record<string, any>,
    options: RequestOptions,
  ): Promise<PasskeyAuthenticationOptionsResponse> {
    const response = await fetch(
      `${options.baseUrl}/api/webauthn/passkeys/auth/options`,
      {
        method: 'POST',
        headers: buildHeaders(options.authToken, options.headers),
        body: JSON.stringify(request),
      },
    );

    return parseJsonResponse<PasskeyAuthenticationOptionsResponse>(response);
  },

  async verifyAuthentication(
    request: Record<string, any>,
    options: RequestOptions,
  ): Promise<PasskeyVerificationResponse> {
    const response = await fetch(
      `${options.baseUrl}/api/webauthn/passkeys/auth/verify`,
      {
        method: 'POST',
        headers: buildHeaders(options.authToken, options.headers),
        body: JSON.stringify(request),
      },
    );

    return parseJsonResponse<PasskeyVerificationResponse>(response);
  },
};
