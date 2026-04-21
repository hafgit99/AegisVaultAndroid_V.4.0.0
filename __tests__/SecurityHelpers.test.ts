import {
  __bufToBase64,
  __bufToUtf8,
  __base64ToBuf,
  __hexToBuf,
  __bufToHex,
} from '../src/SecurityModule';

describe('SecurityModule Helpers', () => {
  describe('__bufToBase64', () => {
    it('correctly encodes Uint8Array to base64', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      expect(__bufToBase64(data)).toBe('SGVsbG8=');
    });

    it('handles different padding lengths', () => {
      expect(__bufToBase64(new Uint8Array([65]))).toBe('QQ=='); // "A"
      expect(__bufToBase64(new Uint8Array([65, 66]))).toBe('QUI='); // "AB"
      expect(__bufToBase64(new Uint8Array([65, 66, 67]))).toBe('QUJD'); // "ABC"
    });

    it('handles ArrayBuffer input', () => {
      const buf = new Uint8Array([72, 105]).buffer;
      expect(__bufToBase64(buf)).toBe('SGk=');
    });

    it('handles typed array view input (buffer property)', () => {
      const data = new Uint32Array([0x12345678]);
      const b64 = __bufToBase64(data);
      expect(typeof b64).toBe('string');
      expect(b64.length).toBeGreaterThan(0);
    });

    it('handles fallback to new Uint8Array for other types', () => {
      expect(__bufToBase64([65, 66] as any)).toBe('QUI=');
    });
  });

  describe('__bufToUtf8', () => {
    it('decodes buffer to utf8 string', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      expect(__bufToUtf8(data)).toBe('Hello');
    });

    it('handles multi-byte characters', () => {
      // "€" in UTF-8 is [0xE2, 0x82, 0xAC]
      const data = new Uint8Array([0xe2, 0x82, 0xac]);
      expect(__bufToUtf8(data)).toBe('€');
    });

    it('falls back to String.fromCharCode for invalid UTF-8', () => {
      // 0xFF is invalid UTF-8
      const data = new Uint8Array([0xff]);
      expect(__bufToUtf8(data)).toBe('\xff');
    });
  });

  describe('__base64ToBuf', () => {
    it('decodes base64 to Uint8Array', () => {
      const b64 = 'SGVsbG8=';
      const buf = __base64ToBuf(b64);
      expect(buf).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('handles different padding', () => {
      expect(__base64ToBuf('QQ==')).toEqual(new Uint8Array([65]));
      expect(__base64ToBuf('QUI=')).toEqual(new Uint8Array([65, 66]));
      expect(__base64ToBuf('QUJD')).toEqual(new Uint8Array([65, 66, 67]));
    });

    it('handles missing padding (if input is non-standard but valid)', () => {
      // Technically our implementation handles missing padding because it calculates length
      expect(__base64ToBuf('SGVsbG8')).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });
  });

  describe('__hexToBuf', () => {
    it('decodes hex string to Uint8Array', () => {
      expect(__hexToBuf('48656c6c6f')).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('handles empty string', () => {
      expect(__hexToBuf('')).toEqual(new Uint8Array([]));
    });
  });

  describe('__bufToHex', () => {
    it('encodes buffer to hex string', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      expect(__bufToHex(data)).toBe('48656c6c6f');
    });

    it('pads single digits with zero', () => {
      expect(__bufToHex(new Uint8Array([0, 1, 10, 15, 16]))).toBe('00010a0f10');
    });
  });
});
