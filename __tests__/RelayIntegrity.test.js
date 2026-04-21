const { evaluateIntegrityPayload } = require('../scripts/relay-server');

describe('Relay Play Integrity evaluation', () => {
  test('accepts valid decoded payload', () => {
    const now = Date.now();
    const verdict = evaluateIntegrityPayload(
      {
        requestDetails: {
          nonce: 'nonce-123',
          requestPackageName: 'com.aegisandroid',
          timestampMillis: String(now),
        },
        appIntegrity: {
          appRecognitionVerdict: 'PLAY_RECOGNIZED',
        },
        deviceIntegrity: {
          deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
        },
      },
      'nonce-123',
      'com.aegisandroid',
    );
    expect(verdict.allow).toBe(true);
  });

  test('rejects nonce mismatch', () => {
    const verdict = evaluateIntegrityPayload(
      {
        requestDetails: {
          nonce: 'nonce-other',
          requestPackageName: 'com.aegisandroid',
          timestampMillis: String(Date.now()),
        },
        appIntegrity: {
          appRecognitionVerdict: 'PLAY_RECOGNIZED',
        },
        deviceIntegrity: {
          deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
        },
      },
      'nonce-123',
      'com.aegisandroid',
    );
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toBe('nonce_mismatch');
  });
});

