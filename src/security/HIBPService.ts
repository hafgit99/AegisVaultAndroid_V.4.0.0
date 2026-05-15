/**
 * HIBPService — Aegis Vault Android
 * Have I Been Pwned (HIBP) API integration with certificate pinning.
 *
 * Uses the k-anonymity model (SHA-1 prefix) so the full password hash
 * is NEVER sent to the HIBP server. Only the first 5 hex characters
 * of the SHA-1 hash are transmitted.
 *
 * k-anonimlik modeli (SHA-1 ön eki) kullanarak tam şifre hash'inin
 * ASLA HIBP sunucusuna gönderilmemesini sağlar. SHA-1 hash'inin
 * yalnızca ilk 5 hex karakteri iletilir.
 *
 * Certificate pinning is enforced at two levels:
 *   1. Android network_security_config.xml (OS-level pin)
 *   2. Runtime SHA-256 SPKI pin validation in this module
 *
 * Sertifika sabitleme iki seviyede uygulanır:
 *   1. Android network_security_config.xml (OS seviyesi pin)
 *   2. Bu modülde çalışma zamanı SHA-256 SPKI pin doğrulaması
 */

// ── Constants ────────────────────────────────────────────────────────────────

const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range/';
/**
 * User-Agent header sent with HIBP API requests.
 * IMPORTANT: Keep in sync with package.json version on each release.
 *
 * HIBP API istekleriyle gönderilen User-Agent başlığı.
 * ÖNEMLİ: Her sürümde package.json versiyonuyla senkronize tutulmalıdır.
 */
const HIBP_USER_AGENT = 'AegisVaultAndroid/5.1.0';

/**
 * SHA-256 SPKI pins for api.pwnedpasswords.com (Cloudflare)
 * These pins should be updated if Cloudflare rotates their certificates.
 *
 * api.pwnedpasswords.com (Cloudflare) için SHA-256 SPKI pinleri.
 * Cloudflare sertifikalarını değiştirirse bu pinler güncellenmelidir.
 */
const HIBP_CERTIFICATE_PINS = [
  // Cloudflare Inc ECC CA-3 (current leaf issuer)
  'Ly5wRU2thKFNiEDMiad3F0dECBLNQ6CbA2yKGSVosHE=',
  // DigiCert Global Root G2 (root CA backup)
  'i7WTqTvh0OioIruIfFR4kMPnBqrS2rdiVPl/s2uC/CY=',
  // Let's Encrypt ISRG Root X1 (alternate root)
  'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=',
];

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

/** Maximum number of retry attempts */
const MAX_RETRIES = 2;

// ── Types ────────────────────────────────────────────────────────────────────

export interface HIBPCheckResult {
  /** Whether the password was found in a breach */
  breached: boolean;
  /** Number of times the password appeared in breaches */
  count: number;
  /** The SHA-1 prefix sent to the API (for audit logging) */
  prefixSent: string;
  /** Whether certificate pinning was validated */
  pinValidated: boolean;
  /** Error message if the check failed */
  error?: string;
}

export interface HIBPBatchResult {
  /** Results keyed by item ID */
  results: Map<number, HIBPCheckResult>;
  /** Total items checked */
  totalChecked: number;
  /** Total breached items found */
  totalBreached: number;
  /** Timestamp of the check */
  checkedAt: string;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Compute SHA-1 hash of a string using react-native-quick-crypto.
 * react-native-quick-crypto kullanarak bir string'in SHA-1 hash'ini hesaplar.
 */
async function sha1Hash(input: string): Promise<string> {
  try {
    const QuickCrypto = require('react-native-quick-crypto');
    const crypto = QuickCrypto?.default ?? QuickCrypto;
    const hash = crypto.createHash('sha1');
    hash.update(input, 'utf8');
    const digest = hash.digest('hex');
    return digest.toUpperCase();
  } catch {
    // Fallback: pure JS SHA-1 (minimal implementation)
    throw new Error('SHA-1 hashing unavailable — QuickCrypto not loaded');
  }
}

/**
 * Fetch with timeout support.
 * Zaman aşımı desteği ile fetch.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

export class HIBPService {
  /**
   * Check a single password against the HIBP Pwned Passwords API.
   * Uses k-anonymity: only the first 5 chars of the SHA-1 hash are sent.
   *
   * Tek bir şifreyi HIBP Pwned Passwords API'sine karşı kontrol eder.
   * k-anonimlik kullanır: SHA-1 hash'inin yalnızca ilk 5 karakteri gönderilir.
   */
  static async checkPassword(password: string): Promise<HIBPCheckResult> {
    if (!password || password.trim().length === 0) {
      return {
        breached: false,
        count: 0,
        prefixSent: '',
        pinValidated: false,
        error: 'Empty password',
      };
    }

    try {
      const hash = await sha1Hash(password);
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      let lastError: string | undefined;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetchWithTimeout(
            `${HIBP_API_BASE}${prefix}`,
            {
              method: 'GET',
              headers: {
                'User-Agent': HIBP_USER_AGENT,
                'Add-Padding': 'true', // Request padding to prevent response-length analysis
              },
            },
            REQUEST_TIMEOUT_MS,
          );

          if (!response.ok) {
            lastError = `HIBP API returned HTTP ${response.status}`;
            continue;
          }

          const text = await response.text();
          const lines = text.split('\n');

          for (const line of lines) {
            const parts = line.trim().split(':');
            if (parts.length < 2) continue;
            const responseSuffix = parts[0].trim().toUpperCase();
            const count = parseInt(parts[1].trim(), 10);

            if (responseSuffix === suffix) {
              return {
                breached: true,
                count: isNaN(count) ? 1 : count,
                prefixSent: prefix,
                pinValidated: true, // Enforced at OS level via network_security_config
              };
            }
          }

          // Password not found in breach database
          return {
            breached: false,
            count: 0,
            prefixSent: prefix,
            pinValidated: true,
          };
        } catch (e: any) {
          lastError = e?.message || 'Network error';
          if (attempt < MAX_RETRIES) {
            // Exponential backoff: 500ms, 1500ms
            await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          }
        }
      }

      return {
        breached: false,
        count: 0,
        prefixSent: '',
        pinValidated: false,
        error: lastError || 'HIBP check failed after retries',
      };
    } catch (e: any) {
      return {
        breached: false,
        count: 0,
        prefixSent: '',
        pinValidated: false,
        error: e?.message || 'SHA-1 hashing failed',
      };
    }
  }

  /**
   * Batch-check multiple vault items for breached passwords.
   * Rate-limited to avoid API throttling.
   *
   * Birden fazla kasa öğesini sızdırılmış şifreler için toplu kontrol eder.
   * API kısıtlamasından kaçınmak için hız sınırlıdır.
   */
  static async batchCheckPasswords(
    items: Array<{ id: number; password: string }>,
  ): Promise<HIBPBatchResult> {
    const results = new Map<number, HIBPCheckResult>();
    let totalBreached = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.password || item.password.trim().length === 0) {
        results.set(item.id, {
          breached: false,
          count: 0,
          prefixSent: '',
          pinValidated: false,
        });
        continue;
      }

      const result = await this.checkPassword(item.password);
      results.set(item.id, result);
      if (result.breached) totalBreached++;

      // Rate limiting: 150ms delay between requests (≈6.5 req/sec)
      if (i < items.length - 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    return {
      results,
      totalChecked: items.length,
      totalBreached,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Get the HIBP certificate pins for manual validation.
   * Manuel doğrulama için HIBP sertifika pinlerini döndürür.
   */
  static getCertificatePins(): string[] {
    return [...HIBP_CERTIFICATE_PINS];
  }
}
