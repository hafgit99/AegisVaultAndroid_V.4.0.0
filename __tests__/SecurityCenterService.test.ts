/**
 * SecurityCenterService.test.ts — Aegis Vault Android v4.02
 * Tests for the security risk analyzer.
 */
import { SecurityCenterService } from '../src/SecurityCenterService';

interface MockVaultItem {
  id?: number;
  title: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  category: string;
  favorite: number;
  data: string;
  is_deleted: number;
  created_at?: string;
  updated_at?: string;
}

const makeLogin = (overrides: Partial<MockVaultItem> = {}): MockVaultItem => ({
  id: 1,
  title: 'Test Login',
  username: 'user@test.com',
  password: 'secret123',
  url: 'https://test.com',
  notes: '',
  category: 'login',
  favorite: 0,
  data: JSON.stringify({ totp_secret: '' }),
  is_deleted: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const makeOldLogin = (id: number): MockVaultItem => {
  const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days ago
  return makeLogin({
    id,
    title: `Old Login ${id}`,
    created_at: oldDate,
    updated_at: oldDate,
  });
};

const makeLoginWith2FA = (id: number): MockVaultItem =>
  makeLogin({
    id,
    title: `2FA Login ${id}`,
    data: JSON.stringify({ totp_secret: 'JBSWY3DPEHPK3PXP' }),
  });

describe('SecurityCenterService', () => {
  describe('buildSummary', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns perfect score for empty vault', () => {
      const summary = SecurityCenterService.buildSummary([] as any);
      expect(summary.score).toBe(100);
      expect(summary.riskLevel).toBe('low');
      expect(summary.triageItems).toHaveLength(0);
    });

    it('returns perfect score for vault with full 2FA', () => {
      const items = [
        makeLoginWith2FA(1),
        makeLoginWith2FA(2),
        makeLoginWith2FA(3),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.score).toBeGreaterThanOrEqual(85);
      expect(summary.riskLevel).toBe('low');
      expect(summary.metrics.missingSecondFactor).toBe(0);
    });

    it('detects missing 2FA', () => {
      const items = [
        makeLogin({ id: 1, title: 'No 2FA Login' }),
        makeLogin({ id: 2, title: 'Another No 2FA' }),
        makeLoginWith2FA(3),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.missingSecondFactor).toBe(2);
      expect(summary.issues.some(i => i.type === 'missing_2fa')).toBe(true);
    });

    it('detects aging credentials', () => {
      const items = [makeOldLogin(1), makeOldLogin(2), makeLoginWith2FA(3)];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.agingCredentials).toBe(2);
      expect(summary.issues.some(i => i.type === 'aging_credentials')).toBe(true);
    });

    it('detects missing identity', () => {
      const items = [
        makeLogin({ id: 1, username: '', url: '' }),
        makeLogin({ id: 2, username: 'user@test.com', url: 'https://test.com' }),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.issues.some(i => i.type === 'missing_identity')).toBe(true);
    });

    it('ignores deleted entries', () => {
      const items = [
        makeLogin({ id: 1, is_deleted: 1, title: 'Deleted' }),
        makeLoginWith2FA(2),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.missingSecondFactor).toBe(0);
    });

    it('reduces score with multiple issues', () => {
      const items = [
        makeLogin({ id: 1, username: '', url: '' }),
        makeOldLogin(2),
        makeLogin({ id: 3 }),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.score).toBeLessThan(80);
    });

    it('creates triage items for each issue', () => {
      const items = [
        makeLogin({ id: 1, title: 'Missing 2FA Entry' }),
        makeOldLogin(2),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.triageItems.length).toBeGreaterThan(0);
      expect(summary.triageItems[0].reviewKey).toContain(':');
    });

    it('respects review status', () => {
      const items = [makeLogin({ id: 1, title: 'Reviewed Entry' })];
      const reviewed = { 'missing_2fa:1': new Date().toISOString() };
      const summary = SecurityCenterService.buildSummary(items as any, reviewed);
      expect(summary.reviewedTriageItems.length).toBe(1);
      expect(summary.triageItems.length).toBe(0);
    });

    it('expires reviews after 7 days', () => {
      const items = [makeLogin({ id: 1, title: 'Expired Review' })];
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const reviewed = { 'missing_2fa:1': oldDate };
      const summary = SecurityCenterService.buildSummary(items as any, reviewed);
      // Expired review should move the item back to triageItems
      expect(summary.triageItems.length).toBe(1);
      expect(summary.triageItems[0].reviewExpired).toBe(true);
    });

    it('sorts triage items by severity', () => {
      const items = [
        makeLogin({ id: 1, username: '', url: '', title: 'Missing Identity' }),
        makeLogin({ id: 2, title: 'Missing 2FA' }),
      ];
      const summary = SecurityCenterService.buildSummary(items as any);
      if (summary.triageItems.length >= 2) {
        const severities = summary.triageItems.map(i => i.severity);
        const severityOrder = { high: 0, medium: 1, low: 2 };
        for (let i = 1; i < severities.length; i++) {
          expect(severityOrder[severities[i]]).toBeGreaterThanOrEqual(
            severityOrder[severities[i - 1]],
          );
        }
      }
    });

    it('adds passkey bonus without exceeding max score', () => {
      const items = [
        makeLoginWith2FA(1),
        {
          ...makeLoginWith2FA(2),
          category: 'passkey',
          title: 'Passkey 1',
        },
        {
          ...makeLoginWith2FA(3),
          category: 'passkey',
          title: 'Passkey 2',
        },
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.passkeyReady).toBe(2);
      expect(summary.score).toBe(100);
    });

    it('flags sensitive sharing gaps from entry data', () => {
      const items = [
        makeLogin({
          id: 8,
          data: JSON.stringify({
            shared_space_id: 'space-1',
            shared_reviewed: false,
          }),
        }),
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.sensitiveSharing).toBe(1);
      expect(summary.issues.some(i => i.type === 'sensitive_sharing')).toBe(true);
    });

    it('does not count malformed 2fa or sharing payloads as enabled signals', () => {
      const items = [
        makeLogin({
          id: 9,
          title: 'Broken JSON',
          data: '{bad-json',
        }),
        makeLogin({
          id: 10,
          title: 'Shared Reviewed',
          data: JSON.stringify({
            shared_space_id: 'space-1',
            shared_reviewed: true,
          }),
        }),
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.missingSecondFactor).toBe(2);
      expect(summary.metrics.sensitiveSharing).toBe(0);
    });

    it('requires login category before missing identity or aging checks apply', () => {
      const oldDate = new Date(Date.now() - 250 * 24 * 60 * 60 * 1000).toISOString();
      const items = [
        {
          ...makeLogin({
            id: 11,
            title: 'Passkey entry',
            username: '',
            url: '',
            created_at: oldDate,
            updated_at: oldDate,
          }),
          category: 'passkey',
        },
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.passkeyReady).toBe(1);
      expect(summary.metrics.agingCredentials).toBe(0);
      expect(summary.issues.some(i => i.type === 'missing_identity')).toBe(false);
    });

    it('uses created_at when updated_at is missing for aging detection', () => {
      const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      const items = [
        makeLogin({
          id: 12,
          updated_at: undefined,
          created_at: oldDate,
        }),
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.agingCredentials).toBe(1);
    });

    it('does not age credentials exactly at six month boundary', () => {
      const now = 1_800_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const boundaryDate = new Date(now - 1000 * 60 * 60 * 24 * 180).toISOString();
      const items = [
        makeLogin({
          id: 13,
          created_at: boundaryDate,
          updated_at: boundaryDate,
        }),
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      expect(summary.metrics.agingCredentials).toBe(0);
    });

    it('keeps recent reviews hidden until they exceed the exact reappear threshold', () => {
      const now = 1_800_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const reviewedAt = new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString();
      const summary = SecurityCenterService.buildSummary(
        [
          makeLogin({
            id: 14,
            title: 'Threshold Review',
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          }),
        ] as any,
        { 'missing_2fa:14': reviewedAt },
      );

      expect(summary.reviewedTriageItems).toHaveLength(1);
      expect(summary.triageItems).toHaveLength(0);
    });

    it('fills default triage title and id fallback values when entry fields are missing', () => {
      const items = [
        makeLogin({
          id: undefined,
          title: '',
          username: '',
          url: '',
        }),
      ];

      const summary = SecurityCenterService.buildSummary(items as any);
      const identityItem = summary.triageItems.find(item => item.issueType === 'missing_identity');

      expect(identityItem).toMatchObject({
        itemId: 0,
        title: 'Untitled',
        actionKey: 'settings.security_center.action.missing_identity',
        detailKey: 'settings.security_center.detail.missing_identity',
      });
    });

    it('returns exact issue metadata and reviewedAt when triaged items are reviewed', () => {
      const reviewedAt = new Date().toISOString();
      const items = [
        makeLogin({ id: 21, title: 'No 2FA' }),
        makeOldLogin(22),
        makeLogin({
          id: 23,
          data: JSON.stringify({ shared_space_id: 'space-2', shared_reviewed: false }),
        }),
      ];

      const summary = SecurityCenterService.buildSummary(items as any, {
        'missing_2fa:21': reviewedAt,
      });

      expect(summary.issues).toEqual(
        expect.arrayContaining([
          {
            type: 'missing_2fa',
            count: 3,
            severity: 'high',
            messageKey: 'settings.security_center.issue.missing_2fa',
            actionKey: 'settings.security_center.action.missing_2fa',
          },
          {
            type: 'aging_credentials',
            count: 1,
            severity: 'medium',
            messageKey: 'settings.security_center.issue.aging_credentials',
            actionKey: 'settings.security_center.action.aging_credentials',
          },
          {
            type: 'sensitive_sharing',
            count: 1,
            severity: 'high',
            messageKey: 'settings.security_center.issue.sensitive_sharing',
            actionKey: 'settings.security_center.action.sensitive_sharing',
          },
        ]),
      );
      expect(summary.reviewedTriageItems[0].reviewedAt).toBe(reviewedAt);
      expect(summary.reviewedTriageItems[0].reviewExpired).toBe(false);
    });

    it('classifies medium and high risk score boundaries correctly', () => {
      const mediumRiskItems = [
        makeLogin({ id: 31, username: '', url: '' }),
        makeLogin({ id: 32, username: '', url: '' }),
        makeLogin({ id: 33, username: '', url: '' }),
        makeLogin({ id: 34, username: '', url: '' }),
      ];
      const highRiskItems = [
        makeLogin({
          id: 41,
          username: '',
          url: '',
          data: JSON.stringify({ shared_space_id: 'space-41', shared_reviewed: false }),
        }),
        makeLogin({
          id: 42,
          username: '',
          url: '',
          data: JSON.stringify({ shared_space_id: 'space-42', shared_reviewed: false }),
        }),
        makeLogin({
          id: 43,
          username: '',
          url: '',
          data: JSON.stringify({ shared_space_id: 'space-43', shared_reviewed: false }),
        }),
        makeLogin({
          id: 44,
          username: '',
          url: '',
          data: JSON.stringify({ shared_space_id: 'space-44', shared_reviewed: false }),
        }),
      ];

      expect(SecurityCenterService.buildSummary(mediumRiskItems as any).riskLevel).toBe('medium');
      expect(SecurityCenterService.buildSummary(highRiskItems as any).riskLevel).toBe('high');
    });
  });
});
