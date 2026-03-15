import { NativeModules, Platform } from 'react-native';
import { SecurityModule } from './SecurityModule';

const { PasskeyModule: NativePasskeyModule } = NativeModules;

export interface PasskeyRegistrationResult {
  registrationResponseJson: string;
}

export interface PasskeyAuthenticationResult {
  authenticationResponseJson: string;
}

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
  }): string {
    const generated = SecurityModule.generatePasskeyData({
      username: input.username,
      url: input.url,
      rpId: input.rpId,
      displayName: input.displayName,
    });

    return JSON.stringify({
      challenge: SecurityModule.generatePasskeyData().credential_id,
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
  }): string {
    const rpId = SecurityModule.normalizePasskeyRpId(input.url, input.rpId);
    return JSON.stringify({
      challenge: SecurityModule.generatePasskeyData().credential_id,
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
};
