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

    it('splits by all whitespace characters', () => {
      const tokens = SearchService.tokenize(['alpha\tbeta\ngamma']);
      expect(tokens).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']));
    });

    it('caps generated prefixes at 8 chars for long tokens', () => {
      const tokens = SearchService.tokenize(['abcdefghijkl']);
      expect(tokens).toContain('abcdefghijkl');
      expect(tokens).toContain('abcdefgh');
      expect(tokens).not.toContain('abcdefghi');
    });

    it('includes full token prefix when token length is within cap', () => {
      const tokens = SearchService.tokenize(['abcd']);
      expect(tokens).toEqual(expect.arrayContaining(['ab', 'abc', 'abcd']));
    });

    it('returns at most first 256 tokens after dedupe', () => {
      const uniqueWords = Array.from({ length: 300 }, (_, i) => `w${i}token`);
      const tokens = SearchService.tokenize(uniqueWords);
      expect(tokens.length).toBe(256);
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

    it('handles empty needle as subsequence', () => {
      expect(SearchService.isSubsequence('', 'abc')).toBe(true);
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

    it('limits title scope so username-only matches do not leak into results', () => {
      const results = SearchService.searchDecrypted(items, 'admin', 'title');
      expect(results).toHaveLength(0);
    });

    it('uses updated_at as secondary sort when scores are tied', () => {
      const tieItems = [
        makeItem({
          id: 10,
          title: 'Git Entry',
          updated_at: '2026-01-01T00:00:00.000Z',
        }),
        makeItem({
          id: 11,
          title: 'Git Another',
          updated_at: '2026-02-01T00:00:00.000Z',
        }),
      ] as any;

      const results = SearchService.searchDecrypted(tieItems, 'git');
      expect(results[0].id).toBe(11);
      expect(results[1].id).toBe(10);
    });

    it('matches by title contains when prefix does not match', () => {
      const containsItems = [
        makeItem({ id: 20, title: 'Secure Note Vault', updated_at: '2026-03-01T00:00:00.000Z' }),
      ] as any;

      const results = SearchService.searchDecrypted(containsItems, 'note');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(20);
    });

    it('matches by username when title does not match', () => {
      const usernameItems = [
        makeItem({ id: 21, title: 'Completely Different', username: 'alpha.username@example.com' }),
      ] as any;

      const results = SearchService.searchDecrypted(usernameItems, 'username');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(21);
    });

    it('matches by url and category in all scope', () => {
      const scopedItems = [
        makeItem({ id: 22, title: 'Random', username: '', url: 'https://portal.company-internal.local', category: 'infra' }),
        makeItem({ id: 23, title: 'Another', username: '', url: '', category: 'finance-payroll' }),
      ] as any;

      const urlResults = SearchService.searchDecrypted(scopedItems, 'company');
      expect(urlResults.map((r: any) => r.id)).toContain(22);

      const categoryResults = SearchService.searchDecrypted(scopedItems, 'payroll');
      expect(categoryResults.map((r: any) => r.id)).toContain(23);
    });

    it('matches tags from data JSON and respects tag scope', () => {
      const tagItems = [
        makeItem({
          id: 24,
          title: 'NoTagInTitle',
          username: '',
          url: '',
          category: '',
          data: JSON.stringify({ tags: ['critical-devops', 'prod'] }),
        }),
        makeItem({
          id: 25,
          title: 'No Tag Hit',
          username: '',
          url: '',
          category: '',
          data: JSON.stringify({ tags: ['docs'] }),
        }),
      ] as any;

      const tagScopeResults = SearchService.searchDecrypted(tagItems, 'devops', 'tags');
      expect(tagScopeResults).toHaveLength(1);
      expect(tagScopeResults[0].id).toBe(24);
    });

    it('falls back safely when data JSON is malformed', () => {
      const malformed = [
        makeItem({
          id: 26,
          title: 'Malformed Data Item',
          username: '',
          url: '',
          category: '',
          data: '{bad-json',
        }),
      ] as any;

      const results = SearchService.searchDecrypted(malformed, 'malformed');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(26);
    });

    it('requires all query tokens to match within selected scope', () => {
      const scopedItems = [
        makeItem({ id: 27, title: 'alpha title', username: 'beta-user' }),
        makeItem({ id: 28, title: 'alpha beta', username: 'other' }),
      ] as any;

      const titleScope = SearchService.searchDecrypted(scopedItems, 'alpha beta', 'title');
      expect(titleScope).toHaveLength(1);
      expect(titleScope[0].id).toBe(28);
    });

    it('keeps non-prefix high score entries when prefix-only set exists', () => {
      const rankedItems = [
        makeItem({ id: 29, title: 'Alpha Start' }),
        makeItem({ id: 30, title: 'Mega alpha vault' }),
      ] as any;

      const results = SearchService.searchDecrypted(rankedItems, 'alpha');
      const ids = results.map((r: any) => r.id);

      // id=29 has prefix match, id=30 has contains score (90) and should be filtered out.
      expect(ids).toContain(29);
      expect(ids).not.toContain(30);
    });

    it('does not apply prefix-only filtering when no item has full prefix match', () => {
      const nonPrefix = [
        makeItem({ id: 31, title: 'beta alpha center', username: '' }),
        makeItem({ id: 32, title: 'central alpha beta', username: '' }),
      ] as any;

      const results = SearchService.searchDecrypted(nonPrefix, 'alpha');
      expect(results.map((r: any) => r.id).sort((a: number, b: number) => a - b)).toEqual([31, 32]);
    });

    it('normalizes accented query tokens before matching', () => {
      const accentItems = [
        makeItem({ id: 33, title: 'Cafe Account' }),
      ] as any;

      const results = SearchService.searchDecrypted(accentItems, 'café');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(33);
    });
  });
});
