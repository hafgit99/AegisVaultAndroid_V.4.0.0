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
  });
});
