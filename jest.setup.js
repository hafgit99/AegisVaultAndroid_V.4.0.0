const mockCrypto = require('crypto');

jest.mock('react-native-quick-crypto', () => ({
  randomBytes: size => mockCrypto.randomBytes(size),
  randomFillSync: buffer => mockCrypto.randomFillSync(buffer),
  createHash: algorithm => mockCrypto.createHash(algorithm),
  createHmac: (algorithm, key) => mockCrypto.createHmac(algorithm, key),
  createCipheriv: (algorithm, key, iv) =>
    mockCrypto.createCipheriv(algorithm, key, iv),
  createDecipheriv: (algorithm, key, iv) =>
    mockCrypto.createDecipheriv(algorithm, key, iv),
  pbkdf2: (password, salt, iterations, keyLen, digest, callback) =>
    mockCrypto.pbkdf2(password, salt, iterations, keyLen, digest, callback),
  pbkdf2Sync: (password, salt, iterations, keyLen, digest) =>
    mockCrypto.pbkdf2Sync(password, salt, iterations, keyLen, digest),
}));

jest.mock('react-native-argon2', () =>
  jest.fn().mockImplementation(async (password, salt, options = {}) => {
    const hashLength = options.hashLength || 32;
    const rawHash = mockCrypto
      .createHash('sha256')
      .update(`${password}:${salt}:${options.mode || 'argon2id'}`)
      .digest('hex')
      .slice(0, hashLength * 2)
      .padEnd(hashLength * 2, '0');

    return {
      rawHash,
      opslimit: options.iterations || 4,
      memorylimit: options.memory || 32768,
    };
  }),
);

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(false),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  copyFile: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ size: 0 }),
  downloadFile: jest.fn(() => ({ promise: Promise.resolve({ statusCode: 200 }) })),
  DocumentDirectoryPath: '/mock/documents',
  DownloadDirectoryPath: '/mock/downloads',
  ExternalDirectoryPath: '/mock/external',
  CachesDirectoryPath: '/mock/cache',
}));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn().mockReturnValue({
    executeSync: jest.fn().mockReturnValue({ rows: [] }),
    close: jest.fn(),
  }),
}));

jest.mock('react-native-biometrics', () =>
  jest.fn().mockImplementation(() => ({
    simplePrompt: jest.fn().mockResolvedValue({ success: true }),
    biometricKeysExist: jest.fn().mockResolvedValue({ keysExist: false }),
    createKeys: jest
      .fn()
      .mockResolvedValue({ publicKey: 'mock-public-key-material' }),
    deleteKeys: jest.fn().mockResolvedValue(undefined),
    isSensorAvailable: jest.fn().mockResolvedValue({ available: true }),
  })),
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
}));

jest.mock('react-native-qrcode-svg', () => 'QRCode');
