module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@op-engineering/op-sqlite|react-native-quick-crypto|react-native-safe-area-context|react-native-biometrics)/)'
  ]
};
