import { generateTOTP, isValidTOTPSecret } from '../../src/TOTPModule';
import { Buffer } from '@craftzdog/react-native-buffer';

describe('TOTPModule Unit Tests', () => {
  const secret = 'JBSWY3DPEHPK3PXP'; // "Hello!" in Base32
  const timestamp = 1234567890 * 1000; // 2009-02-13T23:31:30.000Z

  test('generates correct TOTP code for standard parameters', () => {
    const result = generateTOTP({
      secret,
      timestamp,
      digits: 6,
      period: 30,
      algorithm: 'sha1'
    });
    
    // Test vector check (standard base32 secret 'JBSWY3DPEHPK3PXP' at 1234567890)
    expect(result.code).toBe('742275');
    expect(result.remaining).toBe(30);
    expect(result.progress).toBe(0);
  });

  test('validates valid base32 secret correctly', () => {
    expect(isValidTOTPSecret('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isValidTOTPSecret('jbsy 3dp ehpk 3pxp')).toBe(true); // with spaces and lowercase
    expect(isValidTOTPSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')).toBe(true);
  });

  test('identifies invalid base32 secret correctly', () => {
    expect(isValidTOTPSecret('INVALID!')).toBe(false);
    expect(isValidTOTPSecret('1')).toBe(false); // too short
    expect(isValidTOTPSecret('ABCDEF01')).toBe(false); // '0' and '1' are invalid in base32
  });

  test('handles different hash algorithms', () => {
    // SHA256
    const res256 = generateTOTP({
      secret,
      timestamp,
      algorithm: 'sha256'
    });
    expect(res256.code).toBeDefined();
    expect(res256.code.length).toBe(6);

    // SHA512
    const res512 = generateTOTP({
      secret,
      timestamp,
      algorithm: 'sha512'
    });
    expect(res512.code).toBeDefined();
    expect(res512.code.length).toBe(6);
  });

  test('calculates remaining time and progress correctly', () => {
    // 1234567890 is exactly start of a 30s period (1234567890 / 30 = 41152263.0)
    
    // Offset by 15 seconds
    const resMid = generateTOTP({
      secret,
      timestamp: (1234567890 + 15) * 1000
    });
    expect(resMid.remaining).toBe(15);
    expect(resMid.progress).toBe(0.5);

    // Offset by 29 seconds
    const resEnd = generateTOTP({
      secret,
      timestamp: (1234567890 + 29) * 1000
    });
    expect(resEnd.remaining).toBe(1);
    expect(resEnd.progress).toBeCloseTo(29/30);
  });
});
