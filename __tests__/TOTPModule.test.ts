import {
  generateTOTP,
  parseOtpauthURI,
  isValidTOTPSecret,
  base32Decode,
} from '../src/TOTPModule';

describe('TOTPModule', () => {
  describe('base32Decode', () => {
    it('decodes standard base32 strings', () => {
      const result = base32Decode('JBSWY3DP'); // "Hello"
      expect(result.toString('hex')).toBe('48656c6c6f');
    });

    it('cleans input and ignores invalid characters', () => {
      const result = base32Decode('jbs-w y3dp!'); // should be same as JBSWY3DP
      expect(result.toString('hex')).toBe('48656c6c6f');
    });

    it('handles padding characters at the end', () => {
      const result = base32Decode('JBSWY3DP====');
      expect(result.toString('hex')).toBe('48656c6c6f');
    });

    it('strips even a single trailing padding char but keeps payload stable', () => {
      const result = base32Decode('JBSWY3DP=');
      expect(result.toString('hex')).toBe('48656c6c6f');
    });

    it('returns empty buffer when all chars are invalid', () => {
      const result = base32Decode('!!!---===');
      expect(result.toString('hex')).toBe('');
    });
  });

  describe('generateTOTP', () => {
    test('honors custom period when calculating remaining window', () => {
      const result = generateTOTP({
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 90_000,
        period: 60,
      });

      expect(result.period).toBe(60);
      expect(result.remaining).toBe(30);
      expect(result.progress).toBeCloseTo(0.5, 5);
    });

    test('returns deterministic output for same inputs', () => {
      const params = {
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 1111111109000,
        period: 30,
        algorithm: 'sha1' as const,
        digits: 6,
      };

      const first = generateTOTP(params);
      const second = generateTOTP(params);

      expect(first.code).toBe(second.code);
      expect(first.code).toMatch(/^\d{6}$/);
    });

    test('supports SHA256 and SHA512', () => {
      const params = {
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 1111111109000,
      };

      const sha256 = generateTOTP({ ...params, algorithm: 'sha256' });
      const sha512 = generateTOTP({ ...params, algorithm: 'sha512' });

      expect(sha256.code).toMatch(/^\d{6}$/);
      expect(sha512.code).toMatch(/^\d{6}$/);
      expect(sha256.code).not.toBe(sha512.code);
    });

    test('supports different digit counts', () => {
      const result = generateTOTP({
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 1111111109000,
        digits: 8,
      });
      expect(result.code).toHaveLength(8);
    });

    test('new time windows generate new codes', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const current = generateTOTP({ secret, timestamp: 1111111109000 });
      const next = generateTOTP({ secret, timestamp: 1111111139000 });

      expect(current.code).not.toBe(next.code);
    });

    test('normalizes dashed algorithm names', () => {
      const dashed = generateTOTP({
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 1111111109000,
        algorithm: 'SHA-512',
      });
      const plain = generateTOTP({
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 1111111109000,
        algorithm: 'sha512',
      });

      expect(dashed.code).toBe(plain.code);
    });

    test('uses Date.now when timestamp is omitted', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1111111109000);

      const implicit = generateTOTP({ secret: 'JBSWY3DPEHPK3PXP' });
      const explicit = generateTOTP({
        secret: 'JBSWY3DPEHPK3PXP',
        timestamp: 1111111109000,
      });

      expect(implicit).toEqual(explicit);
    });

    test('supports 8 digit RFC style windows without losing zero padding', () => {
      const result = generateTOTP({
        secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
        timestamp: 59_000,
        digits: 8,
      });

      expect(result.code).toMatch(/^\d{8}$/);
      expect(result.remaining).toBe(1);
      expect(result.progress).toBeCloseTo(29 / 30, 5);
    });
  });

  describe('parseOtpauthURI', () => {
    test('parses standard URIs', () => {
      const parsed = parseOtpauthURI(
        'otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30',
      );

      expect(parsed).not.toBeNull();
      expect(parsed?.issuer).toBe('GitHub');
      expect(parsed?.account).toBe('user@example.com');
    });

    test('handles labels without colon', () => {
      const parsed = parseOtpauthURI('otpauth://totp/MyAccount?secret=ABC');
      expect(parsed?.account).toBe('MyAccount');
      expect(parsed?.issuer).toBe('');
    });

    test('rejects malformed schemes', () => {
      expect(parseOtpauthURI('http://totp/something')).toBeNull();
      expect(parseOtpauthURI('otpauth://hotp/test')).toBeNull();
    });

    test('handles missing query parameters with defaults', () => {
      const parsed = parseOtpauthURI('otpauth://totp/test?secret=ABC');
      expect(parsed?.period).toBe(30);
      expect(parsed?.digits).toBe(6);
      expect(parsed?.algorithm).toBe('SHA1');
    });

    test('derives issuer from label when query issuer is missing', () => {
      const parsed = parseOtpauthURI(
        'otpauth://totp/ACME:user%40example.com?secret=ABC&period=45&digits=8&algorithm=sha256',
      );

      expect(parsed).toEqual({
        secret: 'ABC',
        issuer: 'ACME',
        account: 'user@example.com',
        period: 45,
        digits: 8,
        algorithm: 'SHA256',
      });
    });

    test('preserves extra colons in account labels', () => {
      const parsed = parseOtpauthURI(
        'otpauth://totp/Issuer:team:user%40example.com?secret=ABC',
      );

      expect(parsed?.issuer).toBe('Issuer');
      expect(parsed?.account).toBe('team:user@example.com');
    });

    test('falls back to defaults when period or digits are invalid', () => {
      const parsed = parseOtpauthURI(
        'otpauth://totp/test?secret=ABC&period=NaN&digits=0',
      );

      expect(parsed?.period).toBe(30);
      expect(parsed?.digits).toBe(6);
    });

    test('returns null when decodeURIComponent throws', () => {
      expect(parseOtpauthURI('otpauth://totp/%E0%A4%A?secret=ABC')).toBeNull();
    });
  });

  describe('isValidTOTPSecret', () => {
    test('accepts valid base32 and rejects invalid inputs', () => {
      expect(isValidTOTPSecret('JBSWY3DPEHPK3PXP')).toBe(true);
      expect(isValidTOTPSecret('jbsw y3dp-ehpk 3pxp')).toBe(true);
      expect(isValidTOTPSecret('')).toBe(false);
      expect(isValidTOTPSecret('  ABC  ')).toBe(false); // too short
      expect(isValidTOTPSecret('INVALID!@#')).toBe(false);
    });

    test('enforces exact base32 alphabet from start to end', () => {
      expect(isValidTOTPSecret('ABCDEFG2')).toBe(true);
      expect(isValidTOTPSecret('ABCDEFG8')).toBe(false);
      expect(isValidTOTPSecret('ABCDEFG/')).toBe(false);
    });
  });
});
