module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '<rootDir>/__tests__/.*\\.current\\.test\\.(ts|tsx)$',
    '<rootDir>/__tests__/crypto-vectors\\.test\\.ts$',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@op-engineering/op-sqlite|react-native-quick-crypto|react-native-safe-area-context|react-native-biometrics|react-native-fs|react-native-argon2)/)'
  ]
};
