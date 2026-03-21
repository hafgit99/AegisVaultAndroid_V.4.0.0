module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      files: ['jest.setup.js', 'jest.afterEnv.js', '__tests__/**/*.{js,ts,tsx}'],
      env: {
        jest: true,
      },
    },
    {
      files: ['__tests__/SecurityModule.test.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        'no-bitwise': 'off',
      },
    },
    {
      files: [
        'src/ImportVersioning.ts',
        'src/PasswordHistoryModule.ts',
        'src/RecoveryModule.ts',
        'src/components/AttachmentSection.tsx',
        'src/components/DeviceTrustSettings.tsx',
        'src/components/DonationModal.tsx',
        'src/components/TrashModal.tsx',
      ],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    {
      files: [
        'src/Dashboard.tsx',
        'src/SecurityModule.ts',
        'src/TOTPModule.ts',
        'src/components/BackupModal.tsx',
        'src/components/CategoryForms.tsx',
        'src/components/SecurityReportModal.tsx',
        'src/components/SharedVaultsModal.tsx',
        'src/components/DeviceTrustSettings.tsx',
      ],
      rules: {
        'react-native/no-inline-styles': 'off',
      },
    },
    {
      files: ['src/Dashboard.tsx'],
      rules: {
        'react/no-unstable-nested-components': 'off',
      },
    },
    {
      files: [
        'src/SecurityModule.ts',
        'src/TOTPModule.ts',
        'src/RecoveryModule.ts',
        'src/PasswordHistoryModule.ts',
      ],
      rules: {
        'no-bitwise': 'off',
      },
    },
    {
      files: ['src/TOTPModule.ts'],
      rules: {
        'no-div-regex': 'off',
        radix: 'off',
      },
    },
    {
      files: [
        'src/components/TOTPDisplay.tsx',
        'src/components/FormFields.tsx',
        'src/components/TrashModal.tsx',
        'src/components/DonationModal.tsx',
      ],
      rules: {
        'react-native/no-inline-styles': 'off',
      },
    },
  ],
};
