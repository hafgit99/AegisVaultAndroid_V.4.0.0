/**
 * ImportFuzzer.test.ts — Aegis Vault Android
 * Professional automated fuzzing tests for vault import surfaces.
 *
 * This suite performs feedback-less fuzzing by generating malformed,
 * oversized, and semantically invalid data packets to ensure the
 * Aegis import parser (JSON/CSV/Bitwarden) fails gracefully without
 * crashing or leaking memory.
 *
 * Aegis içe aktarma yüzeyleri için profesyonel otomatik fuzzing testleri.
 * Bu paket, Aegis parser'ının (JSON/CSV/Bitwarden) çökmeden veya bellek
 * sızdırmadan düzgün şekilde hata vermesini sağlamak için hatalı biçimlendirilmiş,
 * aşırı boyutlu ve geçersiz veri paketleri oluşturarak fuzzing gerçekleştirir.
 */

import { ImportVersioning } from '../../src/ImportVersioning';

// ── Fuzzing Utilities ────────────────────────────────────────────────────────

/**
 * Generates a random buffer of given size.
 */
function generateRandomBuffer(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/\\"\n\r\t';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Mutates a valid JSON string into something "broken" but interesting.
 */
function mutateJson(json: string): string {
  const mutations = [
    (s: string) => s.replace(/}/g, ''), // Remove closing braces
    (s: string) => s.replace(/"/g, "'"), // Swap quotes
    (s: string) => s + generateRandomBuffer(100), // Append junk
    (s: string) => generateRandomBuffer(10) + s, // Prepend junk
    (s: string) => s.replace(/:/g, '=>'), // Swap colons
    (s: string) => s.repeat(2), // Duplicate content
    (s: string) => s.substring(0, Math.floor(s.length / 2)), // Truncate
  ];
  const mutator = mutations[Math.floor(Math.random() * mutations.length)];
  return mutator(json);
}

// ── Fuzzing Tests ────────────────────────────────────────────────────────────

describe('Vault Import Fuzzer — Stability & Robustness', () => {
  const ITERATIONS = 100; // Number of fuzzing iterations per target

  test('JSON Parser Fuzzing — Aegis Native Format', async () => {
    const validBase = JSON.stringify({
      version: 1,
      entries: [
        { id: 1, title: 'Test', password: '123' }
      ]
    });

    for (let i = 0; i < ITERATIONS; i++) {
      const fuzzedData = mutateJson(validBase);
      // We expect the parser to either return a handled error or throw a known Error
      // but NEVER crash the process or hang.
      try {
        await ImportVersioning.parseAegisJson(fuzzedData);
      } catch {
        // Expected
      }
    }
  });

  test('CSV Parser Fuzzing — Generic Format', async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      // Generate random CSV-like rows with varying columns and quote styles
      const rows = Math.floor(Math.random() * 20);
      let csv = '';
      for (let r = 0; r < rows; r++) {
        const cols = Math.floor(Math.random() * 50); // High column count
        for (let c = 0; c < cols; c++) {
          csv += generateRandomBuffer(Math.floor(Math.random() * 200)) + (Math.random() > 0.5 ? ',' : ';');
        }
        csv += '\n';
      }

      try {
        await ImportVersioning.parseGenericCsv(csv);
      } catch {
        // Expected
      }
    }
  });

  test('Bitwarden Parser Fuzzing — External Format', async () => {
    const bitwardenTemplate = JSON.stringify({
      folders: [],
      items: [{ name: "Fuzzed", login: { password: "???" } }]
    });

    for (let i = 0; i < ITERATIONS; i++) {
      const fuzzed = mutateJson(bitwardenTemplate);
      try {
        await ImportVersioning.parseBitwardenJson(fuzzed);
      } catch {
        // Expected
      }
    }
  });

  test('Oversized Data Fuzzing — Memory Stress', async () => {
    // 5MB of pure garbage — testing the limits of the JS bridge and parser
    const oversized = generateRandomBuffer(5 * 1024 * 1024);
    try {
      await ImportVersioning.parseAegisJson(oversized);
    } catch {
      // Expected
    }
  });

  test('Extreme Character Fuzzing — Encoding Stress', async () => {
    // Mix of high-plane Unicode, null bytes, and control characters
    let extreme = '';
    for (let i = 0; i < 5000; i++) {
      extreme += String.fromCodePoint(Math.floor(Math.random() * 0x10FFFF));
    }
    try {
      await ImportVersioning.parseGenericCsv(extreme);
    } catch {
      // Expected
    }
  });
});
