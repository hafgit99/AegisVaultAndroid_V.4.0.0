import {
  generateTOTP,
  parseOtpauthURI,
  isValidTOTPSecret,
} from '../src/TOTPModule';

describe('TOTPModule current behavior', () => {
  test('generateTOTP returns deterministic output for same inputs', () => {
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
    expect(first.remaining).toBeGreaterThan(0);
    expect(first.remaining).toBeLessThanOrEqual(30);
  });

  test('generateTOTP supports multiple algorithms and digit counts', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const timestamp = 1234567890000;

    const sha1 = generateTOTP({ secret, timestamp, algorithm: 'sha1', digits: 6 });
    const sha256 = generateTOTP({
      secret,
      timestamp,
      algorithm: 'sha256',
      digits: 8,
    });
    const sha512 = generateTOTP({
      secret,
      timestamp,
      algorithm: 'sha512',
      digits: 6,
    });

    expect(sha1.code).toHaveLength(6);
    expect(sha256.code).toHaveLength(8);
    expect(sha512.code).toHaveLength(6);
    expect(new Set([sha1.code, sha256.code, sha512.code]).size).toBeGreaterThan(1);
  });

  test('new time windows generate new codes', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const current = generateTOTP({ secret, timestamp: 1111111109000 });
    const next = generateTOTP({ secret, timestamp: 1111111139000 });

    expect(current.code).not.toBe(next.code);
  });

  test('parseOtpauthURI parses standard URIs', () => {
    const parsed = parseOtpauthURI(
      'otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30',
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.issuer).toBe('GitHub');
    expect(parsed?.account).toContain('user@example.com');
    expect(parsed?.algorithm).toBe('SHA1');
    expect(parsed?.digits).toBe(6);
    expect(parsed?.period).toBe(30);
  });

  test('parseOtpauthURI rejects malformed schemes and formats', () => {
    expect(parseOtpauthURI('http://totp/something')).toBeNull();
    expect(parseOtpauthURI('otpauth://hotp/test')).toBeNull();
    expect(parseOtpauthURI('broken-uri')).toBeNull();
  });

  test('isValidTOTPSecret accepts valid base32 and rejects invalid inputs', () => {
    expect(isValidTOTPSecret('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isValidTOTPSecret('GEZDGNBVGY3TQOJQ')).toBe(true);
    expect(isValidTOTPSecret('')).toBe(false);
    expect(isValidTOTPSecret('INVALID!@#')).toBe(false);
    expect(isValidTOTPSecret('12345678')).toBe(false);
  });
});
