/**
 * SecurityCenterService — Aegis Vault Android v4.02
 * Multi-signal security risk analyzer with triage queue.
 * Ported from desktop SecurityCenterService.ts, adapted for VaultItem.
 *
 * Güvenlik Merkezi Servisi — Çok boyutlu risk analizi ve triage kuyruğu.
 * Masaüstü versiyonundan uyarlanmış, VaultItem tipine göre düzenlenmiş.
 */

import type { VaultItem } from './SecurityModule';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SecurityCenterIssueType =
  | 'missing_2fa'
  | 'aging_credentials'
  | 'passkey_ready'
  | 'sensitive_sharing'
  | 'missing_identity'
  | 'stale_secret';

export interface SecurityCenterIssueSummary {
  type: SecurityCenterIssueType;
  count: number;
  severity: 'low' | 'medium' | 'high';
  messageKey: string;
  actionKey: string;
}

export interface SecurityCenterTriageItem {
  issueType: SecurityCenterIssueType;
  itemId: number;
  title: string;
  severity: 'low' | 'medium' | 'high';
  actionKey: string;
  detailKey: string;
  reviewKey: string;
  reviewedAt?: string;
  reviewExpired?: boolean;
}

export interface SecurityCenterSummary {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  metrics: {
    missingSecondFactor: number;
    passkeyReady: number;
    agingCredentials: number;
    sensitiveSharing: number;
  };
  issues: SecurityCenterIssueSummary[];
  triageItems: SecurityCenterTriageItem[];
  reviewedTriageItems: SecurityCenterTriageItem[];
  resolvedTriageItems: SecurityCenterTriageItem[];
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
const REVIEW_REAPPEAR_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function isActiveEntry(entry: VaultItem): boolean {
  return !entry.is_deleted || entry.is_deleted === 0;
}

function isLoginEntry(entry: VaultItem): boolean {
  return entry.category === 'login' && isActiveEntry(entry);
}

function hasSecondFactor(entry: VaultItem): boolean {
  if (!entry.data) return false;
  try {
    const parsed = JSON.parse(entry.data);
    return !!(parsed.totp_secret && parsed.totp_secret.trim());
  } catch {
    return false;
  }
}

function isPasskeyReady(entry: VaultItem): boolean {
  return entry.category === 'passkey' && isActiveEntry(entry);
}

function isAgingCredential(entry: VaultItem): boolean {
  if (!isLoginEntry(entry)) return false;
  if (!entry.updated_at && !entry.created_at) return false;
  const lastDate = entry.updated_at || entry.created_at;
  if (!lastDate) return false;
  return Date.now() - new Date(lastDate).getTime() > SIX_MONTHS_MS;
}

function hasSensitiveSharingGap(entry: VaultItem): boolean {
  if (!entry.data || !isActiveEntry(entry)) return false;
  try {
    const parsed = JSON.parse(entry.data);
    if (parsed.shared_space_id && !parsed.shared_reviewed) return true;
  } catch {
    // ignore
  }
  return false;
}

function hasMissingIdentity(entry: VaultItem): boolean {
  if (!isLoginEntry(entry)) return false;
  return (!entry.username || !entry.username.trim()) || (!entry.url || !entry.url.trim());
}

function getSeverityForIssue(issueType: SecurityCenterIssueType): 'low' | 'medium' | 'high' {
  switch (issueType) {
    case 'missing_2fa': return 'high';
    case 'aging_credentials': return 'medium';
    case 'stale_secret': return 'medium';
    case 'sensitive_sharing': return 'high';
    case 'missing_identity': return 'low';
    case 'passkey_ready': return 'low';
    default: return 'low';
  }
}

function getActionKey(issueType: SecurityCenterIssueType): string {
  return `settings.security_center.action.${issueType}`;
}

function getDetailKey(issueType: SecurityCenterIssueType): string {
  return `settings.security_center.detail.${issueType}`;
}

function getReviewMeta(
  reviewed: Record<string, string>,
  reviewKey: string,
): { reviewedAt: string | null; isExpired: boolean } {
  const reviewedAt = reviewed[reviewKey] || null;
  if (!reviewedAt) return { reviewedAt: null, isExpired: false };
  const isExpired = Date.now() - new Date(reviewedAt).getTime() > REVIEW_REAPPEAR_MS;
  return { reviewedAt, isExpired };
}

// ═══════════════════════════════════════════════════════════════
// SecurityCenterService
// ═══════════════════════════════════════════════════════════════

export class SecurityCenterService {
  /**
   * Build a comprehensive security summary from vault entries.
   * Kasa girişlerinden kapsamlı bir güvenlik özeti oluştur.
   */
  static buildSummary(
    entries: VaultItem[],
    reviewed: Record<string, string> = {},
  ): SecurityCenterSummary {
    const activeEntries = entries.filter(isActiveEntry);
    const loginEntries = activeEntries.filter(isLoginEntry);

    // ── Metrics ──
    const missingSecondFactorEntries = loginEntries.filter(e => !hasSecondFactor(e));
    const passkeyReadyEntries = activeEntries.filter(isPasskeyReady);
    const agingCredentialEntries = loginEntries.filter(isAgingCredential);
    const sensitiveShareEntries = activeEntries.filter(hasSensitiveSharingGap);
    const missingIdentityEntries = loginEntries.filter(hasMissingIdentity);

    const metrics = {
      missingSecondFactor: missingSecondFactorEntries.length,
      passkeyReady: passkeyReadyEntries.length,
      agingCredentials: agingCredentialEntries.length,
      sensitiveSharing: sensitiveShareEntries.length,
    };

    // ── Issues ──
    const issues: SecurityCenterIssueSummary[] = [];

    if (missingSecondFactorEntries.length > 0) {
      issues.push({
        type: 'missing_2fa',
        count: missingSecondFactorEntries.length,
        severity: 'high',
        messageKey: 'settings.security_center.issue.missing_2fa',
        actionKey: 'settings.security_center.action.missing_2fa',
      });
    }

    if (agingCredentialEntries.length > 0) {
      issues.push({
        type: 'aging_credentials',
        count: agingCredentialEntries.length,
        severity: 'medium',
        messageKey: 'settings.security_center.issue.aging_credentials',
        actionKey: 'settings.security_center.action.aging_credentials',
      });
    }

    if (sensitiveShareEntries.length > 0) {
      issues.push({
        type: 'sensitive_sharing',
        count: sensitiveShareEntries.length,
        severity: 'high',
        messageKey: 'settings.security_center.issue.sensitive_sharing',
        actionKey: 'settings.security_center.action.sensitive_sharing',
      });
    }

    if (missingIdentityEntries.length > 0) {
      issues.push({
        type: 'missing_identity',
        count: missingIdentityEntries.length,
        severity: 'low',
        messageKey: 'settings.security_center.issue.missing_identity',
        actionKey: 'settings.security_center.action.missing_identity',
      });
    }

    // ── Triage Items ──
    const triageItems: SecurityCenterTriageItem[] = [];
    const reviewedTriageItems: SecurityCenterTriageItem[] = [];
    const resolvedTriageItems: SecurityCenterTriageItem[] = [];

    const addTriageItem = (entry: VaultItem, issueType: SecurityCenterIssueType) => {
      const reviewKey = `${issueType}:${entry.id}`;
      const meta = getReviewMeta(reviewed, reviewKey);

      const item: SecurityCenterTriageItem = {
        issueType,
        itemId: entry.id || 0,
        title: entry.title || 'Untitled',
        severity: getSeverityForIssue(issueType),
        actionKey: getActionKey(issueType),
        detailKey: getDetailKey(issueType),
        reviewKey,
        reviewedAt: meta.reviewedAt ?? undefined,
        reviewExpired: meta.isExpired,
      };

      if (meta.reviewedAt && !meta.isExpired) {
        reviewedTriageItems.push(item);
      } else {
        triageItems.push(item);
      }
    };

    missingSecondFactorEntries.forEach(e => addTriageItem(e, 'missing_2fa'));
    agingCredentialEntries.forEach(e => addTriageItem(e, 'aging_credentials'));
    sensitiveShareEntries.forEach(e => addTriageItem(e, 'sensitive_sharing'));
    missingIdentityEntries.forEach(e => addTriageItem(e, 'missing_identity'));

    // ── Score Calculation (0-100) ──
    let score = 100;
    const totalLogins = Math.max(loginEntries.length, 1);

    // Deduct for missing 2FA (up to 30 points)
    score -= Math.min(30, Math.round((missingSecondFactorEntries.length / totalLogins) * 30));

    // Deduct for aging credentials (up to 25 points)
    score -= Math.min(25, Math.round((agingCredentialEntries.length / totalLogins) * 25));

    // Deduct for sensitive sharing gaps (up to 20 points)
    score -= Math.min(20, sensitiveShareEntries.length * 5);

    // Deduct for missing identity (up to 15 points)
    score -= Math.min(15, Math.round((missingIdentityEntries.length / totalLogins) * 15));

    // Bonus for passkey adoption (up to +10 points)
    const passkeyBonus = Math.min(10, passkeyReadyEntries.length * 2);
    score = Math.min(100, score + passkeyBonus);

    score = Math.max(0, Math.min(100, score));

    const riskLevel: 'low' | 'medium' | 'high' =
      score >= 75 ? 'low' : score >= 45 ? 'medium' : 'high';

    // Sort triage by severity (high → medium → low)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    triageItems.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      score,
      riskLevel,
      metrics,
      issues,
      triageItems,
      reviewedTriageItems,
      resolvedTriageItems,
    };
  }
}
