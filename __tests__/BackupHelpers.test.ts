import {
  sanitizeExportFileName,
  joinPath,
  parseCSV,
  escapeCSV,
  findCol,
  getVal,
} from '../src/BackupModule';

describe('BackupModule Helpers', () => {
  describe('sanitizeExportFileName', () => {
    it('replaces illegal characters with underscores', () => {
      expect(sanitizeExportFileName('my:file*name?.csv')).toBe('my_file_name_.csv');
      expect(sanitizeExportFileName('folder/sub/file.json')).toBe('folder_sub_file.json');
      // Multiple consecutive illegal chars are collapsed into one underscore by the regex +
      expect(sanitizeExportFileName('<tag>|"test"')).toBe('_tag_test_');
    });

    it('returns same name if no illegal characters', () => {
      expect(sanitizeExportFileName('backup_2026.json')).toBe('backup_2026.json');
    });
  });

  describe('joinPath', () => {
    it('joins directory and filename with single slash', () => {
      expect(joinPath('/home/user', 'file.txt')).toBe('/home/user/file.txt');
      expect(joinPath('/home/user/', 'file.txt')).toBe('/home/user/file.txt');
      expect(joinPath('C:\\Users\\', 'file.txt')).toBe('C:\\Users/file.txt');
    });
  });

  describe('parseCSV', () => {
    it('parses simple CSV rows', () => {
      const csv = 'a,b,c\nd,e,f';
      expect(parseCSV(csv)).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    it('handles quoted fields with commas', () => {
      const csv = 'a,"b,c",d\ne,f,g';
      expect(parseCSV(csv)).toEqual([
        ['a', 'b,c', 'd'],
        ['e', 'f', 'g'],
      ]);
    });

    it('handles escaped quotes inside quoted fields', () => {
      const csv = 'a,"b ""c"" d",e';
      expect(parseCSV(csv)).toEqual([['a', 'b "c" d', 'e']]);
    });

    it('handles newlines inside quoted fields', () => {
      const csv = 'a,"b\nc",d';
      expect(parseCSV(csv)).toEqual([['a', 'b\nc', 'd']]);
    });

    it('skips empty rows', () => {
      const csv = 'a,b,c\n\n\n d,e,f\n\n';
      expect(parseCSV(csv)).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    it('handles carriage returns', () => {
      const csv = 'a,b,c\r\nd,e,f';
      expect(parseCSV(csv)).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    it('handles trailing data without newline', () => {
      const csv = 'a,b,c';
      expect(parseCSV(csv)).toEqual([['a', 'b', 'c']]);
    });
  });

  describe('escapeCSV', () => {
    it('returns empty string for null/empty input', () => {
      expect(escapeCSV('')).toBe('');
      expect(escapeCSV(null as any)).toBe('');
    });

    it('wraps in quotes and escapes internal quotes if comma, quote or newline present', () => {
      expect(escapeCSV('a,b')).toBe('"a,b"');
      expect(escapeCSV('a"b')).toBe('"a""b"');
      expect(escapeCSV('a\nb')).toBe('"a\nb"');
    });

    it('returns plain string if no special characters', () => {
      expect(escapeCSV('hello')).toBe('hello');
    });
  });

  describe('findCol', () => {
    it('finds index of first matching candidate (case-insensitive)', () => {
      const headers = ['Title', 'User', 'Password'];
      expect(findCol(headers, ['user', 'username'])).toBe(1);
      expect(findCol(headers, ['password', 'pw'])).toBe(2);
    });

    it('returns -1 if no candidate found', () => {
      expect(findCol(['a', 'b'], ['c', 'd'])).toBe(-1);
    });
  });

  describe('getVal', () => {
    it('returns trimmed value at index', () => {
      expect(getVal([' a ', 'b'], 0)).toBe('a');
    });

    it('returns empty string if index out of bounds or null value', () => {
      expect(getVal(['a'], 5)).toBe('');
      expect(getVal(['a', null as any], 1)).toBe('');
    });
  });
});
