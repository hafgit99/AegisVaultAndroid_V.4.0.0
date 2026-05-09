import {
  normalizeCanonicalCategory,
  toCanonicalVaultRecord,
} from '../src/compat/CanonicalVaultSchema';
import { VaultItem } from '../src/SecurityModule';

describe('CanonicalVaultSchema', () => {
  test('normalizes desktop v5 canonical categories', () => {
    expect(normalizeCanonicalCategory('crypto_wallet')).toBe('crypto_wallet');
    expect(normalizeCanonicalCategory('document')).toBe('document');
    expect(normalizeCanonicalCategory('unknown-custom')).toBe('other');
    expect(normalizeCanonicalCategory('')).toBe('login');
  });

  test('maps Android vault items to desktop v5 canonical records', () => {
    const item: VaultItem = {
      id: 42,
      title: 'Example',
      username: 'user@example.com',
      password: 'secret',
      url: 'https://example.com',
      notes: 'private note',
      category: 'passkey',
      favorite: 1,
      data: JSON.stringify({
        tags: ['prod', ' personal ', ''],
        rp_id: 'example.com',
        credential_id: 'cred',
        user_handle: 'handle',
        display_name: 'Example Passkey',
        server_verified: true,
        totp_secret: 'BASE32',
        shared: {
          spaceId: 'family',
          role: 'editor',
          isSensitive: true,
          emergencyAccess: true,
          lastReviewedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
      is_deleted: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };

    expect(toCanonicalVaultRecord(item)).toEqual({
      id: 42,
      title: 'Example',
      username: 'user@example.com',
      url: 'https://example.com',
      category: 'passkey',
      favorite: true,
      tags: ['prod', 'personal'],
      deleted_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      secret: {
        password: 'secret',
        notes: 'private note',
        totp: {
          secret: 'BASE32',
          issuer: undefined,
          algorithm: undefined,
          digits: undefined,
          period: undefined,
        },
      },
      passkey: {
        rp_id: 'example.com',
        origin: undefined,
        credential_id: 'cred',
        user_handle: 'handle',
        display_name: 'Example Passkey',
        transport: undefined,
        authenticator_attachment: undefined,
        algorithm: undefined,
        mode: undefined,
        server_verified: true,
        created_at: undefined,
        last_registration_at: undefined,
        last_auth_at: undefined,
      },
      sharing: [
        {
          space_id: 'family',
          role: 'editor',
          shared_by: undefined,
          is_sensitive: true,
          emergency_access: true,
          notes: undefined,
          last_reviewed_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      custom_data: {
        tags: ['prod', ' personal ', ''],
        rp_id: 'example.com',
        credential_id: 'cred',
        user_handle: 'handle',
        display_name: 'Example Passkey',
        server_verified: true,
      },
    });
  });

  test('preserves crypto wallet and document categories for desktop v5', () => {
    const wallet = toCanonicalVaultRecord({
      id: 7,
      title: 'Cold wallet',
      username: '',
      password: 'seed phrase',
      url: '',
      notes: 'watch-only unless secret is present',
      category: 'crypto_wallet',
      favorite: 0,
      is_deleted: 0,
      data: JSON.stringify({
        network: 'Bitcoin',
        address: 'bc1qexample',
        derivation_path: "m/84'/0'/0'/0/0",
      }),
    });
    const document = toCanonicalVaultRecord({
      id: 8,
      title: 'Passport',
      username: '',
      password: '',
      url: '',
      notes: 'travel',
      category: 'document',
      favorite: 1,
      is_deleted: 0,
      data: JSON.stringify({
        document_type: 'passport',
        document_number: 'A123',
        issuer: 'Gov',
        expires_at: '2030-01-01',
      }),
    });

    expect(wallet.category).toBe('crypto_wallet');
    expect(wallet.secret?.password).toBe('seed phrase');
    expect(wallet.custom_data).toEqual({
      network: 'Bitcoin',
      address: 'bc1qexample',
      derivation_path: "m/84'/0'/0'/0/0",
    });
    expect(document.category).toBe('document');
    expect(document.favorite).toBe(true);
    expect(document.custom_data).toEqual({
      document_type: 'passport',
      document_number: 'A123',
      issuer: 'Gov',
      expires_at: '2030-01-01',
    });
  });
});
