/**
 * PasswordHistoryService.test.ts — Aegis Vault Android
 * Unit tests for PasswordHistoryService extraction logic.
 */

import { extractHistorySecretsFromItem } from '../../src/security/PasswordHistoryService';

describe('PasswordHistoryService', () => {
  const mockParseData = (data?: string) => {
    try {
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  };

  it('extracts password from login category', () => {
    const item = { category: 'login', password: 'secret-password' };
    const results = extractHistorySecretsFromItem(item as any, mockParseData);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ field: 'password', value: 'secret-password' });
  });

  it('extracts wifi password from wifi category', () => {
    const item = { category: 'wifi', data: JSON.stringify({ wifi_password: 'wifi-secret' }) };
    const results = extractHistorySecretsFromItem(item as any, mockParseData);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ field: 'wifi_password', value: 'wifi-secret' });
  });

  it('extracts pin and cvv from card category', () => {
    const item = { category: 'card', data: JSON.stringify({ pin: '1234', cvv: '999' }) };
    const results = extractHistorySecretsFromItem(item as any, mockParseData);
    
    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ field: 'pin', value: '1234' });
    expect(results).toContainEqual({ field: 'cvv', value: '999' });
  });

  it('extracts credential_id from passkey category', () => {
    const item = { category: 'passkey', data: JSON.stringify({ credential_id: 'passkey-id' }) };
    const results = extractHistorySecretsFromItem(item as any, mockParseData);
    
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ field: 'credential_id', value: 'passkey-id' });
  });

  it('returns empty array for empty fields', () => {
    const item = { category: 'login', password: '' };
    const results = extractHistorySecretsFromItem(item as any, mockParseData);
    expect(results).toHaveLength(0);
  });
});
