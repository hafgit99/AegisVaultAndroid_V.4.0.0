import { FieldValidationService } from '../src/FieldValidationService';
import { SecureAppSettings } from '../src/SecureAppSettings';

jest.mock('../src/SecureAppSettings', () => ({
  SecureAppSettings: {
    get: jest.fn(),
    update: jest.fn(),
  },
}));

describe('FieldValidationService', () => {
  beforeEach(() => {
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      validationRecords: [],
    });
    (SecureAppSettings.update as jest.Mock).mockResolvedValue(undefined);
  });

  it('builds evidence file names using the validation naming convention', () => {
    const fileName = FieldValidationService.buildEvidenceFileName({
      vendor: 'Google',
      model: 'Pixel 8',
      androidVersion: '15',
      scenario: 'passkey_auth',
      result: 'PASS-WARN',
      date: '2026-04-16T10:00:00.000Z',
    });

    expect(fileName).toBe(
      '2026-04-16_google-pixel-8_android15_passkey-auth_pass-warn',
    );
  });

  it('creates a new validation record and persists it', async () => {
    const record = await FieldValidationService.saveRecord({
      deviceId: 'pixel-8',
      vendor: 'Google',
      model: 'Pixel 8',
      androidVersion: '15',
      scenario: 'passkey_create',
      result: 'PASS',
      owner: 'qa@team',
    });

    expect(record.id).toContain('validation_');
    expect(record.createdAt).toBeTruthy();
    expect(SecureAppSettings.update).toHaveBeenCalledWith(
      {
        validationRecords: [expect.objectContaining({
          deviceId: 'pixel-8',
          vendor: 'Google',
          scenario: 'passkey_create',
          result: 'PASS',
        })],
      },
      undefined,
    );
  });

  it('updates an existing validation record in place', async () => {
    const existing = {
      id: 'validation_1',
      createdAt: '2026-04-15T09:00:00.000Z',
      updatedAt: '2026-04-15T09:00:00.000Z',
      priority: 'P0',
      deviceId: 'pixel-8',
      vendor: 'Google',
      model: 'Pixel 8',
      androidVersion: '15',
      scenario: 'passkey_auth',
      result: 'FAIL',
      owner: 'qa@team',
      evidencePath: 'docs/validation/kanit/old',
      notes: 'old',
    };
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      validationRecords: [existing],
    });

    const record = await FieldValidationService.saveRecord({
      id: 'validation_1',
      result: 'PASS-WARN',
      notes: 'Recovered after retry',
    });

    expect(record.id).toBe('validation_1');
    expect(record.createdAt).toBe(existing.createdAt);
    expect(SecureAppSettings.update).toHaveBeenCalledWith(
      {
        validationRecords: [expect.objectContaining({
          id: 'validation_1',
          result: 'PASS-WARN',
          notes: 'Recovered after retry',
        })],
      },
      undefined,
    );
  });

  it('filters workspace records by scenario, result, and search query', () => {
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      validationRecords: [
        {
          id: 'validation_1',
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
          priority: 'P0',
          deviceId: 'pixel-8',
          vendor: 'Google',
          model: 'Pixel 8',
          androidVersion: '15',
          scenario: 'passkey_create',
          result: 'PASS',
          owner: 'qa@team',
          evidencePath: 'docs/validation/kanit/pixel',
          notes: 'clean pass',
        },
        {
          id: 'validation_2',
          createdAt: '2026-04-16T11:00:00.000Z',
          updatedAt: '2026-04-16T11:00:00.000Z',
          priority: 'P1',
          deviceId: 'galaxy-a54',
          vendor: 'Samsung',
          model: 'Galaxy A54',
          androidVersion: '14',
          scenario: 'passkey_auth',
          result: 'FAIL',
          owner: 'field@team',
          evidencePath: 'docs/validation/kanit/galaxy',
          notes: 'rp mismatch',
        },
      ],
    });

    const filtered = FieldValidationService.list({
      scenario: 'passkey_auth',
      result: 'FAIL',
      query: 'samsung',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].deviceId).toBe('galaxy-a54');
  });

  it('builds workspace summary metrics', () => {
    const summary = FieldValidationService.getWorkspaceSummary([
      {
        id: 'validation_1',
        createdAt: '2026-04-16T10:00:00.000Z',
        updatedAt: '2026-04-16T10:00:00.000Z',
        priority: 'P0',
        deviceId: 'pixel-8',
        vendor: 'Google',
        model: 'Pixel 8',
        androidVersion: '15',
        scenario: 'passkey_create',
        result: 'PASS',
      },
      {
        id: 'validation_2',
        createdAt: '2026-04-16T11:00:00.000Z',
        updatedAt: '2026-04-16T11:00:00.000Z',
        priority: 'P0',
        deviceId: 'pixel-8',
        vendor: 'Google',
        model: 'Pixel 8',
        androidVersion: '15',
        scenario: 'passkey_auth',
        result: 'PASS-WARN',
      },
    ]);

    expect(summary.total).toBe(2);
    expect(summary.deviceCount).toBe(1);
    expect(summary.results.PASS).toBe(1);
    expect(summary.scenarios.passkey_auth).toBe(1);
  });
});
