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

import { calculateEntropy } from './EntropyService';
import i18n from '../i18n';

export const getPasswordStrength = (password: string): PasswordStrength => {
  const translate = (key: string, fallback: string) =>
    {
      const translated = i18n.t(key, { defaultValue: fallback });
      return !translated || translated === key ? fallback : translated;
    };

  if (!password) {
    return {
      score: 0,
      label: translate('security.entropy_critical', 'Zayıf'),
      color: '#94a3b8',
    };
  }
  
  const result = calculateEntropy(password);
  
  const labelMap: Record<string, string> = {
    critical: translate('security.entropy_critical', 'Zayıf'),
    weak: translate('security.entropy_weak', 'Zayıf'),
    fair: translate('security.entropy_fair', 'Orta'),
    strong: translate('security.entropy_strong', 'Güçlü'),
    excellent: translate('security.entropy_excellent', 'Çok Güçlü'),
  };

  return {
    score: result.score,
    label: labelMap[result.level] || labelMap.critical,
    color: result.color,
  };
};
