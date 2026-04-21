import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PasskeySettings } from '../src/components/PasskeySettings';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      key === 'passkeys.bind_success' && vars?.credentialId
        ? `passkeys.bind_success ${vars.credentialId}`
        : key,
  }),
}));

jest.mock('../src/PasskeyModule', () => ({
  PasskeyModule: {
    isAvailable: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/PasskeyEnrollmentService', () => ({
  PasskeyEnrollmentService: {
    enrollDevicePasskey: jest.fn().mockResolvedValue({
      credentialId: 'credential123456',
    }),
  },
}));

jest.mock('../src/PasskeyBindingService', () => ({
  PasskeyBindingService: {
    revokeBinding: jest.fn().mockResolvedValue(undefined),
    getPolicyViolations: jest.fn(() => []),
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    db: {},
  },
}));

describe('PasskeySettings', () => {
  const theme = {
    card: '#fff',
    cardBorder: '#ddd',
    navy: '#111',
    muted: '#666',
    sage: '#3a7',
    sageLight: '#e8f7ef',
    sageMid: '#9dd3b6',
    inputBg: '#f8f8f8',
    redBg: '#fdeaea',
  };

  it('shows native ready state and opens enrollment modal', async () => {
    const { getByText, findByText } = render(
      <PasskeySettings theme={theme} bindings={[]} onRefresh={jest.fn()} />,
    );

    await waitFor(() =>
      expect(getByText('passkeys.status_ready')).toBeTruthy(),
    );

    fireEvent.press(getByText('passkeys.btn_bind'));

    expect(await findByText('passkeys.enroll_title')).toBeTruthy();
    expect(getByText('passkeys.btn_confirm_bind')).toBeTruthy();
  });
});
