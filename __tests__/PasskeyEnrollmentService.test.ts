jest.mock('../src/PasskeyModule', () => ({
  PasskeyModule: {
    isAvailable: jest.fn(),
    buildRegistrationRequest: jest.fn(),
    createPasskey: jest.fn(),
  },
}));

jest.mock('../src/PasskeyBindingService', () => ({
  PasskeyBindingService: {
    loadAllBindings: jest.fn(),
    saveBinding: jest.fn(),
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    db: { execute: jest.fn() },
    normalizePasskeyRpId: jest.fn((_: string, rpId: string) =>
      rpId.toLowerCase(),
    ),
    sanitizeBase64Url: jest.fn((value: string) =>
      value.replace(/[^A-Za-z0-9\-_]/g, ''),
    ),
    encryptAES256GCM: jest.fn().mockResolvedValue({
      salt: 'salt-b64',
      iv: 'iv-b64',
      authTag: 'tag-b64',
      ciphertext: 'cipher-b64',
      kdf: 'Argon2id',
      iterations: 3,
      hashLength: 32,
    }),
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

import { PasskeyBindingService } from '../src/PasskeyBindingService';
import { PasskeyEnrollmentService } from '../src/PasskeyEnrollmentService';
import { PasskeyModule } from '../src/PasskeyModule';
import { SecurityModule } from '../src/SecurityModule';

describe('PasskeyEnrollmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (PasskeyModule.isAvailable as jest.Mock).mockResolvedValue(true);
    (PasskeyModule.buildRegistrationRequest as jest.Mock).mockReturnValue(
      'request-json',
    );
    (PasskeyModule.createPasskey as jest.Mock).mockResolvedValue({
      registrationResponseJson: JSON.stringify({
        id: 'cred+/=123',
        response: {},
      }),
    });
  });

  it('creates a native passkey binding and persists it', async () => {
    const result = await PasskeyEnrollmentService.enrollDevicePasskey({
      username: 'harun@example.com',
      rpId: 'Example.COM',
      displayName: 'Harun Phone Passkey',
      deviceLabel: 'Pixel 8 Pro',
    });

    expect(PasskeyModule.buildRegistrationRequest).toHaveBeenCalledWith({
      title: 'Aegis Vault',
      username: 'harun@example.com',
      url: 'https://example.com',
      rpId: 'example.com',
      displayName: 'Harun Phone Passkey',
    });
    expect(SecurityModule.encryptAES256GCM).toHaveBeenCalledWith(
      expect.any(String),
      'example.com:cred123',
    );
    expect(PasskeyBindingService.saveBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred123',
        prfSalt: 'salt-b64',
        meta: expect.objectContaining({
          version: 1,
          deviceLabel: 'Pixel 8 Pro',
        }),
      }),
      SecurityModule.db,
    );
    expect(result).toEqual(
      expect.objectContaining({
        credentialId: 'cred123',
        rpId: 'example.com',
        displayName: 'Harun Phone Passkey',
      }),
    );
  });

  it('rejects enrollment when native passkey support is unavailable', async () => {
    (PasskeyModule.isAvailable as jest.Mock).mockResolvedValue(false);

    await expect(
      PasskeyEnrollmentService.enrollDevicePasskey({
        username: 'harun@example.com',
        rpId: 'example.com',
      }),
    ).rejects.toThrow(
      'Android passkey integration is not available on this build.',
    );

    expect(PasskeyBindingService.saveBinding).not.toHaveBeenCalled();
  });

  it('rejects enrollment when username or rpId is blank after trimming', async () => {
    await expect(
      PasskeyEnrollmentService.enrollDevicePasskey({
        username: '   ',
        rpId: ' example.com ',
      }),
    ).rejects.toThrow(
      'Username and RP ID are required for passkey enrollment.',
    );

    await expect(
      PasskeyEnrollmentService.enrollDevicePasskey({
        username: 'user@example.com',
        rpId: '   ',
      }),
    ).rejects.toThrow(
      'Username and RP ID are required for passkey enrollment.',
    );

    expect(PasskeyModule.isAvailable).not.toHaveBeenCalled();
  });

  it('falls back to username as display name and omits blank device labels', async () => {
    const result = await PasskeyEnrollmentService.enrollDevicePasskey({
      username: 'harun@example.com',
      rpId: 'Example.COM',
      displayName: '   ',
      deviceLabel: '   ',
    });

    expect(PasskeyModule.buildRegistrationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'harun@example.com',
      }),
    );
    expect(PasskeyBindingService.saveBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          deviceLabel: undefined,
        }),
      }),
      SecurityModule.db,
    );
    expect(result.displayName).toBe('harun@example.com');
  });

  it('rejects enrollment when native registration result has no credential id', async () => {
    (PasskeyModule.createPasskey as jest.Mock).mockResolvedValueOnce({
      registrationResponseJson: JSON.stringify({
        response: {},
      }),
    });

    await expect(
      PasskeyEnrollmentService.enrollDevicePasskey({
        username: 'harun@example.com',
        rpId: 'example.com',
      }),
    ).rejects.toThrow(
      'Native passkey provider did not return a credential ID.',
    );

    expect(SecurityModule.encryptAES256GCM).not.toHaveBeenCalled();
    expect(PasskeyBindingService.saveBinding).not.toHaveBeenCalled();
  });
});
