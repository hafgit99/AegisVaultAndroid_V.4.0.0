import { SecurityModule } from '../../src/SecurityModule';
import tr from '../../src/locales/tr.json';

const t = (key: string) => {
  const parts = key.split('.');
  let val: any = tr;
  for (const p of parts) {
    val = val?.[p];
  }
  return val || key;
};

describe('SecurityModule Logic Tests', () => {
  describe('getPasswordStrength', () => {
    test('returns None for empty password', () => {
      const res = SecurityModule.getPasswordStrength('');
      expect(res.label).toBe(t('pw_strength.none'));
      expect(res.score).toBe(0);
    });

    test('detects weak passwords', () => {
      const res = SecurityModule.getPasswordStrength('123');
      expect(res.label).toBe(t('pw_strength.weak'));
      expect(res.score).toBeLessThanOrEqual(2);
    });

    test('penalizes common passwords', () => {
      const res = SecurityModule.getPasswordStrength('password123');
      // "password" is in COMMON_PASSWORDS. Even with length and complexity, it should be weak.
      expect(res.label).toBe(t('pw_strength.weak'));
    });

    test('penalizes sequential characters', () => {
      const res = SecurityModule.getPasswordStrength('Abc123456789!');
      // "abc" and "123" are sequences
      expect(res.label).toBe(t('pw_strength.medium'));
    });

    test('detects very strong passwords', () => {
      // Long, mixed case, numbers, symbols, no patterns
      const res = SecurityModule.getPasswordStrength('K9#mX2$pL5&vN8*qZ1@jY4');
      expect(res.label).toBe(t('pw_strength.very_strong'));
      expect(res.score).toBeGreaterThan(6);
    });

    test('penalizes repeated characters', () => {
      const res = SecurityModule.getPasswordStrength('abcabcabc');
      // Short enough to be weak if penalties apply
      expect(res.label).toBe(t('pw_strength.weak'));
    });
    
    test('detects keyboard patterns', () => {
      const res = SecurityModule.getPasswordStrength('qwerty123456');
      expect(res.label).toBe(t('pw_strength.weak'));
    });
  });

  describe('Password Generator', () => {
    test('generates password of requested length', () => {
      const pw = SecurityModule.generatePassword(16);
      expect(pw.length).toBe(16);
    });

    test('respects character set options', () => {
      const pwOnlyNumbers = SecurityModule.generatePassword(10, { lowercase: false, uppercase: false, symbols: false, numbers: true });
      expect(/^[0-9]+$/.test(pwOnlyNumbers)).toBe(true);

      const pwOnlyAlpha = SecurityModule.generatePassword(10, { lowercase: true, uppercase: true, symbols: false, numbers: false });
      expect(/^[a-zA-Z]+$/.test(pwOnlyAlpha)).toBe(true);
    });
  });
});
