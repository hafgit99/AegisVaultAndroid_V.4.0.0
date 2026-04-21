import { PasskeyReadinessService } from '../src/PasskeyReadinessService';

describe('PasskeyReadinessService', () => {
  it('marks backend registration as ready only when core prerequisites are met', () => {
    const summary = PasskeyReadinessService.build({
      backendConfigured: true,
      backendReachable: true,
      nativeAvailable: true,
      username: 'harun@example.com',
      url: 'https://example.com',
      rpId: '',
      credentialId: '',
    });

    expect(summary.createReady).toBe(true);
    expect(summary.authReady).toBe(false);
  });

  it('keeps backend reachability pending until a health check runs', () => {
    const summary = PasskeyReadinessService.build({
      backendConfigured: true,
      backendReachable: null,
      nativeAvailable: null,
      username: '',
      url: '',
      rpId: '',
      credentialId: '',
    });

    const backendHealth = summary.items.find(
      item => item.id === 'backend_reachable',
    );
    const nativeAvailable = summary.items.find(
      item => item.id === 'native_available',
    );

    expect(backendHealth).toEqual(
      expect.objectContaining({
        ready: false,
        pending: true,
      }),
    );
    expect(nativeAvailable).toEqual(
      expect.objectContaining({
        ready: false,
        pending: true,
      }),
    );
  });

  it('blocks auth when credential id is missing even if create is ready', () => {
    const summary = PasskeyReadinessService.build({
      backendConfigured: true,
      backendReachable: true,
      nativeAvailable: true,
      username: 'harun@example.com',
      url: '',
      rpId: 'example.com',
      credentialId: '',
    });

    expect(summary.createReady).toBe(true);
    expect(summary.authReady).toBe(false);
  });
});
