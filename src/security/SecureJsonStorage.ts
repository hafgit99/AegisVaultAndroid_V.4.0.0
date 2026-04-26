import RNFS from 'react-native-fs';

interface SecureStorageDriver {
  getItem?: (key: string) => Promise<string | null>;
  setItem?: (key: string, value: string) => Promise<boolean>;
}

interface SecureJsonStorageOptions {
  secureStorage?: SecureStorageDriver;
  onWarning?: (...args: any[]) => void;
}

export const readSecureJson = async <T>(
  secureKey: string,
  legacyFile: string,
  fallback: T,
  options: SecureJsonStorageOptions = {},
): Promise<T> => {
  const { secureStorage, onWarning } = options;
  if (secureStorage?.getItem) {
    try {
      const secureValue = await secureStorage.getItem(secureKey);
      if (secureValue) return JSON.parse(secureValue) as T;
    } catch (e) {
      onWarning?.('[Security] SecureStorage read failed:', e);
    }
  }

  try {
    if (await RNFS.exists(legacyFile)) {
      const json = await RNFS.readFile(legacyFile, 'utf8');
      const parsed = JSON.parse(json) as T;
      if (secureStorage?.setItem) {
        await writeSecureJson(secureKey, legacyFile, parsed, options).catch(() => {});
      }
      return parsed;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

export const writeSecureJson = async <T>(
  secureKey: string,
  legacyFile: string,
  value: T,
  options: SecureJsonStorageOptions = {},
): Promise<void> => {
  const json = JSON.stringify(value);
  if (options.secureStorage?.setItem) {
    const ok = await options.secureStorage.setItem(secureKey, json);
    if (!ok) throw new Error('SecureStorage write was rejected');
    await RNFS.unlink(legacyFile).catch(() => {});
    return;
  }
  await RNFS.writeFile(legacyFile, json, 'utf8');
};
