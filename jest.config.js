module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['./__tests__/jest.setup.js'],
  testPathIgnorePatterns: ['/__tests__/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@op-engineering/op-sqlite|react-native-quick-crypto|react-native-safe-area-context|react-native-biometrics|@react-native-documents|react-native-qrcode-svg|react-native-svg)/)'
  ]
};
