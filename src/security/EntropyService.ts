/**
 * EntropyService — Aegis Vault Android
 * Professional entropy-based password strength calculator.
 *
 * Provides zxcvbn-style pattern detection with Shannon entropy,
 * charset analysis, and common-pattern penalties.
 *
 * Profesyonel entropi tabanlı şifre gücü hesaplayıcı.
 * Shannon entropisi, karakter seti analizi ve yaygın desen
 * cezalandırması ile zxcvbn tarzı değerlendirme sunar.
 */

// ── Common Patterns & Dictionaries ───────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', 'master',
  'dragon', 'login', 'princess', 'football', 'shadow', 'sunshine', 'trustno1',
  'iloveyou', 'batman', 'access', 'hello', 'charlie', 'donald', 'passw0rd',
  '1234567', '12345', '1234567890', 'letmein', 'welcome', 'admin', 'qwerty123',
  'password1', 'password123', '1q2w3e4r', 'test', 'guest', 'root', 'toor',
  '000000', '111111', '121212', '123123', 'zxcvbn', 'asdfgh', '654321',
  'qwertyuiop', 'master123', 'login123', 'admin123', 'administrator',
]);

const KEYBOARD_SEQUENCES = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890',
  'qazwsx', 'wsxedc', 'edcrfv', 'rfvtgb', 'tgbyhn', 'yhnujm',
  '!@#$%^&*()', 'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz', '0987654321',
];

const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
  '7': 't', '@': 'a', '!': 'i', '$': 's',
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface EntropyResult {
  /** Raw Shannon entropy in bits */
  entropyBits: number;
  /** Effective entropy after penalty deductions */
  effectiveEntropy: number;
  /** Overall score 0-100 */
  score: number;
  /** Risk level: critical | weak | fair | strong | excellent */
  level: 'critical' | 'weak' | 'fair' | 'strong' | 'excellent';
  /** Localized label (populated by caller via i18n) */
  label: string;
  /** UI color — designed for both light and dark modes */
  color: string;
  /** Detected weakness patterns */
  penalties: EntropyPenalty[];
  /** Estimated crack time description key */
  crackTimeKey: string;
  /** Character set size used in calculation */
  charsetSize: number;
}

export interface EntropyPenalty {
  type: string;
  deduction: number;
  detail: string;
}

// ── Minimum Entropy Thresholds ───────────────────────────────────────────────
// These thresholds define the minimum acceptable entropy for vault items.
// Below ENTROPY_MINIMUM_BITS, password is rejected as critically weak.

export const ENTROPY_MINIMUM_BITS = 28;
export const ENTROPY_FAIR_BITS = 40;
export const ENTROPY_STRONG_BITS = 60;
export const ENTROPY_EXCELLENT_BITS = 80;

// ── Color Palette (Dark & Light Mode Compatible) ─────────────────────────────

const COLORS = {
  critical: '#ef4444',   // Red — both modes
  weak:     '#f97316',   // Orange — both modes
  fair:     '#eab308',   // Amber — both modes
  strong:   '#22c55e',   // Green — both modes
  excellent:'#06b6d4',   // Cyan — both modes
} as const;

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Calculate Shannon entropy of a string.
 * Shannon entropisi hesaplar.
 */
function shannonEntropy(password: string): number {
  if (!password) return 0;
  const freq = new Map<string, number>();
  for (const ch of password) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  const len = password.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy * len;
}

/**
 * Determine the effective character set size.
 * Etkin karakter kümesi boyutunu belirler.
 */
function charsetSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 33;
  return Math.max(size, 1);
}

/**
 * Calculate log2-based entropy from charset and length.
 * Karakter seti ve uzunluktan log2 tabanlı entropi hesaplar.
 */
function log2Entropy(password: string): number {
  if (!password) return 0;
  return password.length * Math.log2(charsetSize(password));
}

/**
 * De-leet a password for dictionary matching.
 * Sözlük eşleştirmesi için leet-speak dönüşümünü geri alır.
 */
function deLeet(password: string): string {
  return password
    .split('')
    .map(ch => LEET_MAP[ch] || ch)
    .join('')
    .toLowerCase();
}

/**
 * Detect sequential keyboard patterns.
 * Ardışık klavye desenlerini tespit eder.
 */
function detectKeyboardSequence(password: string): boolean {
  const lower = password.toLowerCase();
  for (const seq of KEYBOARD_SEQUENCES) {
    for (let len = 4; len <= seq.length; len++) {
      for (let start = 0; start + len <= seq.length; start++) {
        const substr = seq.substring(start, start + len);
        if (lower.includes(substr)) return true;
      }
    }
  }
  return false;
}

/**
 * Detect repeated character patterns (e.g., "aaa", "ababab").
 * Tekrarlanan karakter desenlerini tespit eder.
 */
function detectRepeatedPatterns(password: string): boolean {
  // Single char repeat (3+)
  if (/(.)\1{2,}/.test(password)) return true;
  // Short pattern repeat (2-4 char pattern repeated 2+ times)
  if (/^(.{2,4})\1{1,}$/.test(password)) return true;
  return false;
}

/**
 * Detect date-like patterns (YYYY, DD/MM, etc.).
 * Tarih benzeri desenleri tespit eder.
 */
function detectDatePattern(password: string): boolean {
  return /(?:19|20)\d{2}/.test(password) ||
    /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(password);
}

/**
 * Calculate comprehensive password entropy with penalty deductions.
 * Ceza kesintileri ile kapsamlı şifre entropisi hesaplar.
 *
 * @param password - The password to analyze
 * @returns EntropyResult with score, level, penalties
 */
export function calculateEntropy(password: string): EntropyResult {
  if (!password) {
    return {
      entropyBits: 0,
      effectiveEntropy: 0,
      score: 0,
      level: 'critical',
      label: '',
      color: COLORS.critical,
      penalties: [],
      crackTimeKey: 'instant',
      charsetSize: 0,
    };
  }

  const rawEntropy = Math.max(shannonEntropy(password), log2Entropy(password));
  const penalties: EntropyPenalty[] = [];
  let totalDeduction = 0;

  // ── Dictionary Check ─────────────────────────────────────────────────────
  const lower = password.toLowerCase();
  const deleet = deLeet(password);
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(deleet)) {
    const d = rawEntropy * 0.85;
    totalDeduction += d;
    penalties.push({
      type: 'common_password',
      deduction: d,
      detail: 'Password found in common password dictionary',
    });
  }

  // ── Keyboard Sequence ────────────────────────────────────────────────────
  if (detectKeyboardSequence(password)) {
    const d = Math.min(rawEntropy * 0.3, 20);
    totalDeduction += d;
    penalties.push({
      type: 'keyboard_sequence',
      deduction: d,
      detail: 'Contains keyboard sequence pattern',
    });
  }

  // ── Repeated Patterns ────────────────────────────────────────────────────
  if (detectRepeatedPatterns(password)) {
    const d = Math.min(rawEntropy * 0.25, 15);
    totalDeduction += d;
    penalties.push({
      type: 'repeated_pattern',
      deduction: d,
      detail: 'Contains repeated character patterns',
    });
  }

  // ── Date Pattern ─────────────────────────────────────────────────────────
  if (detectDatePattern(password)) {
    const d = Math.min(rawEntropy * 0.15, 10);
    totalDeduction += d;
    penalties.push({
      type: 'date_pattern',
      deduction: d,
      detail: 'Contains date-like pattern',
    });
  }

  // ── Short Length Penalty ──────────────────────────────────────────────────
  if (password.length < 8) {
    const d = Math.min(rawEntropy * 0.4, 25);
    totalDeduction += d;
    penalties.push({
      type: 'short_length',
      deduction: d,
      detail: 'Password is shorter than 8 characters',
    });
  }

  // ── Single Charset Penalty ───────────────────────────────────────────────
  const cs = charsetSize(password);
  if (cs <= 10) {
    const d = Math.min(rawEntropy * 0.3, 15);
    totalDeduction += d;
    penalties.push({
      type: 'limited_charset',
      deduction: d,
      detail: 'Only numeric characters used',
    });
  } else if (cs <= 26) {
    const d = Math.min(rawEntropy * 0.15, 8);
    totalDeduction += d;
    penalties.push({
      type: 'limited_charset',
      deduction: d,
      detail: 'Only single-case alphabetic characters used',
    });
  }

  const effectiveEntropy = Math.max(0, rawEntropy - totalDeduction);

  // ── Score & Level ────────────────────────────────────────────────────────
  let score: number;
  let level: EntropyResult['level'];
  let crackTimeKey: string;

  if (effectiveEntropy < ENTROPY_MINIMUM_BITS) {
    score = Math.round((effectiveEntropy / ENTROPY_MINIMUM_BITS) * 25);
    level = 'critical';
    crackTimeKey = 'crack_seconds';
  } else if (effectiveEntropy < ENTROPY_FAIR_BITS) {
    score = 25 + Math.round(
      ((effectiveEntropy - ENTROPY_MINIMUM_BITS) /
        (ENTROPY_FAIR_BITS - ENTROPY_MINIMUM_BITS)) * 25,
    );
    level = 'weak';
    crackTimeKey = 'crack_hours';
  } else if (effectiveEntropy < ENTROPY_STRONG_BITS) {
    score = 50 + Math.round(
      ((effectiveEntropy - ENTROPY_FAIR_BITS) /
        (ENTROPY_STRONG_BITS - ENTROPY_FAIR_BITS)) * 25,
    );
    level = 'fair';
    crackTimeKey = 'crack_years';
  } else if (effectiveEntropy < ENTROPY_EXCELLENT_BITS) {
    score = 75 + Math.round(
      ((effectiveEntropy - ENTROPY_STRONG_BITS) /
        (ENTROPY_EXCELLENT_BITS - ENTROPY_STRONG_BITS)) * 20,
    );
    level = 'strong';
    crackTimeKey = 'crack_centuries';
  } else {
    score = Math.min(100, 95 + Math.round(
      (effectiveEntropy - ENTROPY_EXCELLENT_BITS) / 10,
    ));
    level = 'excellent';
    crackTimeKey = 'crack_impossible';
  }

  score = Math.max(0, Math.min(100, score));

  return {
    entropyBits: Math.round(rawEntropy * 100) / 100,
    effectiveEntropy: Math.round(effectiveEntropy * 100) / 100,
    score,
    level,
    label: '', // Populated by caller via i18n
    color: COLORS[level],
    penalties,
    crackTimeKey,
    charsetSize: cs,
  };
}

/**
 * Check if a password meets the minimum entropy threshold for vault storage.
 * Bir şifrenin kasa depolama için minimum entropi eşiğini karşılayıp
 * karşılamadığını kontrol eder.
 */
export function meetsMinimumEntropy(password: string): boolean {
  return calculateEntropy(password).effectiveEntropy >= ENTROPY_MINIMUM_BITS;
}

/**
 * Localize entropy result labels using i18n keys.
 * Entropi sonuç etiketlerini i18n anahtarları ile yerelleştirir.
 */
export function localizeEntropyResult(
  result: EntropyResult,
  t: (key: string) => string,
): EntropyResult {
  const labelKeys: Record<EntropyResult['level'], string> = {
    critical: 'security.entropy_critical',
    weak:     'security.entropy_weak',
    fair:     'security.entropy_fair',
    strong:   'security.entropy_strong',
    excellent:'security.entropy_excellent',
  };
  return {
    ...result,
    label: t(labelKeys[result.level]),
  };
}
