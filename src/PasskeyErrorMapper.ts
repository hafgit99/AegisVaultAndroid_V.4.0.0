export type PasskeyBackendErrorKind =
  | 'challenge_expired'
  | 'challenge_invalid'
  | 'rp_mismatch'
  | 'credential_mismatch'
  | 'server_unavailable'
  | 'network_error'
  | 'contract_error'
  | 'configuration_error'
  | 'unknown';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || '';
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
};

export const classifyPasskeyBackendError = (
  error: unknown,
): PasskeyBackendErrorKind => {
  const message = getErrorMessage(error).toLowerCase();

  if (
    message.includes('backend url is required') ||
    message.includes('account id is required') ||
    message.includes('must start with http')
  ) {
    return 'configuration_error';
  }
  if (message.includes('contract error') || message.includes('malformed')) {
    return 'contract_error';
  }
  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed')
  ) {
    return 'network_error';
  }
  if (
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('service unavailable') ||
    message.includes('timed out')
  ) {
    return 'server_unavailable';
  }
  if (
    (message.includes('challenge') && message.includes('expired')) ||
    (message.includes('challenge') && message.includes('used')) ||
    (message.includes('challenge') && message.includes('reuse'))
  ) {
    return 'challenge_expired';
  }
  if (message.includes('challenge')) {
    return 'challenge_invalid';
  }
  if (
    message.includes('rp id') ||
    message.includes('rpid') ||
    message.includes('origin mismatch') ||
    message.includes('origin')
  ) {
    return 'rp_mismatch';
  }
  if (
    message.includes('credential') ||
    message.includes('allowcredentials') ||
    message.includes('allow credential') ||
    message.includes('not registered')
  ) {
    return 'credential_mismatch';
  }

  return 'unknown';
};

export const formatPasskeyBackendError = (
  error: unknown,
  t: (key: string) => string,
): string => {
  const kind = classifyPasskeyBackendError(error);
  const map: Record<PasskeyBackendErrorKind, string> = {
    challenge_expired: t('passkey.errors.challenge_expired'),
    challenge_invalid: t('passkey.errors.challenge_invalid'),
    rp_mismatch: t('passkey.errors.rp_mismatch'),
    credential_mismatch: t('passkey.errors.credential_mismatch'),
    server_unavailable: t('passkey.errors.server_unavailable'),
    network_error: t('passkey.errors.network_error'),
    contract_error: t('passkey.errors.contract_error'),
    configuration_error: t('passkey.errors.configuration_error'),
    unknown: t('passkey.errors.unknown'),
  };

  return map[kind];
};
