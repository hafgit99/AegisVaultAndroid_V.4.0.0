import { ValidationMatrixService } from '../src/ValidationMatrixService';

describe('ValidationMatrixService', () => {
  it('builds matrix statuses from captured validation records', () => {
    const board = ValidationMatrixService.buildBoard([
      {
        id: '1',
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
        id: '2',
        createdAt: '2026-04-16T11:00:00.000Z',
        updatedAt: '2026-04-16T11:00:00.000Z',
        priority: 'P1',
        deviceId: 'no-bio',
        vendor: 'Generic',
        model: 'Biometrics Disabled Device',
        androidVersion: '14',
        scenario: 'passkey_prereq_failure',
        result: 'BLOCKED',
      },
      {
        id: '3',
        createdAt: '2026-04-16T12:00:00.000Z',
        updatedAt: '2026-04-16T12:00:00.000Z',
        priority: 'P0',
        deviceId: 'pixel-8',
        vendor: 'Google',
        model: 'Pixel 8',
        androidVersion: '15',
        scenario: 'passkey_auth',
        result: 'FAIL',
      },
    ]);

    expect(board.totalDevices).toBe(6);
    expect(board.totalRows).toBe(25);
    expect(board.totals.passed).toBe(1);
    expect(board.totals.blocked).toBe(1);
    expect(board.totals.running).toBe(1);
    expect(board.totals.planned).toBe(22);
  });

  it('groups matrix rows by device and uses the latest record for a scenario', () => {
    const board = ValidationMatrixService.buildBoard([
      {
        id: 'older',
        createdAt: '2026-04-16T09:00:00.000Z',
        updatedAt: '2026-04-16T09:00:00.000Z',
        priority: 'P0',
        deviceId: 'pixel-8',
        vendor: 'Google',
        model: 'Pixel 8',
        androidVersion: '15',
        scenario: 'passkey_create',
        result: 'FAIL',
      },
      {
        id: 'newer',
        createdAt: '2026-04-16T10:00:00.000Z',
        updatedAt: '2026-04-16T10:00:00.000Z',
        priority: 'P0',
        deviceId: 'pixel-8',
        vendor: 'Google',
        model: 'Pixel 8',
        androidVersion: '15',
        scenario: 'passkey_create',
        result: 'PASS-WARN',
      },
    ]);

    const pixel = board.deviceGroups.find(group => group.deviceId === 'pixel-8');
    const passkeyCreate = pixel?.rows.find(row => row.scenario === 'passkey_create');

    expect(pixel?.rows).toHaveLength(7);
    expect(passkeyCreate?.status).toBe('passed');
    expect(passkeyCreate?.latestRecord?.id).toBe('newer');
  });
});
