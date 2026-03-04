import { HIBPModule } from '../../src/HIBPModule';

// Mock QuickCrypto
jest.mock('react-native-quick-crypto', () => {
    const crypto = jest.requireActual('crypto');
    return {
        createHash: (alg: string) => crypto.createHash(alg),
    };
});

describe('HIBPModule Unit Tests', () => {
    const password = 'password123';
    // SHA1 of 'password123' is CBFDAC6008F9CAB4083784CBD1874F76618D2A97
    const prefix = 'CBFDA';
    const suffix = 'C6008F9CAB4083784CBD1874F76618D2A97';

    test('detects compromised password via k-Anonymity', async () => {
        // Mock global fetch
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `${suffix}:456\nDIFF_SUFFIX:123`,
        });

        const count = await HIBPModule.checkPassword(password);
        expect(fetch).toHaveBeenCalledWith(`https://api.pwnedpasswords.com/range/${prefix}`, expect.any(Object));
        expect(count).toBe(456);
    });

    test('returns 0 for safe passwords', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => `OTHER_SUFFIX:10\nANOTHER_ONE:5`,
        });

        const count = await HIBPModule.checkPassword(password);
        expect(count).toBe(0);
    });

    test('handles API errors gracefully', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 500,
        });

        const count = await HIBPModule.checkPassword(password);
        expect(count).toBe(0);
    });

    test('handles network exceptions gracefully', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));

        const count = await HIBPModule.checkPassword(password);
        expect(count).toBe(0);
    });
});
