/**
 * security/SecureJsonStorage.test.ts
 * Unit tests for SecureJsonStorage — read/write priority, legacy migration, fallbacks.
 */

import { readSecureJson, writeSecureJson } from '../../src/security/SecureJsonStorage';

// Mock RNFS
jest.mock('react-native-fs', () => ({
  exists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

import RNFS from 'react-native-fs';

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>;

interface TestData { value: string; count: number; }
const FALLBACK: TestData = { value: 'default', count: 0 };
const SECURE_KEY = 'aegis_test_secure_key';
const LEGACY_FILE = '/docs/test.json';

const makeStorage = (stored: string | null, setOk = true) => ({
  getItem: jest.fn().mockResolvedValue(stored),
  setItem: jest.fn().mockResolvedValue(setOk),
});

describe('SecureJsonStorage — readSecureJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRNFS.exists.mockResolvedValue(false);
  });

  it('reads from SecureStorage when value exists', async () => {
    const stored = JSON.stringify({ value: 'from_secure', count: 42 });
    const storage = makeStorage(stored);

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK, {
      secureStorage: storage,
    });

    expect(result).toEqual({ value: 'from_secure', count: 42 });
    expect(storage.getItem).toHaveBeenCalledWith(SECURE_KEY);
  });

  it('falls back to legacy file when SecureStorage returns null', async () => {
    const storage = makeStorage(null);
    const legacy = { value: 'from_file', count: 7 };
    mockRNFS.exists.mockResolvedValue(true);
    mockRNFS.readFile.mockResolvedValue(JSON.stringify(legacy));

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK, {
      secureStorage: storage,
    });

    expect(result).toEqual(legacy);
    expect(mockRNFS.readFile).toHaveBeenCalledWith(LEGACY_FILE, 'utf8');
  });

  it('migrates legacy file to SecureStorage after reading', async () => {
    const storage = makeStorage(null);
    const legacy = { value: 'migrate_me', count: 3 };
    mockRNFS.exists.mockResolvedValue(true);
    mockRNFS.readFile.mockResolvedValue(JSON.stringify(legacy));
    mockRNFS.unlink.mockResolvedValue(undefined);

    await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK, {
      secureStorage: storage,
    });

    // SecureStorage.setItem should be called with migrated data
    expect(storage.setItem).toHaveBeenCalledWith(
      SECURE_KEY,
      JSON.stringify(legacy),
    );
  });

  it('returns fallback when neither SecureStorage nor file exists', async () => {
    const storage = makeStorage(null);
    mockRNFS.exists.mockResolvedValue(false);

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK, {
      secureStorage: storage,
    });

    expect(result).toEqual(FALLBACK);
  });

  it('returns fallback when SecureStorage getItem throws', async () => {
    const storage = {
      getItem: jest.fn().mockRejectedValue(new Error('storage error')),
      setItem: jest.fn(),
    };
    mockRNFS.exists.mockResolvedValue(false);

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK, {
      secureStorage: storage,
    });

    expect(result).toEqual(FALLBACK);
  });

  it('returns fallback when JSON parsing fails', async () => {
    const storage = makeStorage('NOT_VALID_JSON');
    mockRNFS.exists.mockResolvedValue(false);

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK, {
      secureStorage: storage,
    });

    // Invalid JSON → SecureStorage read fails → falls through to legacy → no file → fallback
    expect(result).toEqual(FALLBACK);
  });

  it('works without secureStorage option (file-only mode)', async () => {
    const data = { value: 'file_only', count: 1 };
    mockRNFS.exists.mockResolvedValue(true);
    mockRNFS.readFile.mockResolvedValue(JSON.stringify(data));

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK);
    expect(result).toEqual(data);
  });

  it('returns fallback when file read throws', async () => {
    mockRNFS.exists.mockResolvedValue(true);
    mockRNFS.readFile.mockRejectedValue(new Error('read error'));

    const result = await readSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, FALLBACK);
    expect(result).toEqual(FALLBACK);
  });
});

describe('SecureJsonStorage — writeSecureJson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRNFS.unlink.mockResolvedValue(undefined);
    mockRNFS.writeFile.mockResolvedValue(undefined);
  });

  it('writes to SecureStorage and deletes legacy file', async () => {
    const storage = makeStorage(null);
    const data: TestData = { value: 'write_me', count: 99 };

    await writeSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, data, {
      secureStorage: storage,
    });

    expect(storage.setItem).toHaveBeenCalledWith(SECURE_KEY, JSON.stringify(data));
    expect(mockRNFS.unlink).toHaveBeenCalledWith(LEGACY_FILE);
  });

  it('throws when SecureStorage setItem returns false', async () => {
    const storage = makeStorage(null, false); // setItem returns false
    const data: TestData = { value: 'fail', count: 0 };

    await expect(
      writeSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, data, { secureStorage: storage }),
    ).rejects.toThrow('SecureStorage write was rejected');
  });

  it('falls back to writing file when no SecureStorage', async () => {
    const data: TestData = { value: 'file_write', count: 2 };

    await writeSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, data);

    expect(mockRNFS.writeFile).toHaveBeenCalledWith(
      LEGACY_FILE,
      JSON.stringify(data),
      'utf8',
    );
  });

  it('does not call writeFile when SecureStorage succeeds', async () => {
    const storage = makeStorage(null);
    await writeSecureJson<TestData>(SECURE_KEY, LEGACY_FILE, { value: 'ok', count: 1 }, {
      secureStorage: storage,
    });
    expect(mockRNFS.writeFile).not.toHaveBeenCalled();
  });
});
