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

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ensureString = (
  value: unknown,
  fieldName: string,
  options?: { allowEmpty?: boolean },
): string => {
  if (typeof value !== 'string') {
    throw new Error(`Passkey RP API contract error: ${fieldName} must be a string.`);
  }
  if (!options?.allowEmpty && !value.trim()) {
    throw new Error(`Passkey RP API contract error: ${fieldName} is required.`);
  }
  return value;
};

const ensureBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`Passkey RP API contract error: ${fieldName} must be a boolean.`);
  }
  return value;
};

const ensureOptionalNumber = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Passkey RP API contract error: ${fieldName} must be a number.`);
  }
  return value;
};

const normalizeRegistrationOptionsResponse = (
  payload: unknown,
): PasskeyRegistrationOptionsResponse => {
  if (!isObject(payload) || !isObject(payload.publicKey)) {
    throw new Error('Passkey RP API contract error: registration options response is malformed.');
  }

  const publicKey = payload.publicKey;
  if (!isObject(publicKey.rp) || !isObject(publicKey.user)) {
    throw new Error('Passkey RP API contract error: registration options are missing rp/user.');
  }

  return {
    requestId: ensureString(payload.requestId, 'requestId'),
    publicKey: {
      challenge: ensureString(publicKey.challenge, 'publicKey.challenge'),
      rp: {
        id: ensureString(publicKey.rp.id, 'publicKey.rp.id'),
        name: ensureString(publicKey.rp.name, 'publicKey.rp.name'),
      },
      user: {
        id: ensureString(publicKey.user.id, 'publicKey.user.id'),
        name: ensureString(publicKey.user.name, 'publicKey.user.name'),
        displayName: ensureString(
          publicKey.user.displayName,
          'publicKey.user.displayName',
        ),
      },
      pubKeyCredParams: Array.isArray(publicKey.pubKeyCredParams)
        ? publicKey.pubKeyCredParams
        : [],
      timeout: ensureOptionalNumber(publicKey.timeout, 'publicKey.timeout'),
      attestation: publicKey.attestation,
      authenticatorSelection: publicKey.authenticatorSelection,
      excludeCredentials: Array.isArray(publicKey.excludeCredentials)
        ? publicKey.excludeCredentials
        : [],
    },
  };
};

const normalizeAuthenticationOptionsResponse = (
  payload: unknown,
): PasskeyAuthenticationOptionsResponse => {
  if (!isObject(payload) || !isObject(payload.publicKey)) {
    throw new Error('Passkey RP API contract error: authentication options response is malformed.');
  }

  const publicKey = payload.publicKey;
  return {
    requestId: ensureString(payload.requestId, 'requestId'),
    publicKey: {
      challenge: ensureString(publicKey.challenge, 'publicKey.challenge'),
      rpId: ensureString(publicKey.rpId, 'publicKey.rpId'),
      timeout: ensureOptionalNumber(publicKey.timeout, 'publicKey.timeout'),
      userVerification: publicKey.userVerification,
      allowCredentials: Array.isArray(publicKey.allowCredentials)
        ? publicKey.allowCredentials
        : [],
    },
  };
};

const normalizeVerificationResponse = (
  payload: unknown,
): PasskeyVerificationResponse => {
  if (!isObject(payload)) {
    throw new Error('Passkey RP API contract error: verification response is malformed.');
  }

  return {
    verified: ensureBoolean(payload.verified, 'verified'),
    credentialId:
      payload.credentialId === undefined
        ? undefined
        : ensureString(payload.credentialId, 'credentialId'),
    rpId:
      payload.rpId === undefined
        ? undefined
        : ensureString(payload.rpId, 'rpId'),
    signCount: ensureOptionalNumber(payload.signCount, 'signCount'),
    accountId:
      payload.accountId === undefined
        ? undefined
        : ensureString(payload.accountId, 'accountId'),
  };
};

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
  async healthCheck(options: RequestOptions): Promise<boolean> {
    const response = await fetch(`${options.baseUrl}/health`, {
      method: 'GET',
      headers: {
        ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    return response.ok;
  },

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

    return normalizeRegistrationOptionsResponse(
      await parseJsonResponse<PasskeyRegistrationOptionsResponse>(response),
    );
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

    return normalizeVerificationResponse(
      await parseJsonResponse<PasskeyVerificationResponse>(response),
    );
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

    return normalizeAuthenticationOptionsResponse(
      await parseJsonResponse<PasskeyAuthenticationOptionsResponse>(response),
    );
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

    return normalizeVerificationResponse(
      await parseJsonResponse<PasskeyVerificationResponse>(response),
    );
  },
};
