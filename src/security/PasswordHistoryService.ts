/**
 * PasswordHistoryService — Aegis Vault Android
 * Logic for extracting and storing password change history.
 */

import { VaultItem, PasswordHistoryEntry } from '../SecurityModule';

export const extractHistorySecretsFromItem = (
  item: Partial<VaultItem>,
  parseData: (data?: string) => any,
): Array<{
  field: PasswordHistoryEntry['field'];
  value: string;
}> => {
  const category = (item.category || 'login').toLowerCase();
  const data = parseData(item.data);

  const out: Array<{
    field: PasswordHistoryEntry['field'];
    value: string;
  }> = [];

  if (category === 'login') {
    const v = (item.password || '').trim();
    if (v) out.push({ field: 'password', value: v });
  }

  if (category === 'wifi') {
    const v = (data?.wifi_password || '').trim();
    if (v) out.push({ field: 'wifi_password', value: v });
  }

  if (category === 'card') {
    const pin = (data?.pin || '').trim();
    const cvv = (data?.cvv || '').trim();
    if (pin) out.push({ field: 'pin', value: pin });
    if (cvv) out.push({ field: 'cvv', value: cvv });
  }

  if (category === 'passkey') {
    const credentialId = (data?.credential_id || '').trim();
    if (credentialId)
      out.push({ field: 'credential_id', value: credentialId });
  }

  return out;
};
