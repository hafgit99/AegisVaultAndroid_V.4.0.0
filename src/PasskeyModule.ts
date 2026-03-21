import { NativeModules, Platform } from 'react-native';
import { SecurityModule } from './SecurityModule';
import {
  PasskeyAuthenticationOptionsResponse,
  PasskeyPublicKeyCredentialDescriptor,
  PasskeyRegistrationOptionsResponse,
} from './PasskeyRpApi';

const { PasskeyModule: NativePasskeyModule } = NativeModules;

export interface PasskeyRegistrationResult {
  registrationResponseJson: string;
}

export interface PasskeyAuthenticationResult {
  authenticationResponseJson: string;
}

const resolveChallenge = (challenge?: string): string => {
  if (challenge && challenge.trim()) {
    return SecurityModule.sanitizeBase64Url(challenge);
  }

  // Local-only fallback for offline helper mode. Full production WebAuthn
  // should provide a relying-party challenge from the server.
  return SecurityModule.generatePasskeyData().credential_id || '';
};

const normalizeCredentialDescriptor = (
  descriptor: PasskeyPublicKeyCredentialDescriptor,
): PasskeyPublicKeyCredentialDescriptor => ({
  id: SecurityModule.sanitizeBase64Url(descriptor.id),
  type: 'public-key',
  transports: Array.isArray(descriptor.transports)
    ? descriptor.transports.map((transport) => `${transport}`.toLowerCase())
    : undefined,
});

const requireNativeModule = () => {
  if (Platform.OS !== 'android' || !NativePasskeyModule) {
    throw new Error('Android passkey integration is not available on this build.');
  }
  return NativePasskeyModule;
};

export const PasskeyModule = {
  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'android' || !NativePasskeyModule) {
      return false;
    }
    return Boolean(await NativePasskeyModule.isAvailable());
  },

  async createPasskey(
    requestJson: string,
  ): Promise<PasskeyRegistrationResult> {
    const module = requireNativeModule();
    return module.createPasskey(requestJson);
  },

  async authenticatePasskey(
    requestJson: string,
  ): Promise<PasskeyAuthenticationResult> {
    const module = requireNativeModule();
    return module.authenticatePasskey(requestJson);
  },

  buildRegistrationRequest(input: {
    title: string;
    username: string;
    url: string;
    rpId?: string;
    displayName?: string;
    userHandle?: string;
    challenge?: string;
  }): string {
    const generated = SecurityModule.generatePasskeyData({
      username: input.username,
      url: input.url,
      rpId: input.rpId,
      displayName: input.displayName,
    });

    return JSON.stringify({
      challenge: resolveChallenge(input.challenge),
      rp: {
        id: generated.rp_id,
        name: input.title || generated.rp_id,
      },
      user: {
        id: input.userHandle || generated.user_handle,
        name: input.username,
        displayName:
          input.displayName || generated.display_name || input.username,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 180000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'preferred',
      },
    });
  },

  buildAuthenticationRequest(input: {
    url: string;
    rpId?: string;
    credentialId: string;
    transport?: string;
    challenge?: string;
  }): string {
    const rpId = SecurityModule.normalizePasskeyRpId(input.url, input.rpId);
    return JSON.stringify({
      challenge: resolveChallenge(input.challenge),
      rpId,
      timeout: 180000,
      userVerification: 'preferred',
      allowCredentials: [
        {
          id: SecurityModule.sanitizeBase64Url(input.credentialId),
          type: 'public-key',
          transports: [input.transport || 'internal'],
        },
      ],
    });
  },

  buildRegistrationRequestFromServer(
    response: PasskeyRegistrationOptionsResponse,
  ): string {
    if (!response?.requestId || !response?.publicKey?.challenge) {
      throw new Error('Invalid passkey registration options from server');
    }

    const publicKey = response.publicKey;
    if (!publicKey.rp?.id || !publicKey.user?.id || !publicKey.user?.name) {
      throw new Error('Registration options are missing RP or user fields');
    }

    return JSON.stringify({
      challenge: resolveChallenge(publicKey.challenge),
      rp: publicKey.rp,
      user: {
        id: SecurityModule.sanitizeBase64Url(publicKey.user.id),
        name: publicKey.user.name,
        displayName: publicKey.user.displayName,
      },
      pubKeyCredParams: publicKey.pubKeyCredParams || [
        { type: 'public-key', alg: -7 },
      ],
      timeout: publicKey.timeout || 180000,
      attestation: publicKey.attestation || 'none',
      authenticatorSelection: publicKey.authenticatorSelection || {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'preferred',
      },
      excludeCredentials: (publicKey.excludeCredentials || []).map(
        normalizeCredentialDescriptor,
      ),
    });
  },

  buildAuthenticationRequestFromServer(
    response: PasskeyAuthenticationOptionsResponse,
  ): string {
    if (!response?.requestId || !response?.publicKey?.challenge) {
      throw new Error('Invalid passkey authentication options from server');
    }

    const publicKey = response.publicKey;
    if (!publicKey.rpId) {
      throw new Error('Authentication options are missing RP ID');
    }

    return JSON.stringify({
      challenge: resolveChallenge(publicKey.challenge),
      rpId: publicKey.rpId,
      timeout: publicKey.timeout || 180000,
      userVerification: publicKey.userVerification || 'preferred',
      allowCredentials: (publicKey.allowCredentials || []).map(
        normalizeCredentialDescriptor,
      ),
    });
  },
};
