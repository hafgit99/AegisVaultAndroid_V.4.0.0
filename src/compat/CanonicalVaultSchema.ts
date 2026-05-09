import { VaultItem } from '../SecurityModule';

export type CanonicalCategory =
  | 'login'
  | 'passkey'
  | 'card'
  | 'identity'
  | 'note'
  | 'wifi'
  | 'crypto_wallet'
  | 'document'
  | 'other';

export interface CanonicalTotpFields {
  secret: string;
  issuer?: string;
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512';
  digits?: number;
  period?: number;
}

export interface CanonicalSecretFields {
  password?: string;
  notes?: string;
  totp?: CanonicalTotpFields | null;
}

export interface CanonicalAttachment {
  id: string;
  name: string;
  mime_type: string;
  size: number;
}

export interface CanonicalPasskeyFields {
  rp_id?: string;
  origin?: string;
  credential_id?: string;
  user_handle?: string;
  display_name?: string;
  transport?: string;
  authenticator_attachment?: string;
  algorithm?: string;
  mode?:
    | 'vault_unlock'
    | 'site_passkey_mvp'
    | 'site_passkey_active'
    | 'site_passkey_future_rp'
    | 'local_helper'
    | 'rp_connected';
  server_verified?: boolean;
  created_at?: string;
  last_registration_at?: string;
  last_auth_at?: string;
}

export interface CanonicalSharingAssignment {
  space_id: string;
  role: 'viewer' | 'editor';
  shared_by?: string;
  is_sensitive?: boolean;
  emergency_access?: boolean;
  notes?: string;
  last_reviewed_at?: string;
}

export interface CanonicalVaultRecord {
  id: string | number;
  title: string;
  username: string;
  url: string;
  category: CanonicalCategory;
  favorite: boolean;
  tags: string[];
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  secret?: CanonicalSecretFields;
  attachments?: CanonicalAttachment[];
  passkey?: CanonicalPasskeyFields | null;
  sharing?: CanonicalSharingAssignment[];
  custom_data?: Record<string, unknown>;
}

export const normalizeCanonicalCategory = (
  value?: string,
): CanonicalCategory => {
  const normalized = (value || '').trim().toLowerCase();
  if (
    normalized === 'login' ||
    normalized === 'passkey' ||
    normalized === 'card' ||
    normalized === 'identity' ||
    normalized === 'note' ||
    normalized === 'wifi' ||
    normalized === 'crypto_wallet' ||
    normalized === 'document'
  ) {
    return normalized;
  }
  return normalized ? 'other' : 'login';
};

const parseData = (data: unknown): Record<string, any> => {
  if (!data) return {};
  if (typeof data === 'object') return data as Record<string, any>;
  if (typeof data !== 'string') return {};
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(tag => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 32);
};

const buildTotp = (data: Record<string, any>): CanonicalTotpFields | null => {
  const secret = String(data.totp_secret || data.totp?.secret || '').trim();
  if (!secret) return null;
  return {
    secret,
    issuer: String(data.totp_issuer || data.totp?.issuer || '').trim() || undefined,
    algorithm: data.totp?.algorithm || undefined,
    digits: Number(data.totp_digits || data.totp?.digits) || undefined,
    period: Number(data.totp_period || data.totp?.period) || undefined,
  };
};

const buildPasskey = (
  data: Record<string, any>,
): CanonicalPasskeyFields | null => {
  if (!data.rp_id && !data.credential_id && !data.user_handle) return null;
  return {
    rp_id: data.rp_id || undefined,
    origin: data.origin || undefined,
    credential_id: data.credential_id || undefined,
    user_handle: data.user_handle || undefined,
    display_name: data.display_name || undefined,
    transport: data.transport || undefined,
    authenticator_attachment: data.authenticator_attachment || undefined,
    algorithm: data.algorithm || undefined,
    mode: data.mode || undefined,
    server_verified: data.server_verified,
    created_at: data.created_at || undefined,
    last_registration_at: data.last_registration_at || undefined,
    last_auth_at: data.last_auth_at || undefined,
  };
};

const buildSharing = (
  data: Record<string, any>,
): CanonicalSharingAssignment[] | undefined => {
  const shared = data.shared;
  if (!shared?.spaceId) return undefined;
  return [
    {
      space_id: String(shared.spaceId).trim(),
      role: shared.role === 'editor' ? 'editor' : 'viewer',
      shared_by: shared.sharedBy || undefined,
      is_sensitive: Boolean(shared.isSensitive),
      emergency_access: Boolean(shared.emergencyAccess),
      notes: shared.notes || undefined,
      last_reviewed_at: shared.lastReviewedAt || undefined,
    },
  ];
};

export const toCanonicalVaultRecord = (
  item: VaultItem,
): CanonicalVaultRecord => {
  const data = parseData(item.data);
  const category = normalizeCanonicalCategory(item.category);
  const passkey = category === 'passkey' ? buildPasskey(data) : null;
  const customData = { ...data };
  delete customData.totp;
  delete customData.totp_secret;
  delete customData.shared;

  return {
    id: item.id || '',
    title: item.title || '',
    username: item.username || '',
    url: item.url || '',
    category,
    favorite: Boolean(item.favorite),
    tags: normalizeTags(data.tags),
    deleted_at: item.deleted_at || null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    secret: {
      password: item.password || undefined,
      notes: item.notes || undefined,
      totp: buildTotp(data),
    },
    passkey,
    sharing: buildSharing(data),
    custom_data: Object.keys(customData).length > 0 ? customData : undefined,
  };
};

export const toCanonicalVaultRecords = (
  items: VaultItem[],
): CanonicalVaultRecord[] => items.map(toCanonicalVaultRecord);
