import tr from '../src/locales/tr.json';

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/test-dir',
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue(''),
  writeFile: jest.fn().mockResolvedValue(true),
  unlink: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(true),
  uploadFiles: jest.fn(),
  downloadFile: jest.fn(),
}));

jest.mock('react-native-quick-crypto', () => {
  const crypto = require('crypto');
  return {
    createHash: (alg) => crypto.createHash(alg),
    createHmac: (alg, key) => crypto.createHmac(alg, key),
    randomBytes: (n) => crypto.randomBytes(n),
    pbkdf2Sync: (pw, salt, iter, len, alg) => crypto.pbkdf2Sync(pw, salt, iter, len, alg),
    createCipheriv: (alg, key, iv) => crypto.createCipheriv(alg, key, iv),
    createDecipheriv: (alg, key, iv) => crypto.createDecipheriv(alg, key, iv),
  };
});

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn().mockResolvedValue([]),
  isKnownType: jest.fn().mockReturnValue(true),
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {},
}));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn().mockReturnValue({
    executeSync: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('react-native-biometrics', () => {
  return jest.fn().mockImplementation(() => ({
    isSensorAvailable: jest.fn().mockResolvedValue({ available: true, biometryType: 'FaceID' }),
    createKeys: jest.fn().mockResolvedValue({ publicKey: 'test-public-key' }),
    createSignature: jest.fn().mockResolvedValue({ signature: 'test-signature' }),
  }));
});

jest.mock('react-native-argon2', () => {
  return jest.fn().mockResolvedValue({
    rawHash: 'test-hash',
    encodedHash: 'test-encoded-hash',
  });
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));

const tMock = (key) => {
  const parts = key.split('.');
  let val = tr;
  for (const p of parts) {
    if (!val || val[p] === undefined) return key;
    val = val[p];
  }
  return val;
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tMock,
    i18n: { language: 'tr', changeLanguage: jest.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: {
    language: 'tr',
    changeLanguage: jest.fn().mockResolvedValue('tr'),
    t: tMock,
  },
  t: tMock,
  initI18n: jest.fn().mockResolvedValue(true),
  switchLanguage: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/ThemeContext', () => {
  const LightPalette = {
    bg: '#F0EEE9', card: 'rgba(255,255,255,0.45)', cardBorder: 'rgba(255,255,255,0.55)',
    inputBg: 'rgba(255,255,255,0.7)', navy: '#101828', muted: 'rgba(16,24,40,0.45)',
    white: '#fff', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
    sageMid: 'rgba(114,136,111,0.25)', red: '#ef4444', redBg: 'rgba(239,68,68,0.08)',
    green: '#22c55e', cyan: '#06b6d4', divider: 'rgba(16,24,40,0.06)',
    navBg: '#fff', navBorder: 'rgba(16,24,40,0.06)',
    modalOverlay: 'rgba(0,0,0,0.35)', modalBg: '#F0EEE9',
    statusBarStyle: 'dark-content', statusBarBg: '#F0EEE9',
  };
  return {
    useTheme: () => ({
      colors: LightPalette,
      isDark: false,
      themeMode: 'system',
      setThemeMode: jest.fn(),
    }),
    ThemeProvider: ({ children }) => children,
  };
});
