const relay = require('../scripts/relay-server');

describe('relay protocol validation', () => {
  const baseEnvelope = {
    sessionId: 'session_abc',
    deviceId: 'device_1',
    sequenceNumber: 1,
    payload: 'payload',
    iv: 'iv',
    hmac: 'hmac',
  };

  it('accepts legacy v1 envelopes for compatibility', () => {
    expect(relay.isValidEnvelope({ ...baseEnvelope, version: '1.0' })).toBe(true);
    expect(relay.isValidProtocolMetadata({ ...baseEnvelope, version: '1.0' })).toBe(true);
  });

  it('requires v1.1 protocol metadata and conflict policy', () => {
    const envelope = {
      ...baseEnvelope,
      version: '1.1',
      protocol: {
        schemaVersion: '1.1',
        minSupportedVersion: '1.0',
        compatibility: ['desktop-v5-canonical', 'android-delta-sync'],
      },
      metadata: {
        entryCount: 1,
        conflictPolicy: 'last_write_wins',
      },
    };

    expect(relay.isValidEnvelope(envelope)).toBe(true);
    expect(relay.isValidProtocolMetadata(envelope)).toBe(true);
    expect(relay.isValidProtocolMetadata({ ...envelope, metadata: {} })).toBe(false);
  });
});
