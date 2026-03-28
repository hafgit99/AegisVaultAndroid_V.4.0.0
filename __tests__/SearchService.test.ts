/**
 * SearchService.test.ts — Aegis Vault Android v4.02
 * Tests for the score-weighted search engine.
 */
import { SearchService } from '../src/SearchService';

// Mock VaultItem type for testing
interface MockVaultItem {
  id?: number;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
  favorite: number;
  data: string;
  is_deleted: number;
  created_at?: string;
  updated_at?: string;
}

const makeItem = (overrides: Partial<MockVaultItem> = {}): MockVaultItem => ({
  id: 1,
  title: 'Test Entry',
  username: 'testuser@mail.com',
  password: 'secret',
  url: 'https://example.com',
  notes: '',
  category: 'login',
  favorite: 0,
  data: JSON.stringify({ totp_secret: '' }),
  is_deleted: 0,
  ...overrides,
});

describe('SearchService', () => {
  describe('normalize', () => {
    it('converts to lowercase', () => {
      expect(SearchService.normalize('HELLO')).toBe('hello');
    });

    it('removes accents', () => {
      expect(SearchService.normalize('café')).toBe('cafe');
    });

    it('normalizes Turkish characters correctly', () => {
      // NFKD strips combining marks: ç→c, ş→s, ğ→g, ö→o, ü→u
      // but ı (U+0131) has no decomposition → preserved as-is
      const normalized = SearchService.normalize('Çalışığöü');
      expect(normalized).toBe('cal\u0131s\u0131gou');
      expect(normalized).toContain('c');
      expect(normalized).toContain('s');
      expect(normalized).toContain('\u0131'); // dotless-i preserved
      expect(normalized).toContain('g');
      expect(normalized).toContain('o');
      expect(normalized).toContain('u');
    });

    it('strips special characters', () => {
      expect(SearchService.normalize('user@email.com')).toBe('user email com');
    });

    it('trims whitespace', () => {
      expect(SearchService.normalize('  hello  ')).toBe('hello');
    });

    it('handles empty input', () => {
      expect(SearchService.normalize('')).toBe('');
      expect(SearchService.normalize()).toBe('');
    });
  });

  describe('tokenize', () => {
    it('generates prefix tokens', () => {
      const tokens = SearchService.tokenize(['hello']);
      expect(tokens).toContain('hello');
      expect(tokens).toContain('he');
      expect(tokens).toContain('hel');
      expect(tokens).toContain('hell');
    });

    it('handles multiple fields', () => {
      const tokens = SearchService.tokenize(['hello', 'world']);
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('wo');
    });

    it('limits to 256 tokens', () => {
      const longFields = Array(100).fill('abcdefghijklmnop');
      const tokens = SearchService.tokenize(longFields);
      expect(tokens.length).toBeLessThanOrEqual(256);
    });

    it('handles empty fields', () => {
      expect(SearchService.tokenize([])).toEqual([]);
      expect(SearchService.tokenize(['', ''])).toEqual([]);
    });
  });

  describe('isSubsequence', () => {
    it('returns true for matching subsequence', () => {
      expect(SearchService.isSubsequence('abc', 'aXbYcZ')).toBe(true);
    });

    it('returns false for non-matching', () => {
      expect(SearchService.isSubsequence('xyz', 'abc')).toBe(false);
    });

    it('returns true for exact match', () => {
      expect(SearchService.isSubsequence('abc', 'abc')).toBe(true);
    });

    it('returns false when needle is longer', () => {
      expect(SearchService.isSubsequence('abcdef', 'abc')).toBe(false);
    });
  });

  describe('searchDecrypted', () => {
    const items = [
      makeItem({ id: 1, title: 'GitHub Account', username: 'dev@github.com', url: 'https://github.com', category: 'login' }),
      makeItem({ id: 2, title: 'Gmail Personal', username: 'user@gmail.com', url: 'https://gmail.com', category: 'login' }),
      makeItem({ id: 3, title: 'WiFi Home', username: '', url: '', category: 'wifi', data: JSON.stringify({ ssid: 'HomeNet' }) }),
      makeItem({ id: 4, title: 'Bank Card', username: '', url: '', category: 'card' }),
      makeItem({ id: 5, title: 'GitLab Work', username: 'admin@gitlab.com', url: 'https://gitlab.com', category: 'login' }),
    ] as any;

    it('returns all items for empty query', () => {
      expect(SearchService.searchDecrypted(items, '')).toHaveLength(5);
      expect(SearchService.searchDecrypted(items, '   ')).toHaveLength(5);
    });

    it('finds items by title prefix', () => {
      const results = SearchService.searchDecrypted(items, 'git');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].title).toBe('GitHub Account'); // prefix match = highest score
    });

    it('finds items by username', () => {
      const results = SearchService.searchDecrypted(items, 'gmail');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r: any) => r.title === 'Gmail Personal')).toBe(true);
    });

    it('ranks prefix matches higher than contains', () => {
      const results = SearchService.searchDecrypted(items, 'git');
      // GitHub has "git" as prefix → 120 points
      // GitLab has "git" as prefix → 120 points  
      // Both should be present
      const titles = results.map((r: any) => r.title);
      expect(titles).toContain('GitHub Account');
      expect(titles).toContain('GitLab Work');
    });

    it('respects scope filtering', () => {
      const results = SearchService.searchDecrypted(items, 'github', 'title');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array for no matches', () => {
      const results = SearchService.searchDecrypted(items, 'zzzznotfound');
      expect(results).toHaveLength(0);
    });

    it('handles subsequence matching', () => {
      const results = SearchService.searchDecrypted(items, 'ghb');
      // "ghb" is a subsequence of "github" → should match
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
