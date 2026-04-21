export interface PasskeyReadinessInput {
  backendConfigured: boolean;
  backendReachable: boolean | null;
  nativeAvailable: boolean | null;
  username: string;
  url: string;
  rpId?: string;
  credentialId?: string;
}

export interface PasskeyReadinessItem {
  id:
    | 'backend_configured'
    | 'backend_reachable'
    | 'native_available'
    | 'identity_ready'
    | 'rp_ready'
    | 'credential_ready';
  ready: boolean;
  pending: boolean;
}

export interface PasskeyReadinessSummary {
  items: PasskeyReadinessItem[];
  createReady: boolean;
  authReady: boolean;
}

const hasText = (value?: string) => Boolean((value || '').trim());

export const PasskeyReadinessService = {
  build(input: PasskeyReadinessInput): PasskeyReadinessSummary {
    const identityReady = hasText(input.username);
    const rpReady = hasText(input.url) || hasText(input.rpId);
    const credentialReady = hasText(input.credentialId);
    const nativeReady = input.nativeAvailable === true;
    const backendConfigured = input.backendConfigured;
    const backendReachable = input.backendReachable === true;

    const items: PasskeyReadinessItem[] = [
      {
        id: 'backend_configured',
        ready: backendConfigured,
        pending: false,
      },
      {
        id: 'backend_reachable',
        ready: backendReachable,
        pending: backendConfigured && input.backendReachable === null,
      },
      {
        id: 'native_available',
        ready: nativeReady,
        pending: input.nativeAvailable === null,
      },
      {
        id: 'identity_ready',
        ready: identityReady,
        pending: false,
      },
      {
        id: 'rp_ready',
        ready: rpReady,
        pending: false,
      },
      {
        id: 'credential_ready',
        ready: credentialReady,
        pending: false,
      },
    ];

    return {
      items,
      createReady:
        backendConfigured && backendReachable && nativeReady && identityReady && rpReady,
      authReady:
        backendConfigured && backendReachable && nativeReady && rpReady && credentialReady,
    };
  },
};
