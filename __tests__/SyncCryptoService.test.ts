/**
 * SyncCryptoService.test.ts — Aegis Vault Android v4.02
 * Tests for synchronization crypto primitives.
 */

import { SyncCryptoService } from '../src/SyncCryptoService';
import { Buffer } from 'buffer';

// Mock react-native-quick-crypto to use Node.js crypto
jest.mock('react-native-quick-crypto', () => require('crypto'));

describe('SyncCryptoService', () => {
  const rootSecret = Buffer.from('this-is-a-32-byte-secret-mock-root', 'utf8');

  it('derives subkeys consistently', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    
    expect(encryptionKey).toHaveLength(32);
    expect(authKey).toHaveLength(32);

    // Should be deterministic
    const second = SyncCryptoService.deriveSubKeys(rootSecret);
    expect(second.encryptionKey).toEqual(encryptionKey);
    expect(second.authKey).toEqual(authKey);
  });

  it('encrypts and decrypts a round trip successfully', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const data = { foo: 'bar', secret: 12345 };

    const pkg = SyncCryptoService.encryptAndSign(data, encryptionKey, authKey);
    
    expect(pkg.payload).toBeDefined();
    expect(pkg.iv).toHaveLength(16); // 12 bytes base64-encoded is 16 chars
    expect(pkg.hmac).toBeDefined();

    const decrypted = SyncCryptoService.verifyAndDecrypt(pkg, encryptionKey, authKey);
    expect(decrypted).toEqual(data);
  });

  it('fails decryption if hmac is tampered', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const data = { msg: 'secure' };
    const pkg = SyncCryptoService.encryptAndSign(data, encryptionKey, authKey);

    // Tamper with payload
    const tamperedPkg = { ...pkg, payload: Buffer.from('bad-data').toString('base64') };
    
    const result = SyncCryptoService.verifyAndDecrypt(tamperedPkg, encryptionKey, authKey);
    expect(result).toBeNull();
  });

  it('fails decryption with wrong keys', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const wrongKeys = SyncCryptoService.deriveSubKeys(Buffer.from('wrong-secret'));
    
    const data = { msg: 'secure' };
    const pkg = SyncCryptoService.encryptAndSign(data, encryptionKey, authKey);
    
    const result = SyncCryptoService.verifyAndDecrypt(pkg, wrongKeys.encryptionKey, wrongKeys.authKey);
    expect(result).toBeNull();
  });
});
