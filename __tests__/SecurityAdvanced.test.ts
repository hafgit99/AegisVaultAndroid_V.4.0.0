import RNFS from 'react-native-fs';

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/doc',
}));

const mockCrypto = {
  randomBytes: jest.fn((size) => Buffer.alloc(size, 0x42)),
  pbkdf2: jest.fn((p, s, i, l, a, cb) => cb(null, Buffer.alloc(l, 0xdd))),
  pbkdf2Sync: jest.fn((p, s, i, l, a) => Buffer.alloc(l, 0xee)),
  createCipheriv: jest.fn(() => ({ update: jest.fn(), final: jest.fn(), getAuthTag: jest.fn() })),
  createDecipheriv: jest.fn(() => ({ update: jest.fn(), final: jest.fn(), setAuthTag: jest.fn() })),
};

jest.mock('react-native-quick-crypto', () => {
  return {
    ...mockCrypto,
    default: mockCrypto,
    __esModule: true,
  };
});

(global as any).crypto = mockCrypto;

import { SecurityModule, __bufToBase64 } from '../src/SecurityModule';

describe('SecurityAdvanced', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecurityModule as any).deviceSalt = null;
    (SecurityModule as any).appConfig = null;
    (SecurityModule as any).bfState = { failCount: 0, lockUntil: 0, lastAttempt: 0 };
    
    mockCrypto.pbkdf2 = jest.fn((p, s, i, l, a, cb) => cb(null, Buffer.alloc(l, 0xdd)));
    mockCrypto.pbkdf2Sync = jest.fn((p, s, i, l, a) => Buffer.alloc(l, 0xee));
  });

  describe('Utility Hardening', () => {
    test('__bufToBase64 handles all padding cases', () => {
      expect(__bufToBase64(new Uint8Array([72, 101, 108]))).toBe('SGVs');
      expect(__bufToBase64(new Uint8Array([72, 101, 108, 108]))).toBe('SGVsbA==');
      expect(__bufToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe('SGVsbG8=');
      expect(__bufToBase64(new Uint8Array(0))).toBe('');
    });
  });

  describe('Sanitization Hardening', () => {
    test('sanitizeSharedMember normalizes input', () => {
      const input = { email: ' TEST@Example.com ', name: '  John Doe  ' };
      const result = (SecurityModule as any).sanitizeSharedMember(input);
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('John Doe');
      expect(result.id).toMatch(/^member_/);
    });

    test('sanitizeSharedSpace handles nested members', () => {
      const input = {
        name: ' My Space ',
        members: [
          { name: 'Alice', email: 'alice@test.com' },
          { name: '  ', email: '' }, 
        ]
      };
      const result = (SecurityModule as any).sanitizeSharedSpace(input);
      expect(result.name).toBe('My Space');
      expect(result.members.length).toBe(1);
    });
  });

  describe('Brute-Force Hardening', () => {
    test('decayBruteForceCounter handles multiple windows', () => {
      const now = 1000000000;
      const window = 24 * 3600 * 1000;
      (SecurityModule as any).bfState = { failCount: 10, lastAttempt: now - (window * 3 + 1000), lockUntil: now + 5000 };
      (SecurityModule as any).decayBruteForceCounter(now);
      expect((SecurityModule as any).bfState.failCount).toBe(7);
      
      const futureNow = now + 10000;
      (SecurityModule as any).bfState.lastAttempt = futureNow - (window * 15);
      (SecurityModule as any).decayBruteForceCounter(futureNow);
      expect((SecurityModule as any).bfState.failCount).toBe(0);
      expect((SecurityModule as any).bfState.lockUntil).toBe(0);
    });
  });

  describe('Password Health Check Hardening', () => {
    test('getPasswordHealthReport applies correct penalties', async () => {
      // Mock getItems to return our specific test cases
      const items = [
        { id: 1, title: 'Weak', password: '123', username: 'u1', url: '', notes: '', category: 'login', data: '' },
        { id: 2, title: 'Empty', password: '', username: 'u2', url: '', notes: '', category: 'login', data: '' },
        { id: 3, title: 'Reused1', password: 'long_password_reused', username: 'u3', url: '', notes: '', category: 'login', data: '' },
        { id: 4, title: 'Reused2', password: 'long_password_reused', username: 'u4', url: '', notes: '', category: 'login', data: '' },
        { id: 5, title: 'Similar1', password: 'password_v1', username: 'u5', url: '', notes: '', category: 'login', data: '' },
        { id: 6, title: 'Similar2', password: 'password_v2', username: 'u6', url: '', notes: '', category: 'login', data: '' },
      ];
      const getItemsSpy = jest.spyOn(SecurityModule as any, 'getItems').mockResolvedValue(items);

      const report = await (SecurityModule as any).getPasswordHealthReport();
      
      expect(report.summary.totalItems).toBe(6);
      expect(report.score).toBeLessThan(100);
      expect(typeof report.riskLevel).toBe('string');
      expect(Array.isArray(report.actions)).toBe(true);
      expect(report.actions.length).toBeGreaterThan(0);
      
      getItemsSpy.mockRestore();
    });

    test('getRiskLevelFromScore covers all boundaries', () => {
      expect((SecurityModule as any).getRiskLevelFromScore(100)).toBe('low');
      expect((SecurityModule as any).getRiskLevelFromScore(85)).toBe('low');
      expect((SecurityModule as any).getRiskLevelFromScore(79)).toBe('medium');
      expect((SecurityModule as any).getRiskLevelFromScore(65)).toBe('medium');
      expect((SecurityModule as any).getRiskLevelFromScore(64)).toBe('high');
      expect((SecurityModule as any).getRiskLevelFromScore(45)).toBe('high');
      expect((SecurityModule as any).getRiskLevelFromScore(44)).toBe('critical');
      expect((SecurityModule as any).getRiskLevelFromScore(0)).toBe('critical');
    });
  });

});