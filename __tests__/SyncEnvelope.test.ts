import { SyncEnvelopeUtil } from '../src/SyncEnvelope';

describe('SyncEnvelopeUtil', () => {
  it('creates a valid envelope with metadata when entry count is provided', () => {
    const envelope = SyncEnvelopeUtil.create(
      'payload-b64',
      'iv-b64',
      'hmac-b64',
      'device-1',
      {
        sessionId: 'session-1',
        sequenceNumber: 7,
        entryCount: 3,
        vaultId: 'vault-a',
      },
    );

    expect(envelope).toMatchObject({
      version: '1.1',
      protocol: {
        schemaVersion: '1.1',
        minSupportedVersion: '1.0',
        compatibility: expect.arrayContaining(['desktop-v5-canonical']),
      },
      sessionId: 'session-1',
      deviceId: 'device-1',
      sequenceNumber: 7,
      payload: 'payload-b64',
      iv: 'iv-b64',
      hmac: 'hmac-b64',
      metadata: {
        entryCount: 3,
        vaultId: 'vault-a',
        delta: true,
        conflictPolicy: 'last_write_wins',
      },
    });
    expect(SyncEnvelopeUtil.validate(envelope)).toBe(true);
    expect(new Date(envelope.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('omits metadata when entry count is not provided', () => {
    const envelope = SyncEnvelopeUtil.create(
      'payload-b64',
      'iv-b64',
      'hmac-b64',
      'device-2',
      {
        sessionId: 'session-2',
        sequenceNumber: 1,
      },
    );

    expect(envelope.metadata).toBeUndefined();
  });

  it('accepts legacy v1 envelopes for backward compatibility', () => {
    expect(
      SyncEnvelopeUtil.validate({
        version: '1.0',
        sessionId: 'session-legacy',
        deviceId: 'device-legacy',
        payload: 'payload',
        iv: 'iv',
        hmac: 'hmac',
      } as any),
    ).toBe(true);
  });

  it('rejects malformed or unsupported envelopes', () => {
    expect(SyncEnvelopeUtil.validate(null as any)).toBe(false);
    expect(SyncEnvelopeUtil.validate('not-an-envelope' as any)).toBe(false);
    expect(
      SyncEnvelopeUtil.validate({
        version: '2.0',
        sessionId: 'session-3',
        deviceId: 'device-3',
        payload: 'payload',
        iv: 'iv',
        hmac: 'hmac',
      } as any),
    ).toBe(false);
    expect(
      SyncEnvelopeUtil.validate({
        version: '1.0',
        sessionId: '',
        deviceId: 'device-3',
        payload: 'payload',
        iv: 'iv',
        hmac: 'hmac',
      } as any),
    ).toBe(false);
  });
});
