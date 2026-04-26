import type { Buffer } from '@craftzdog/react-native-buffer';
import { wipeBytes } from './CryptoService';

export interface PasswordGeneratorOptions {
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  excludeAmbiguous?: boolean;
}

export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

type RandomBytesProvider = (size: number) => Buffer;

export const generatePassword = (
  len: number,
  opts: PasswordGeneratorOptions | undefined,
  randomBytes: RandomBytesProvider,
): string => {
  const options = {
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: false,
    ...opts,
  };
  let chars = '';
  if (options.lowercase) {
    chars += options.excludeAmbiguous
      ? 'abcdefghijkmnopqrstuvwxyz'
      : 'abcdefghijklmnopqrstuvwxyz';
  }
  if (options.uppercase) {
    chars += options.excludeAmbiguous
      ? 'ABCDEFGHJKLMNPQRSTUVWXYZ'
      : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  }
  if (options.numbers) {
    chars += options.excludeAmbiguous ? '23456789' : '0123456789';
  }
  if (options.symbols) chars += '!@#$%^&*_+-=?';
  if (!chars) {
    chars = options.excludeAmbiguous
      ? 'abcdefghijkmnopqrstuvwxyz'
      : 'abcdefghijklmnopqrstuvwxyz';
  }

  const max = Math.floor(65536 / chars.length) * chars.length;
  let password = '';
  while (password.length < len) {
    const remaining = len - password.length;
    const bytes = randomBytes(Math.max(2, remaining * 2));
    for (let i = 0; i + 1 < bytes.length && password.length < len; i += 2) {
      const value = bytes[i] * 256 + bytes[i + 1];
      if (value >= max) continue;
      password += chars.charAt(value % chars.length);
    }
    wipeBytes(bytes);
  }
  return password;
};

export const getPasswordStrength = (password: string): PasswordStrength => {
  if (!password) return { score: 0, label: 'Yok', color: '#94a3b8' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 20) score++;
  if (score <= 2) return { score, label: 'Zayıf', color: '#ef4444' };
  if (score <= 4) return { score, label: 'Orta', color: '#f59e0b' };
  if (score <= 5) return { score, label: 'Güçlü', color: '#22c55e' };
  return { score, label: 'Çok Güçlü', color: '#06b6d4' };
};
