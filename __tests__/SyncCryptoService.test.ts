/**
 * SyncCryptoService.test.ts — Aegis Vault Android v4.2.0
 * Hardened mutation-killing tests for E2E sync crypto primitives.
 */
import { SyncCryptoService } from '../src/SyncCryptoService';
import { Buffer } from 'buffer';

jest.mock('react-native-quick-crypto', () => require('crypto'));

describe('SyncCryptoService', () => {
  const rootSecret = Buffer.from('this-is-a-32-byte-secret-mock-root', 'utf8');

  // ── deriveSubKeys ───────────────────────────────────────────

  it('derives subkeys of correct length (32 bytes each)', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    expect(encryptionKey).toHaveLength(32);
    expect(authKey).toHaveLength(32);
  });

  it('derives deterministic subkeys', () => {
    const first = SyncCryptoService.deriveSubKeys(rootSecret);
    const second = SyncCryptoService.deriveSubKeys(rootSecret);
    expect(second.encryptionKey).toEqual(first.encryptionKey);
    expect(second.authKey).toEqual(first.authKey);
  });

  it('encryption and auth keys are different', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    expect(Buffer.compare(encryptionKey, authKey)).not.toBe(0);
  });

  it('different root secrets produce different subkeys', () => {
    const k1 = SyncCryptoService.deriveSubKeys(rootSecret);
    const k2 = SyncCryptoService.deriveSubKeys(Buffer.from('different-secret-key-0000000000000'));
    expect(Buffer.compare(k1.encryptionKey, k2.encryptionKey)).not.toBe(0);
    expect(Buffer.compare(k1.authKey, k2.authKey)).not.toBe(0);
  });

  it('custom install salt produces different subkeys', () => {
    const k1 = SyncCryptoService.deriveSubKeys(rootSecret);
    const k2 = SyncCryptoService.deriveSubKeys(rootSecret, Buffer.from('custom-install-salt'));
    expect(Buffer.compare(k1.encryptionKey, k2.encryptionKey)).not.toBe(0);
  });

  // ── encryptAndSign ──────────────────────────────────────────

  it('produces all required package fields', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign({ test: 1 }, encryptionKey, authKey);

    expect(typeof pkg.payload).toBe('string');
    expect(pkg.payload.length).toBeGreaterThan(0);
    expect(typeof pkg.iv).toBe('string');
    expect(pkg.iv.length).toBe(16); // 12 bytes => 16 base64 chars
    expect(typeof pkg.hmac).toBe('string');
    expect(pkg.hmac.length).toBeGreaterThan(0);
    expect(typeof pkg.nonce).toBe('string');
    expect(pkg.nonce.length).toBe(32); // 16 bytes hex
  });

  it('each encryption generates unique IV and nonce', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg1 = SyncCryptoService.encryptAndSign('data', encryptionKey, authKey);
    const pkg2 = SyncCryptoService.encryptAndSign('data', encryptionKey, authKey);
    expect(pkg1.iv).not.toBe(pkg2.iv);
    expect(pkg1.nonce).not.toBe(pkg2.nonce);
  });

  // ── round-trip ──────────────────────────────────────────────

  it('encrypts and decrypts a round trip successfully', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const data = { foo: 'bar', secret: 12345 };
    const pkg = SyncCryptoService.encryptAndSign(data, encryptionKey, authKey);
    const decrypted = SyncCryptoService.verifyAndDecrypt(pkg, encryptionKey, authKey);
    expect(decrypted).toEqual(data);
  });

  it('round-trips complex nested data', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const data = { items: [{ id: 1, tags: ['a', 'b'] }], meta: { v: 2 } };
    const pkg = SyncCryptoService.encryptAndSign(data, encryptionKey, authKey);
    expect(SyncCryptoService.verifyAndDecrypt(pkg, encryptionKey, authKey)).toEqual(data);
  });

  // ── tamper detection ────────────────────────────────────────

  it('fails decryption if payload is tampered', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign({ msg: 'secure' }, encryptionKey, authKey);
    const tampered = { ...pkg, payload: Buffer.from('bad-data').toString('base64') };
    expect(SyncCryptoService.verifyAndDecrypt(tampered, encryptionKey, authKey)).toBeNull();
  });

  it('fails decryption if hmac is tampered', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign({ msg: 'test' }, encryptionKey, authKey);
    const tampered = { ...pkg, hmac: Buffer.alloc(32, 0xff).toString('base64') };
    expect(SyncCryptoService.verifyAndDecrypt(tampered, encryptionKey, authKey)).toBeNull();
  });

  it('fails decryption if iv is tampered', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign({ msg: 'iv-test' }, encryptionKey, authKey);
    const tampered = { ...pkg, iv: Buffer.alloc(12, 0xaa).toString('base64') };
    expect(SyncCryptoService.verifyAndDecrypt(tampered, encryptionKey, authKey)).toBeNull();
  });

  it('fails decryption with wrong keys', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const wrongKeys = SyncCryptoService.deriveSubKeys(Buffer.from('wrong-secret-key-000000000000000'));
    const pkg = SyncCryptoService.encryptAndSign({ msg: 'keys' }, encryptionKey, authKey);
    expect(SyncCryptoService.verifyAndDecrypt(pkg, wrongKeys.encryptionKey, wrongKeys.authKey)).toBeNull();
  });

  it('fails decryption when nonce does not match package nonce', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign({ msg: 'nonce' }, encryptionKey, authKey);
    const tampered = { ...pkg, nonce: 'deadbeefdeadbeefdeadbeefdeadbeef' };
    expect(SyncCryptoService.verifyAndDecrypt(tampered, encryptionKey, authKey)).toBeNull();
  });

  it('fails when hmac length differs from computed', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign({ msg: 'len' }, encryptionKey, authKey);
    const tampered = { ...pkg, hmac: Buffer.alloc(16, 0).toString('base64') }; // wrong length
    expect(SyncCryptoService.verifyAndDecrypt(tampered, encryptionKey, authKey)).toBeNull();
  });

  // ── timingSafeEqual ─────────────────────────────────────────

  it('constant-time comparison rejects different-length buffers', () => {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(rootSecret);
    const pkg = SyncCryptoService.encryptAndSign('x', encryptionKey, authKey);
    // Truncate hmac to create length mismatch
    const shortHmac = Buffer.from(pkg.hmac, 'base64').subarray(0, 16);
    const tampered = { ...pkg, hmac: shortHmac.toString('base64') };
    expect(SyncCryptoService.verifyAndDecrypt(tampered, encryptionKey, authKey)).toBeNull();
  });
});
