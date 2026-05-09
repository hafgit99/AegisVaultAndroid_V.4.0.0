import { SyncManager } from '../src/SyncManager';
import { SyncCryptoService } from '../src/SyncCryptoService';
import { SyncDeviceService } from '../src/SyncDeviceService';
import { SecureAppSettings } from '../src/SecureAppSettings';
import { SyncEnvelopeUtil } from '../src/SyncEnvelope';
import { SyncConflictService } from '../src/SyncConflictService';
import { IntegrityModule } from '../src/IntegrityModule';
import { DeltaSyncModule } from '../src/DeltaSyncModule';
import { NativeModules, Platform } from 'react-native';
import { Buffer } from 'buffer';
import { SecurityModule } from '../src/SecurityModule';

jest.mock('react-native-quick-crypto', () => require('crypto'));

// Mock Native Bridge and Modules
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {
    CloudSyncSecure: {
      postJson: jest.fn(),
      getJson: jest.fn(),
    },
  },
}));

jest.mock('../src/SyncCryptoService');
jest.mock('../src/SyncDeviceService');
jest.mock('../src/SecureAppSettings');
jest.mock('../src/SyncEnvelope');
jest.mock('../src/SyncConflictService');
jest.mock('../src/IntegrityModule', () => ({
  IntegrityModule: {
    requestRelayAttestation: jest.fn(),
  },
}));
jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    applyMergedSyncItems: jest.fn(),
  }
}));

describe('SyncManager', () => {
  const mockSecret = Buffer.from('unit_test_root_secret_32_bytes_len');

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
    (global as any).fetch = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      syncSessionId: 'session_abc',
      relayUrl: 'https://relay.aegis.com',
      syncLastSequence: 10,
      relayCertificatePin: 'sha256/test_pin',
    });

    (SyncCryptoService.deriveSubKeys as jest.Mock).mockReturnValue({ 
      encryptionKey: Buffer.from('enc'), 
      authKey: Buffer.from('auth') 
    });
    
    (SyncCryptoService.encryptAndSign as jest.Mock).mockReturnValue({ 
      payload: 'pkg', iv: 'iv', hmac: 'hmac' 
    });
    
    (SyncDeviceService.getLocalFingerprint as jest.Mock).mockReturnValue({ id: 'device_123' });
    
    (SyncEnvelopeUtil.create as jest.Mock).mockReturnValue({
      payload: 'pkg',
      iv: 'iv',
      hmac: 'hmac',
      deviceId: 'device_123',
      sequenceNumber: 11,
    });
    
    (SyncEnvelopeUtil.validate as jest.Mock).mockReturnValue(true);
    
    (SyncConflictService.resolve as jest.Mock).mockImplementation((local, remote) => ({
      merged: [...local, ...remote],
      summary: {
        policy: 'last_write_wins',
        conflictCount: 0,
        localWins: 0,
        remoteWins: 0,
        remoteInsertions: remote.length,
        modifiedCount: remote.length,
      },
    }));
    (SyncConflictService.emptySummary as jest.Mock).mockReturnValue({
      policy: 'last_write_wins',
      conflictCount: 0,
      localWins: 0,
      remoteWins: 0,
      remoteInsertions: 0,
      modifiedCount: 0,
    });
    (SyncConflictService.combineSummaries as jest.Mock).mockImplementation((left, right) => ({
      policy: 'last_write_wins',
      conflictCount: left.conflictCount + right.conflictCount,
      localWins: left.localWins + right.localWins,
      remoteWins: left.remoteWins + right.remoteWins,
      remoteInsertions: left.remoteInsertions + right.remoteInsertions,
      modifiedCount: left.modifiedCount + right.modifiedCount,
    }));

    (SyncCryptoService.verifyAndDecrypt as jest.Mock).mockImplementation(() => [{ id: 1, title: 'Test' }]);

    (IntegrityModule.requestRelayAttestation as jest.Mock).mockResolvedValue({
      nonce: 'nonce_abc_1234567890',
      token: 'play_token_abc',
      tokenLength: 14,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('push sends encrypted envelope via native bridge', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValueOnce({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValueOnce({
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    });

    const items = [{ id: 1, title: 'Item 1' }] as any;
    const result = await SyncManager.push(mockSecret, items, {});

    expect(result).toBe(true);
    expect(CloudSyncSecure.postJson).toHaveBeenNthCalledWith(
        1,
        'https://relay.aegis.com/v1/integrity/verify',
        expect.stringContaining('"integrityToken":"play_token_abc"'),
        'sha256/test_pin'
    );
    expect(CloudSyncSecure.postJson).toHaveBeenNthCalledWith(
        2,
        'https://relay.aegis.com/v1/sync/push',
        expect.stringContaining('"sequenceNumber":11'),
        'sha256/test_pin'
    );
    expect(SyncEnvelopeUtil.create).toHaveBeenCalledWith(
      'pkg',
      'iv',
      'hmac',
      'device_123',
      expect.objectContaining({
        baseSequence: 10,
        delta: true,
        entryCount: 1,
        sequenceNumber: 11,
      }),
    );
    expect(SecureAppSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        syncLastSequence: 11,
        syncLastPushTimestamp: expect.any(String),
        syncLastContentHashes: expect.any(Object),
      }),
      expect.anything(),
    );
    expect(SyncDeviceService.updateLastSync).toHaveBeenCalledWith('device_123', {});
  });

  test('pullAndMerge fetches and decrypts remote envelopes', async () => {
    const { CloudSyncSecure } = NativeModules;
    const mockEnvelope = {
      payload: 'pkg',
      iv: 'iv',
      hmac: 'hmac',
      sequenceNumber: 12,
      deviceId: 'remote_device',
    };
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.getJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify([mockEnvelope]),
    });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).not.toBeNull();
    expect(result?.newSequence).toBe(12);
    expect(result?.merged.length).toBe(1);
    expect(result?.merged[0].title).toBe('Test');
    expect(result?.conflictSummary).toMatchObject({
      policy: 'last_write_wins',
      remoteInsertions: 1,
      modifiedCount: 1,
    });
    expect(SecureAppSettings.update).toHaveBeenCalledWith({ syncLastSequence: 12 }, {});
    expect(SecurityModule.applyMergedSyncItems).toHaveBeenCalledWith(result?.merged);
  });

  test('pullAndMerge returns current items if no new envelopes', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.getJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: '[]',
    });

    const localItems = [{ id: 0 }] as any;
    const result = await SyncManager.pullAndMerge(mockSecret, localItems, {});

    expect(result?.merged).toBe(localItems);
    expect(result?.newSequence).toBe(10);
  });

  test('push is blocked when Play Integrity attestation fails', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 403,
      body: JSON.stringify({ allow: false }),
    });

    const items = [{ id: 1, title: 'Item 1' }] as any;
    const result = await SyncManager.push(mockSecret, items, {});

    expect(result).toBe(false);
    expect(CloudSyncSecure.postJson).toHaveBeenCalledTimes(1);
  });

  test('push returns false when attestation request throws before relay sync', async () => {
    (IntegrityModule.requestRelayAttestation as jest.Mock).mockRejectedValueOnce(new Error('attestation failed'));

    const result = await SyncManager.push(mockSecret, [{ id: 1, title: 'Item 1' }] as any, {});

    expect(result).toBe(false);
    expect(SyncCryptoService.deriveSubKeys).not.toHaveBeenCalled();
  });

  test('push returns false when sync session or relay URL is missing', async () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: '',
      relayUrl: '',
      syncLastSequence: 10,
      relayCertificatePin: 'sha256/test_pin',
    });

    const result = await SyncManager.push(mockSecret, [{ id: 1 }] as any, {});

    expect(result).toBe(false);
    expect(SyncCryptoService.deriveSubKeys).not.toHaveBeenCalled();
  });

  test('push refuses android sync when certificate pin is missing', async () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: 'session_abc',
      relayUrl: 'https://relay.aegis.com',
      syncLastSequence: 10,
      relayCertificatePin: '',
    });

    const result = await SyncManager.push(mockSecret, [{ id: 1 }] as any, {});

    expect(result).toBe(false);
    expect(SyncCryptoService.deriveSubKeys).not.toHaveBeenCalled();
  });

  test('push short-circuits successfully when delta sync finds no changes', async () => {
    const { CloudSyncSecure } = NativeModules;
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
    const stableItems = [
      {
        id: 1,
        title: 'Stable',
        updated_at: iso(-2 * 60 * 60 * 1000),
        created_at: iso(-2 * 60 * 60 * 1000),
        data: '{}',
      },
    ] as any;
    const stableHashes = DeltaSyncModule.buildContentHashMap(stableItems);

    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: 'session_abc',
      relayUrl: 'https://relay.aegis.com',
      syncLastSequence: 10,
      relayCertificatePin: 'sha256/test_pin',
      syncLastPushTimestamp: iso(-30 * 60 * 1000),
      syncLastContentHashes: stableHashes,
    });
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValueOnce({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });

    const result = await SyncManager.push(mockSecret, stableItems, {});

    expect(result).toBe(true);
    expect(CloudSyncSecure.postJson).toHaveBeenCalledTimes(1);
    expect(SyncCryptoService.encryptAndSign).not.toHaveBeenCalled();
    expect(SecureAppSettings.update).not.toHaveBeenCalled();
  });

  test('push returns false when relay rejects sync envelope upload', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValueOnce({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValueOnce({
      statusCode: 500,
      body: JSON.stringify({ success: false }),
    });

    const result = await SyncManager.push(mockSecret, [{ id: 1, title: 'X' }] as any, {});

    expect(result).toBe(false);
    expect(SecureAppSettings.update).not.toHaveBeenCalled();
    expect(SyncDeviceService.updateLastSync).not.toHaveBeenCalled();
  });

  test('push returns false when pinned post throws for non-https relay', async () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: 'session_abc',
      relayUrl: 'http://relay.aegis.com',
      syncLastSequence: 10,
      relayCertificatePin: 'sha256/test_pin',
    });

    const result = await SyncManager.push(mockSecret, [{ id: 1, title: 'X' }] as any, {});

    expect(result).toBe(false);
  });

  test('pullAndMerge returns null when relay pin is missing on android', async () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: 'session_abc',
      relayUrl: 'https://relay.aegis.com',
      syncLastSequence: 10,
      relayCertificatePin: '',
    });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).toBeNull();
  });

  test('pullAndMerge returns null when sync settings are missing', async () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: '',
      relayUrl: '',
      syncLastSequence: 10,
      relayCertificatePin: 'sha256/test_pin',
    });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).toBeNull();
    expect(NativeModules.CloudSyncSecure.getJson).not.toHaveBeenCalled();
  });

  test('pullAndMerge returns null when Play Integrity attestation fails', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 403,
      body: JSON.stringify({ allow: false }),
    });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).toBeNull();
    expect(CloudSyncSecure.getJson).not.toHaveBeenCalled();
  });

  test('pullAndMerge returns null when relay returns non-success status', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.getJson as jest.Mock).mockResolvedValue({
      statusCode: 503,
      body: JSON.stringify([]),
    });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).toBeNull();
  });

  test('pullAndMerge keeps highest sequence across multiple envelopes', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.getJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify([
        { payload: 'pkg1', iv: 'iv1', hmac: 'h1', sequenceNumber: 12, deviceId: 'd1' },
        { payload: 'pkg2', iv: 'iv2', hmac: 'h2', sequenceNumber: 15, deviceId: 'd2' },
      ]),
    });
    (SyncCryptoService.verifyAndDecrypt as jest.Mock)
      .mockReturnValueOnce([{ id: 1, title: 'Remote 1' }])
      .mockReturnValueOnce([{ id: 2, title: 'Remote 2' }]);
    (SyncConflictService.resolve as jest.Mock)
      .mockReturnValueOnce({
        merged: [{ id: 1, title: 'Remote 1' }],
        summary: {
          policy: 'last_write_wins',
          conflictCount: 1,
          localWins: 0,
          remoteWins: 1,
          remoteInsertions: 0,
          modifiedCount: 1,
        },
      })
      .mockReturnValueOnce({
        merged: [{ id: 1, title: 'Remote 1' }, { id: 2, title: 'Remote 2' }],
        summary: {
          policy: 'last_write_wins',
          conflictCount: 0,
          localWins: 0,
          remoteWins: 0,
          remoteInsertions: 1,
          modifiedCount: 1,
        },
      });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).toMatchObject({
      merged: [{ id: 1, title: 'Remote 1' }, { id: 2, title: 'Remote 2' }],
      newSequence: 15,
      conflictSummary: {
        conflictCount: 1,
        remoteWins: 1,
        remoteInsertions: 1,
        modifiedCount: 2,
      },
    });
    expect(SecureAppSettings.update).toHaveBeenCalledWith({ syncLastSequence: 15 }, {});
  });

  test('pullAndMerge returns null when pinned get throws for non-https relay', async () => {
    const { CloudSyncSecure } = NativeModules;
    (SecureAppSettings.get as jest.Mock).mockReturnValueOnce({
      syncSessionId: 'session_abc',
      relayUrl: 'http://relay.aegis.com',
      syncLastSequence: 10,
      relayCertificatePin: 'sha256/test_pin',
    });
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });

    const result = await SyncManager.pullAndMerge(mockSecret, [], {});

    expect(result).toBeNull();
  });

  test('push uses fetch fallback on non-android when native bridge is unavailable', async () => {
    (Platform as any).OS = 'ios';
    (NativeModules.CloudSyncSecure.postJson as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({ success: true })),
    });

    const result = await SyncManager.push(mockSecret, [{ id: 1, title: 'ios item' }] as any, {});

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://relay.aegis.com/v1/sync/push',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
    );
  });

  test('push fetch fallback handles missing text function by using empty response body', async () => {
    (Platform as any).OS = 'ios';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await SyncManager.push(mockSecret, [{ id: 1, title: 'ios item' }] as any, {});

    expect(result).toBe(true);
  });

  test('pullAndMerge uses fetch fallback on non-android', async () => {
    (Platform as any).OS = 'ios';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('[]'),
    });

    const localItems = [{ id: 7, title: 'Local' }] as any;
    const result = await SyncManager.pullAndMerge(mockSecret, localItems, {});

    expect(result).toMatchObject({ merged: localItems, newSequence: 10 });
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://relay.aegis.com/v1/sync/pull/session_abc?after=10',
    );
  });

  test('pullAndMerge skips invalid envelopes and avoids unnecessary writes', async () => {
    const { CloudSyncSecure } = NativeModules;
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.getJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify([
        { payload: 'pkg', iv: 'iv', hmac: 'hmac', sequenceNumber: 12, deviceId: 'remote_device' },
      ]),
    });
    (SyncEnvelopeUtil.validate as jest.Mock).mockReturnValueOnce(false);

    const localItems = [{ id: 5, title: 'Local' }] as any;
    const result = await SyncManager.pullAndMerge(mockSecret, localItems, {});

    expect(result).toMatchObject({ merged: localItems, newSequence: 10 });
    expect(SyncCryptoService.verifyAndDecrypt).not.toHaveBeenCalled();
    expect(SecureAppSettings.update).not.toHaveBeenCalled();
  });

  test('pullAndMerge ignores null decrypt results and avoids merge writes', async () => {
    const { CloudSyncSecure } = NativeModules;
    const mockEnvelope = {
      payload: 'pkg',
      iv: 'iv',
      hmac: 'hmac',
      sequenceNumber: 12,
      deviceId: 'remote_device',
    };
    (CloudSyncSecure.postJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ allow: true }),
    });
    (CloudSyncSecure.getJson as jest.Mock).mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify([mockEnvelope]),
    });
    (SyncCryptoService.verifyAndDecrypt as jest.Mock).mockReturnValueOnce(null);

    const localItems = [{ id: 5, title: 'Local' }] as any;
    const result = await SyncManager.pullAndMerge(mockSecret, localItems, {});

    expect(result).toMatchObject({ merged: localItems, newSequence: 10 });
    expect(SyncConflictService.resolve).not.toHaveBeenCalled();
    expect(SecureAppSettings.update).not.toHaveBeenCalled();
  });
});
