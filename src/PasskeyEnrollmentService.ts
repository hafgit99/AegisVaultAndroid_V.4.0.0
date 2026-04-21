import { PasskeyBindingService } from './PasskeyBindingService';
import { PasskeyModule } from './PasskeyModule';
import { SecurityModule } from './SecurityModule';

export interface PasskeyEnrollmentInput {
  username: string;
  rpId: string;
  displayName?: string;
  deviceLabel?: string;
}

export interface PasskeyEnrollmentResult {
  credentialId: string;
  rpId: string;
  displayName: string;
  createdAt: string;
}

const normalizeRpId = (rpId: string): string =>
  SecurityModule.normalizePasskeyRpId(`https://${rpId.trim()}`, rpId.trim());

const sanitizeCredentialId = (registrationJson: string): string => {
  const parsed = JSON.parse(registrationJson || '{}');
  return SecurityModule.sanitizeBase64Url(parsed?.id || parsed?.rawId || '');
};

export const PasskeyEnrollmentService = {
  async enrollDevicePasskey(
    input: PasskeyEnrollmentInput,
  ): Promise<PasskeyEnrollmentResult> {
    const username = input.username.trim();
    const rpId = normalizeRpId(input.rpId);
    const displayName =
      (input.displayName || '').trim() || username || rpId || 'Aegis Vault';

    if (!username || !rpId) {
      throw new Error('Username and RP ID are required for passkey enrollment.');
    }

    const available = await PasskeyModule.isAvailable();
    if (!available) {
      throw new Error(
        'Android passkey integration is not available on this build.',
      );
    }

    const requestJson = PasskeyModule.buildRegistrationRequest({
      title: 'Aegis Vault',
      username,
      url: `https://${rpId}`,
      rpId,
      displayName,
    });

    const result = await PasskeyModule.createPasskey(requestJson);
    const credentialId = sanitizeCredentialId(result.registrationResponseJson);
    if (!credentialId) {
      throw new Error(
        'Native passkey provider did not return a credential ID.',
      );
    }

    const encrypted = await SecurityModule.encryptAES256GCM(
      result.registrationResponseJson,
      `${rpId}:${credentialId}`,
    );
    const createdAt = new Date().toISOString();

    await PasskeyBindingService.loadAllBindings(SecurityModule.db);
    await PasskeyBindingService.saveBinding(
      {
        credentialId,
        encryptedPayload: JSON.stringify(encrypted),
        prfSalt: encrypted.salt,
        meta: {
          createdAt,
          lastUsedAt: createdAt,
          version: 1,
          deviceLabel: (input.deviceLabel || '').trim() || undefined,
        },
        eventLog: [],
      },
      SecurityModule.db,
    );

    await SecurityModule.logSecurityEvent(
      'passkey_binding_enrolled',
      'success',
      {
        credentialId,
        rpId,
      },
    );

    return {
      credentialId,
      rpId,
      displayName,
      createdAt,
    };
  },
};
