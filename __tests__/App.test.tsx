import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/Dashboard', () => ({
  Dashboard: () => null,
}));

jest.mock('../src/i18n', () => ({
  initI18n: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    getAppConfigSetting: jest.fn().mockResolvedValue(false),
  },
}));

describe('App', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders without crashing', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
      await Promise.resolve();
    });

    expect(renderer).toBeDefined();

    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  });
});
