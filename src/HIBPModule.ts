import QuickCrypto from 'react-native-quick-crypto';
import RNFS from 'react-native-fs';

export interface BreachCheckResult {
  status: 'safe' | 'compromised' | 'unavailable' | 'disabled';
  count: number;
  checkedAt: string | null;
  cached: boolean;
}

type CacheShape = Record<
  string,
  {
    count: number;
    checkedAt: string;
  }
>;

const BREACH_CACHE_FILE = `${RNFS.DocumentDirectoryPath}/aegis_breach_cache.json`;
const BREACH_CACHE_SECRET_FILE = `${RNFS.DocumentDirectoryPath}/aegis_breach_cache_secret.bin`;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const getSha1 = (password: string) =>
  QuickCrypto.createHash('sha1').update(password).digest('hex').toUpperCase();

let cacheSecret: string | null = null;

const getCacheSecret = async (): Promise<string> => {
  if (cacheSecret) return cacheSecret;

  try {
    const exists = await RNFS.exists(BREACH_CACHE_SECRET_FILE);
    if (exists) {
      const stored = (await RNFS.readFile(BREACH_CACHE_SECRET_FILE, 'utf8')).trim();
      if (stored.length >= 32) {
        cacheSecret = stored;
        return stored;
      }
    }
  } catch {
    // Ignore and rotate a fresh secret.
  }

  const generated = QuickCrypto.randomBytes(32).toString('hex');
  try {
    await RNFS.writeFile(BREACH_CACHE_SECRET_FILE, generated, 'utf8');
  } catch {
    // Cache privacy helper should not break product flow.
  }
  cacheSecret = generated;
  return generated;
};

const getCacheKey = async (password: string): Promise<string> => {
  const hash = getSha1(password);
  const secret = await getCacheSecret();
  return QuickCrypto.createHmac('sha256', secret)
    .update(hash)
    .digest('hex')
    .toUpperCase();
};

const readCache = async (): Promise<CacheShape> => {
  try {
    const exists = await RNFS.exists(BREACH_CACHE_FILE);
    if (!exists) return {};
    const raw = await RNFS.readFile(BREACH_CACHE_FILE, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeCache = async (cache: CacheShape) => {
  try {
    await RNFS.writeFile(BREACH_CACHE_FILE, JSON.stringify(cache), 'utf8');
  } catch {
    // Privacy helper should not break product flow.
  }
};

import { HIBPService } from './security/HIBPService';

/**
 * Have I Been Pwned (HIBP) Integration
 * Uses k-Anonymity model. Only the first 5 characters of the SHA-1 hash
 * are sent to the API. The full password never leaves the device.
 */
export class HIBPModule {
  static getPrivacyNotice(): string {
    return [
      'This check is optional and uses the Have I Been Pwned k-Anonymity API.',
      'Your full password never leaves the device.',
      'Only the first 5 characters of a SHA-1 hash prefix are sent.',
      'Results are cached locally for up to 7 days using a device-bound keyed cache.',
      'Connections are protected by certificate pinning.',
    ].join('\n');
  }

  static async clearCache(): Promise<boolean> {
    try {
      const exists = await RNFS.exists(BREACH_CACHE_FILE);
      if (exists) {
        await RNFS.unlink(BREACH_CACHE_FILE);
      }
      const secretExists = await RNFS.exists(BREACH_CACHE_SECRET_FILE);
      if (secretExists) {
        await RNFS.unlink(BREACH_CACHE_SECRET_FILE);
      }
      cacheSecret = null;
      return true;
    } catch {
      return false;
    }
  }

  static async getCachedResult(password: string): Promise<BreachCheckResult | null> {
    if (!password) return null;
    const keyedHash = await getCacheKey(password);
    const cache = await readCache();
    const cached = cache[keyedHash];
    if (!cached) return null;

    const age = Date.now() - new Date(cached.checkedAt).getTime();
    if (!Number.isFinite(age) || age > CACHE_TTL_MS) {
      return null;
    }

    return {
      status: cached.count > 0 ? 'compromised' : 'safe',
      count: cached.count,
      checkedAt: cached.checkedAt,
      cached: true,
    };
  }

  static async checkPassword(
    password: string,
    options?: { enabled?: boolean; forceRefresh?: boolean },
  ): Promise<BreachCheckResult> {
    if (!options?.enabled) {
      return {
        status: 'disabled',
        count: 0,
        checkedAt: null,
        cached: false,
      };
    }

    if (!password) {
      return {
        status: 'safe',
        count: 0,
        checkedAt: null,
        cached: false,
      };
    }

    if (!options?.forceRefresh) {
      const cached = await this.getCachedResult(password);
      if (cached) return cached;
    }

    try {
      const result = await HIBPService.checkPassword(password);
      
      if (result.error) {
        return {
          status: 'unavailable',
          count: 0,
          checkedAt: null,
          cached: false,
        };
      }

      const checkedAt = new Date().toISOString();
      const keyedHash = await getCacheKey(password);
      const cache = await readCache();
      cache[keyedHash] = { count: result.count, checkedAt };
      await writeCache(cache);

      return {
        status: result.breached ? 'compromised' : 'safe',
        count: result.count,
        checkedAt,
        cached: false,
      };
    } catch {
      const cached = await this.getCachedResult(password);
      if (cached) return cached;
      return {
        status: 'unavailable',
        count: 0,
        checkedAt: null,
        cached: false,
      };
    }
  }
}
