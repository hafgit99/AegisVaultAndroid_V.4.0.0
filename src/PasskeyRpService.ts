import { PasskeyModule } from './PasskeyModule';
import { PasskeyRpApi } from './PasskeyRpApi';
import { SecureAppSettings } from './SecureAppSettings';
import { SecurityModule } from './SecurityModule';

interface BackendRequestOptions {
  baseUrl: string;
  authToken?: string;
  headers?: Record<string, string>;
}

interface RegistrationInput {
  title: string;
  username: string;
  url: string;
  rpId?: string;
  displayName?: string;
  deviceLabel?: string;
}

interface AuthenticationInput {
  url: string;
  rpId?: string;
  credentialId: string;
  transport?: string;
}

const sanitizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

const resolveRequestOptions = (): BackendRequestOptions & { accountId: string } => {
  const settings = SecureAppSettings.get().passkeyRp;
  const baseUrl = sanitizeBaseUrl(settings.baseUrl || '');
  const accountId = (settings.accountId || '').trim();

  if (!baseUrl) {
    throw new Error('Passkey RP backend URL is required.');
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error('Passkey RP backend URL must start with http:// or https://.');
  }
  if (!accountId) {
    throw new Error('Passkey RP account ID is required.');
  }

  const headers: Record<string, string> = {};
  const headerName = (settings.tenantHeaderName || '').trim();
  const headerValue = (settings.tenantHeaderValue || '').trim();
  if (headerName && headerValue) {
    headers[headerName] = headerValue;
  }

  return {
    baseUrl,
    accountId,
    authToken: (settings.authToken || '').trim() || undefined,
    headers: Object.keys(headers).length ? headers : undefined,
  };
};

export const PasskeyRpService = {
  getConfigurationSummary() {
    const settings = SecureAppSettings.get().passkeyRp;
    const baseUrl = sanitizeBaseUrl(settings.baseUrl || '');
    const accountId = (settings.accountId || '').trim();
    const configured = Boolean(baseUrl && accountId);

    return {
      configured,
      baseUrl,
      accountId,
      hasAuthToken: Boolean((settings.authToken || '').trim()),
      hasTenantHeader: Boolean(
        (settings.tenantHeaderName || '').trim() &&
          (settings.tenantHeaderValue || '').trim(),
      ),
    };
  },

  async enrollWithBackend(input: RegistrationInput) {
    const requestOptions = resolveRequestOptions();
    const username = input.username.trim();
    const rpId = SecurityModule.normalizePasskeyRpId(input.url, input.rpId);
    const displayName =
      (input.displayName || '').trim() || username || rpId || 'Aegis Vault';

    if (!username || !rpId) {
      throw new Error('Username and RP ID are required for backend passkey enrollment.');
    }

    const available = await PasskeyModule.isAvailable();
    if (!available) {
      throw new Error('Android passkey integration is not available on this build.');
    }

    const options = await PasskeyRpApi.getRegistrationOptions(
      {
        accountId: requestOptions.accountId,
        username,
        displayName,
        rpId,
        deviceLabel: (input.deviceLabel || '').trim() || undefined,
      },
      requestOptions,
    );

    const nativeRequest = PasskeyModule.buildRegistrationRequestFromServer(options);
    const nativeResult = await PasskeyModule.createPasskey(nativeRequest);
    const verification = await PasskeyRpApi.verifyRegistration(
      {
        requestId: options.requestId,
        credentialResponseJson: nativeResult.registrationResponseJson,
        deviceLabel: (input.deviceLabel || '').trim() || undefined,
      },
      requestOptions,
    );

    if (!verification.verified) {
      throw new Error('Backend passkey registration could not be verified.');
    }

    const parsed = SecurityModule.parsePasskeyPayload(
      nativeResult.registrationResponseJson,
      {
        url: input.url,
        rpId,
        username,
      },
    );
    const now = new Date().toISOString();

    return {
      dataPatch: {
        ...parsed.normalized,
        rp_id: verification.rpId || parsed.normalized.rp_id || rpId,
        credential_id:
          verification.credentialId || parsed.normalized.credential_id,
        display_name: parsed.normalized.display_name || displayName,
        mode: 'rp_connected' as const,
        challenge_source: 'server' as const,
        server_verified: true,
        last_registration_at: now,
        registration_request_id: options.requestId,
        registration_response_json: nativeResult.registrationResponseJson,
      },
      verification,
    };
  },

  async authenticateWithBackend(input: AuthenticationInput) {
    const requestOptions = resolveRequestOptions();
    const rpId = SecurityModule.normalizePasskeyRpId(input.url, input.rpId);
    const credentialId = SecurityModule.sanitizeBase64Url(input.credentialId);

    if (!rpId || !credentialId) {
      throw new Error('RP ID and credential ID are required for backend authentication.');
    }

    const available = await PasskeyModule.isAvailable();
    if (!available) {
      throw new Error('Android passkey integration is not available on this build.');
    }

    const options = await PasskeyRpApi.getAuthenticationOptions(
      {
        accountId: requestOptions.accountId,
        rpId,
        credentialId,
      },
      requestOptions,
    );

    const nativeRequest =
      PasskeyModule.buildAuthenticationRequestFromServer(options);
    const nativeResult = await PasskeyModule.authenticatePasskey(nativeRequest);
    const verification = await PasskeyRpApi.verifyAuthentication(
      {
        requestId: options.requestId,
        credentialResponseJson: nativeResult.authenticationResponseJson,
      },
      requestOptions,
    );

    if (!verification.verified) {
      throw new Error('Backend passkey authentication could not be verified.');
    }

    return {
      dataPatch: {
        credential_id: verification.credentialId || credentialId,
        rp_id: verification.rpId || rpId,
        transport: input.transport || 'internal',
        mode: 'rp_connected' as const,
        challenge_source: 'server' as const,
        server_verified: true,
        last_auth_at: new Date().toISOString(),
        authentication_request_id: options.requestId,
        authentication_response_json: nativeResult.authenticationResponseJson,
      },
      verification,
    };
  },
};
