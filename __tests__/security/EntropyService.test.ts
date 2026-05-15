/**
 * EntropyService.test.ts — Aegis Vault Android
 * Unit tests for professional entropy calculation logic.
 */

import {
  calculateEntropy,
  meetsMinimumEntropy,
} from '../../src/security/EntropyService';

describe('EntropyService', () => {
  describe('calculateEntropy', () => {
    it('returns zero entropy for empty string', () => {
      const result = calculateEntropy('');
      expect(result.entropyBits).toBe(0);
      expect(result.effectiveEntropy).toBe(0);
      expect(result.score).toBe(0);
      expect(result.level).toBe('critical');
    });

    it('identifies critically weak common passwords', () => {
      const common = ['password', '123456', 'qwerty'];
      for (const pw of common) {
        const result = calculateEntropy(pw);
        expect(result.level).toBe('critical');
        expect(result.penalties.some(p => p.type === 'common_password')).toBe(true);
      }
    });

    it('detects keyboard sequences and applies penalties', () => {
      const result = calculateEntropy('asdfghjkl');
      expect(result.penalties.some(p => p.type === 'keyboard_sequence')).toBe(true);
      expect(result.level).toBe('critical');
    });

    it('detects repeated patterns', () => {
      const result = calculateEntropy('aaaaaa');
      expect(result.penalties.some(p => p.type === 'repeated_pattern')).toBe(true);
      
      const result2 = calculateEntropy('ababab');
      expect(result2.penalties.some(p => p.type === 'repeated_pattern')).toBe(true);
    });

    it('detects date patterns', () => {
      const result = calculateEntropy('password2024');
      expect(result.penalties.some(p => p.type === 'date_pattern')).toBe(true);
      
      const result2 = calculateEntropy('15.05.2026');
      expect(result2.penalties.some(p => p.type === 'date_pattern')).toBe(true);
    });

    it('applies penalty for short length', () => {
      const result = calculateEntropy('A1b!');
      expect(result.penalties.some(p => p.type === 'short_length')).toBe(true);
    });

    it('identifies strong passwords', () => {
      const result = calculateEntropy('K9#p2$Mv8*Xq5Lz!');
      expect(result.level).toBe('excellent');
      expect(result.score).toBeGreaterThanOrEqual(95);
      expect(result.penalties.length).toBe(0);
    });

    it('handles leet-speak dictionary matching', () => {
      const result = calculateEntropy('p4ssw0rd');
      expect(result.penalties.some(p => p.type === 'common_password')).toBe(true);
    });
  });

  describe('meetsMinimumEntropy', () => {
    it('returns false for weak passwords', () => {
      expect(meetsMinimumEntropy('123456')).toBe(false);
    });

    it('returns true for sufficiently strong passwords', () => {
      expect(meetsMinimumEntropy('Tr0ub4dor&3')).toBe(true);
    });
  });
});
