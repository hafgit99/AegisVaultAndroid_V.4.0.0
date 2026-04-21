module.exports = {
  preset: 'react-native',
  forceExit: true,
  testTimeout: 30000,
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.afterEnv.js'],
  testPathIgnorePatterns: [
    '<rootDir>/.stryker-tmp/',
    '<rootDir>/__tests__/.*\\.current\\.test\\.(ts|tsx)$',
    '<rootDir>/__tests__/crypto-vectors\\.test\\.ts$',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@op-engineering/op-sqlite|react-native-quick-crypto|react-native-safe-area-context|react-native-biometrics|react-native-fs|react-native-argon2)/)'
  ]
};
