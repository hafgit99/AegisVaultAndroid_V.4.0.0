import QuickCrypto from 'react-native-quick-crypto';

/**
 * Have I Been Pwned (HIBP) Integration
 * Uses k-Anonymity model. Only sends the first 5 characters of the SHA-1 hash
 * to the API. The password never leaves the device.
 */
export class HIBPModule {
  /**
   * Checks a password against the HIBP database.
   * Return value is the number of times it was compromised, or 0 if safe.
   */
  static async checkPassword(password: string): Promise<number> {
    if (!password) return 0;

    try {
      // 1. Hash the password with SHA-1
      const hash = QuickCrypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      
      // 2. Split hash: first 5 characters for API, remaining 35 for local check
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      // 3. Query HIBP API using k-Anonymity
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'User-Agent': 'AegisVault-Android' }
      });

      if (!response.ok) {
        console.error('[HIBP] API answered with status:', response.status);
        return 0;
      }

      const text = await response.text();
      const lines = text.split('\n');

      // 4. Check if our suffix exists in the compromised list
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length === 2 && parts[0].trim() === suffix) {
          return parseInt(parts[1].trim(), 10);
        }
      }

      return 0; // Safe
    } catch (e) {
      console.error('[HIBP] Network error:', e);
      return 0;
    }
  }
}
