import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Dashboard } from '../src/Dashboard';
import { SecurityModule } from '../src/SecurityModule';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'legal.disclaimer') {
        return 'By using this app you accept {{terms}} and {{privacy}}.';
      }
      return key;
    },
    i18n: { changeLanguage: jest.fn(), exists: jest.fn(() => false) },
  }),
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    getItems: jest.fn(),
    getItemCount: jest.fn().mockResolvedValue(2),
    getSharedVaultSpaces: jest.fn().mockResolvedValue([]),
    getRemainingLockout: jest.fn().mockResolvedValue(0),
    getFailedAttempts: jest.fn().mockResolvedValue(0),
    deriveKeyFromBiometric: jest.fn().mockResolvedValue('unlock-secret'),
    unlockVault: jest.fn().mockResolvedValue(true),
    cleanupOldTrash: jest.fn(),
    startAutoLockTimer: jest.fn(),
    resetAutoLockTimer: jest.fn(),
    clearAutoLockTimer: jest.fn(),
    lockVault: jest.fn(),
    isPickingFileFlag: false,
    parseSharedAssignment: jest.fn(() => null),
    db: { executeSync: jest.fn() },
    generatePassword: jest.fn(() => 'mock-password-123'),
    getPasswordStrength: jest.fn(() => 4),
  },
}));

jest.mock('../src/SecureAppSettings', () => ({
  SecureAppSettings: {
    init: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(() => ({
      autoLockSeconds: 60,
      biometricEnabled: true,
      darkMode: false,
    })),
    update: jest.fn().mockResolvedValue(true),
    toVaultSettings: jest.fn(() => ({
      autoLockSeconds: 60,
      biometricEnabled: true,
      clipboardClearSeconds: 30,
      passwordLength: 20,
      darkMode: false,
      breachCheckEnabled: false,
      deviceTrustPolicy: {
        deviceTrustPolicy: 'moderate',
        requireBiometric: true,
        rootDetectionEnabled: true,
        rootBlocksVault: false,
        degradedDeviceAction: 'warn',
      },
    })),
  },
}));

jest.mock('react-native-biometrics', () => {
  return jest.fn().mockImplementation(() => ({
    isSensorAvailable: jest.fn().mockResolvedValue({ available: true }),
    simplePrompt: jest.fn().mockResolvedValue({ success: true }),
    biometricKeysExist: jest.fn().mockResolvedValue({ keysExist: true }),
  }));
});

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue('[]'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/doc',
}));

jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');
jest.mock('react-native/Libraries/Components/Keyboard/Keyboard', () => ({
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  dismiss: jest.fn(),
  isVisible: jest.fn(() => false),
}));
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

jest.mock('../src/AutofillService', () => ({
  AutofillService: {
    openSettings: jest.fn(),
    setUnlocked: jest.fn(),
    clearEntries: jest.fn(),
  },
}));

jest.mock('react-native-quick-crypto', () => ({
  default: {
    createHmac: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock-hmac'),
    })),
  },
}));

describe('Dashboard Component Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecurityModule.getItems as jest.Mock).mockResolvedValue([
      { id: 1, title: 'Google', category: 'login', data: { username: 'user1' } },
      { id: 2, title: 'Facebook', category: 'login', data: { username: 'user2' } },
    ]);
  });

  const unlock = (getByText: (text: string) => any) => {
    fireEvent.press(getByText('lock_screen.bio_btn'));
  };

  test('lists records after unlock', async () => {
    const { getByText } = render(<Dashboard />);
    unlock(getByText);

    await waitFor(() => {
      expect(getByText('Google')).toBeTruthy();
      expect(getByText('Facebook')).toBeTruthy();
    });
  });

  test('filters records by search', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<Dashboard />);
    unlock(getByText);

    await waitFor(() => expect(getByText('Google')).toBeTruthy());

    const searchInput = getByPlaceholderText('vault.search');
    fireEvent.changeText(searchInput, 'Google');

    await waitFor(() => {
      expect(getByText('Google')).toBeTruthy();
      expect(queryByText('Facebook')).toBeTruthy();
    });
  });

  test('switches to generator tab', async () => {
    const { getByText } = render(<Dashboard />);
    unlock(getByText);
    await waitFor(() => expect(getByText('Google')).toBeTruthy());

    fireEvent.press(getByText('nav.generator'));
    await waitFor(() => {
      expect(getByText('generator.title')).toBeTruthy();
    });
  });

  test('shows add modal', async () => {
    const { getByLabelText, getByText } = render(<Dashboard />);
    unlock(getByText);

    await waitFor(() => expect(getByLabelText('vault.add_new')).toBeTruthy());
    fireEvent.press(getByLabelText('vault.add_new'));

    await waitFor(() => {
      expect(getByText('vault.new_record')).toBeTruthy();
    });
  });
});
