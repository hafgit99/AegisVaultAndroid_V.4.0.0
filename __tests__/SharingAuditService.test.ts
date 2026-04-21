import { SharingAuditService } from '../src/SharingAuditService';
import { SecureAppSettings } from '../src/SecureAppSettings';

jest.mock('../src/SecureAppSettings', () => {
  let state = { sharedSpaces: [], sharingAuditLog: [] as any[] };
  return {
    SecureAppSettings: {
      get: jest.fn(() => state),
      update: jest.fn(async (patch) => {
        state = { ...state, ...patch };
      }),
    },
  };
});

describe('SharingAuditService', () => {
  const db = {};

  beforeEach(() => {
    jest.clearAllMocks();
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      sharedSpaces: [],
      sharingAuditLog: [],
    });
    (SecureAppSettings.update as jest.Mock).mockImplementation(async (patch) => {
      const current = (SecureAppSettings.get as jest.Mock)();
      (SecureAppSettings.get as jest.Mock).mockReturnValue({
        ...current,
        ...patch,
      });
    });
  });

  it('records a timestamped audit event and persists it', async () => {
    await SharingAuditService.recordEvent(
      {
        type: 'space_created',
        spaceId: 'space-1',
        detail: 'Family',
      },
      db,
    );

    const log = SharingAuditService.getLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      type: 'space_created',
      spaceId: 'space-1',
      detail: 'Family',
    });
    expect(log[0].id).toEqual(expect.any(String));
    expect(log[0].at).toEqual(expect.any(String));
  });

  it('keeps only the last 100 audit entries', async () => {
    const existing = Array.from({ length: 100 }, (_, index) => ({
      id: `old-${index}`,
      at: new Date(2026, 0, 1, 0, 0, index).toISOString(),
      type: 'existing',
      spaceId: `space-${index}`,
      detail: `detail-${index}`,
    }));
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      sharedSpaces: [],
      sharingAuditLog: existing,
    });

    await SharingAuditService.recordEvent(
      {
        type: 'member_removed',
        spaceId: 'space-new',
        detail: 'member-1',
      },
      db,
    );

    const log = SharingAuditService.getLog();
    expect(log).toHaveLength(100);
    expect(log.some((entry) => entry.id === 'old-0')).toBe(false);
    expect(log[log.length - 1]).toMatchObject({
      type: 'member_removed',
      spaceId: 'space-new',
      detail: 'member-1',
    });
  });
});
