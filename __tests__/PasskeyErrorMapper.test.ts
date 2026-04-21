import {
  classifyPasskeyBackendError,
  formatPasskeyBackendError,
} from '../src/PasskeyErrorMapper';

describe('PasskeyErrorMapper', () => {
  const t = (key: string) => key;

  it('classifies challenge expiry errors', () => {
    expect(
      classifyPasskeyBackendError(
        new Error('Passkey RP API request failed: 400 expired challenge'),
      ),
    ).toBe('challenge_expired');
  });

  it('classifies rp mismatch errors', () => {
    expect(
      classifyPasskeyBackendError(new Error('origin mismatch for rp id')),
    ).toBe('rp_mismatch');
  });

  it('classifies credential mismatch errors', () => {
    expect(
      classifyPasskeyBackendError(new Error('allow credential mismatch')),
    ).toBe('credential_mismatch');
  });

  it('maps network errors to localized keys', () => {
    expect(
      formatPasskeyBackendError(new Error('Network request failed'), t),
    ).toBe('passkey.errors.network_error');
  });

  it('falls back to unknown for unmatched errors', () => {
    expect(formatPasskeyBackendError(new Error('unexpected'), t)).toBe(
      'passkey.errors.unknown',
    );
  });
});
