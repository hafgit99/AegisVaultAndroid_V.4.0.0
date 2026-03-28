/**
 * SearchService — Aegis Vault Android v4.02
 * High-performance, score-weighted search engine for encrypted vault entries.
 * Ported from desktop SearchService.ts, adapted for React Native VaultItem type.
 *
 * Yüksek performanslı, skor-tabanlı arama motoru.
 * HMAC uyumlu prefix tokenization ve bulanık arama desteği.
 *
 * Skor Sistemi:
 * - Başlıkta prefix match: 120 puan
 * - Başlıkta içerik: 90 puan
 * - Kullanıcı adında içerik: 60 puan
 * - URL/Website: 50 puan
 * - Etiketler: 40 puan
 * - Kategori: 35 puan
 * - Subsequence: 20 puan
 */

import type { VaultItem } from './SecurityModule';

export type SearchScope = 'all' | 'title' | 'username' | 'tags';

export class SearchService {
  /**
   * Normalize text for search: lowercase, remove accents, strip special chars.
   * Arama için metin normalleştirme: küçük harf, aksan temizliği, özel karakter dönüşümü.
   */
  static normalize(value: string = ''): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\u00e7\u015f\u011f\u0131\u00f6\u00fc]/g, ' ')
      .trim();
  }

  /**
   * Tokenize fields into words and 2-8 char prefixes for indexing.
   * Alanları kelimelerine ve 2-8 karakterlik prefixlerine ayır (İndeksleme için).
   */
  static tokenize(fields: string[]): string[] {
    const tokenSet = new Set<string>();
    for (const rawField of fields) {
      const normalized = this.normalize(rawField || '');
      if (!normalized) continue;

      const parts = normalized.split(/\s+/).filter(Boolean);
      for (const token of parts) {
        tokenSet.add(token);
        // Add prefixes (min 2, max 8 chars or token length)
        const maxPrefix = Math.min(8, token.length);
        for (let i = 2; i <= maxPrefix; i++) {
          tokenSet.add(token.slice(0, i));
        }
      }
    }
    return Array.from(tokenSet).slice(0, 256); // Max 256 tokens (performance & storage)
  }

  /**
   * Subsequence (LCS-like) matching.
   * Checks if all chars in `needle` appear in `haystack` in order.
   * 'needle' karakterlerinin 'haystack' içinde sırasıyla olup olmadığını kontrol eder.
   */
  static isSubsequence(needle: string, haystack: string): boolean {
    if (needle.length > haystack.length) return false;
    let i = 0;
    let j = 0;
    while (i < needle.length && j < haystack.length) {
      if (needle[i] === haystack[j]) i++;
      j++;
    }
    return i === needle.length;
  }

  /**
   * In-memory (decrypted) search with score-based ranking.
   * Bellek içi (çözülmüş) skor-tabanlı arama ve sıralama.
   */
  static searchDecrypted(
    entries: VaultItem[],
    query: string,
    scope: SearchScope = 'all',
  ): VaultItem[] {
    if (!query.trim()) return entries;

    const queryTokens = query
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (queryTokens.length === 0) return entries;

    const scored = entries
      .map(entry => {
        const title = this.normalize(entry.title || '');
        const username = this.normalize(entry.username || '');
        const url = this.normalize(entry.url || '');
        const category = this.normalize(entry.category || '');

        // Parse tags from data JSON if available
        let tags: string[] = [];
        try {
          if (entry.data) {
            const parsed = JSON.parse(entry.data);
            if (Array.isArray(parsed.tags)) {
              tags = parsed.tags.map((t: string) => this.normalize(t));
            }
          }
        } catch {
          // ignore JSON parse errors
        }

        // Determine fields based on scope
        const scopedFields =
          scope === 'title'
            ? [title]
            : scope === 'username'
            ? [username]
            : scope === 'tags'
            ? tags
            : [title, username, url, category, ...tags];

        const fullByScope = scopedFields.join(' ');

        let score = 0;
        let matchedAllTokens = true;
        let prefixMatchedAllTokens = true;

        for (const token of queryTokens) {
          if (!token) continue;

          let tokenMatched = false;
          const tokenPrefixMatched = scopedFields.some(f => f.startsWith(token));
          if (!tokenPrefixMatched) prefixMatchedAllTokens = false;

          // Title weight (highest)
          if ((scope === 'all' || scope === 'title') && title.startsWith(token)) {
            score += 120;
            tokenMatched = true;
          } else if ((scope === 'all' || scope === 'title') && title.includes(token)) {
            score += 90;
            tokenMatched = true;
          }

          // Username weight
          if (!tokenMatched && (scope === 'all' || scope === 'username') && username.includes(token)) {
            score += 60;
            tokenMatched = true;
          }

          // URL weight
          if (!tokenMatched && scope === 'all' && url.includes(token)) {
            score += 50;
            tokenMatched = true;
          }

          // Category weight
          if (!tokenMatched && scope === 'all' && category.includes(token)) {
            score += 35;
            tokenMatched = true;
          }

          // Tags weight
          if (!tokenMatched && (scope === 'all' || scope === 'tags') && tags.some(tag => tag.includes(token))) {
            score += 40;
            tokenMatched = true;
          }

          // Subsequence matching (min 3 chars)
          if (!tokenMatched && token.length >= 3 && this.isSubsequence(token, fullByScope)) {
            score += 20;
            tokenMatched = true;
          }

          if (!tokenMatched) {
            matchedAllTokens = false;
            break;
          }
        }

        return { entry, score, matchedAllTokens, prefixMatchedAllTokens };
      })
      .filter(item => item.matchedAllTokens);

    // If there are exact prefix matches, prioritize them
    const hasPrefixOnlySet = scored.some(item => item.prefixMatchedAllTokens);
    const resultItems = hasPrefixOnlySet
      ? scored.filter(item => item.prefixMatchedAllTokens || item.score > 100)
      : scored;

    return resultItems
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Secondary sort by update time
        const aTime = a.entry.updated_at ? new Date(a.entry.updated_at).getTime() : 0;
        const bTime = b.entry.updated_at ? new Date(b.entry.updated_at).getTime() : 0;
        return bTime - aTime;
      })
      .map(item => item.entry);
  }
}
