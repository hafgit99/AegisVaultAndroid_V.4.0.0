import { Buffer } from 'buffer';
import { WearSyncCrypto } from '../src/WearSyncCrypto';

jest.mock('react-native-quick-crypto', () => require('crypto'));

describe('WearSyncCrypto', () => {
  const rootSecret = Buffer.from('wear-sync-root-secret-32-byte-placeholder');

  test('encrypts and decrypts favorites envelope round-trip', () => {
    const envelope = WearSyncCrypto.createEnvelope(
      [
        { id: 1, title: 'GitHub', secret: 'ABC123', issuer: 'Aegis' },
        { id: 2, title: 'Google', secret: 'XYZ987', issuer: 'Aegis' },
      ],
      rootSecret,
    );
    const decrypted = WearSyncCrypto.decryptEnvelope(
      JSON.stringify(envelope),
      rootSecret,
    );

    expect(Array.isArray(decrypted)).toBe(true);
    expect(decrypted?.[0].title).toBe('GitHub');
    expect(decrypted?.[1].secret).toBe('XYZ987');
  });

  test('rejects tampered payload with failed HMAC verification', () => {
    const envelope = WearSyncCrypto.createEnvelope(
      [{ id: 1, title: 'GitHub', secret: 'ABC123', issuer: 'Aegis' }],
      rootSecret,
    );
    const tampered = {
      ...envelope,
      package: {
        ...envelope.package,
        payload: Buffer.from('tampered').toString('base64'),
      },
    };

    const decrypted = WearSyncCrypto.decryptEnvelope(
      JSON.stringify(tampered),
      rootSecret,
    );
    expect(decrypted).toBeNull();
  });

  test('rejects envelopes with invalid schema metadata before decryption', () => {
    const invalidSchema = {
      schema: 'wear_sync_e2e_v2',
      encrypted: true,
      alg: 'AES-256-GCM+HMAC-SHA256',
      package: { payload: 'x', iv: 'y', hmac: 'z', nonce: 'n' },
    };
    const invalidAlg = {
      schema: 'wear_sync_e2e_v1',
      encrypted: true,
      alg: 'AES-128-CBC',
      package: { payload: 'x', iv: 'y', hmac: 'z', nonce: 'n' },
    };

    expect(
      WearSyncCrypto.decryptEnvelope(JSON.stringify(invalidSchema), rootSecret),
    ).toBeNull();
    expect(
      WearSyncCrypto.decryptEnvelope(JSON.stringify(invalidAlg), rootSecret),
    ).toBeNull();
  });

  test('rejects malformed JSON or envelopes without package', () => {
    expect(WearSyncCrypto.decryptEnvelope('not-json', rootSecret)).toBeNull();
    expect(
      WearSyncCrypto.decryptEnvelope(
        JSON.stringify({
          schema: 'wear_sync_e2e_v1',
          encrypted: true,
          alg: 'AES-256-GCM+HMAC-SHA256',
        }),
        rootSecret,
      ),
    ).toBeNull();
  });
});
