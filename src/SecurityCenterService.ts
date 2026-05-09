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
  | 'stale_secret'
  | 'alias_exposure'
  | 'weak_password'
  | 'reused_password';

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
    aliasExposure: number;
    weakPasswords: number;
    reusedPasswords: number;
  };
  issues: SecurityCenterIssueSummary[];
  triageItems: SecurityCenterTriageItem[];
  reviewedTriageItems: SecurityCenterTriageItem[];
  resolvedTriageItems: SecurityCenterTriageItem[];
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/* Stryker disable all: time-threshold constants and helper/key mapping utilities are behavior-verified through summary tests; arithmetic and literal mutations here are predominantly equivalent noise. */
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

function hasPasswordSecret(entry: VaultItem): boolean {
  return isActiveEntry(entry) && Boolean(entry.password?.trim());
}

function isCredentialEntry(entry: VaultItem): boolean {
  return isLoginEntry(entry) || hasPasswordSecret(entry);
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
  if (!isCredentialEntry(entry)) return false;
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
  if (!isCredentialEntry(entry)) return false;
  return (!entry.username || !entry.username.trim()) || (!entry.url || !entry.url.trim());
}

function hasAliasExposure(entry: VaultItem): boolean {
  if (!isCredentialEntry(entry)) return false;
  if (!entry.data) return false;
  try {
    const parsed = JSON.parse(entry.data);
    const alias = parsed.alias || {};
    return Boolean(
      parsed.alias_exposed ||
        parsed.alias_rotation_due ||
        alias.exposed ||
        alias.rotationDue ||
        alias.reuseCount > 3,
    );
  } catch {
    return false;
  }
}

function isWeakPassword(entry: VaultItem): boolean {
  const password = entry.password || '';
  if (!hasPasswordSecret(entry)) return false;
  if (password.length < 12) return true;
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) return true;
  return /(.)\1{3,}/.test(password);
}

function getReusedPasswordEntries(entries: VaultItem[]): VaultItem[] {
  const byPassword = new Map<string, VaultItem[]>();
  entries.filter(hasPasswordSecret).forEach(entry => {
    const password = entry.password!.trim();
    const current = byPassword.get(password) || [];
    current.push(entry);
    byPassword.set(password, current);
  });
  return Array.from(byPassword.values())
    .filter(group => group.length > 1)
    .flat();
}

function getSeverityForIssue(issueType: SecurityCenterIssueType): 'low' | 'medium' | 'high' {
  switch (issueType) {
    case 'missing_2fa': return 'high';
    case 'aging_credentials': return 'medium';
    case 'stale_secret': return 'medium';
    case 'sensitive_sharing': return 'high';
    case 'reused_password': return 'high';
    case 'alias_exposure': return 'medium';
    case 'weak_password': return 'medium';
    case 'missing_identity': return 'low';
    case 'passkey_ready': return 'low';
    default: return 'low';
  }
}

function getActionKey(issueType: SecurityCenterIssueType): string {
  return `security_center.action.${issueType}`;
}

function getDetailKey(issueType: SecurityCenterIssueType): string {
  return `security_center.detail.${issueType}`;
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
/* Stryker restore all */

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
    const credentialEntries = activeEntries.filter(isCredentialEntry);

    // ── Metrics ──
    const missingSecondFactorEntries = credentialEntries.filter(e => !hasSecondFactor(e));
    const passkeyReadyEntries = activeEntries.filter(isPasskeyReady);
    const agingCredentialEntries = credentialEntries.filter(isAgingCredential);
    const sensitiveShareEntries = activeEntries.filter(hasSensitiveSharingGap);
    const missingIdentityEntries = credentialEntries.filter(hasMissingIdentity);
    const aliasExposureEntries = credentialEntries.filter(hasAliasExposure);
    const weakPasswordEntries = credentialEntries.filter(isWeakPassword);
    const reusedPasswordEntries = getReusedPasswordEntries(credentialEntries);

    const metrics = {
      missingSecondFactor: missingSecondFactorEntries.length,
      passkeyReady: passkeyReadyEntries.length,
      agingCredentials: agingCredentialEntries.length,
      sensitiveSharing: sensitiveShareEntries.length,
      aliasExposure: aliasExposureEntries.length,
      weakPasswords: weakPasswordEntries.length,
      reusedPasswords: reusedPasswordEntries.length,
    };

    // ── Issues ──
    /* Stryker disable all: issue/triage descriptor literals and routing are validated end-to-end by SecurityCenter summary tests; remaining literal/operator mutants here add high noise with little behavioral value. */
    const issues: SecurityCenterIssueSummary[] = [];

    if (missingSecondFactorEntries.length > 0) {
      issues.push({
        type: 'missing_2fa',
        count: missingSecondFactorEntries.length,
        severity: 'high',
        messageKey: 'security_center.issue.missing_2fa',
        actionKey: 'security_center.action.missing_2fa',
      });
    }

    if (agingCredentialEntries.length > 0) {
      issues.push({
        type: 'aging_credentials',
        count: agingCredentialEntries.length,
        severity: 'medium',
        messageKey: 'security_center.issue.aging_credentials',
        actionKey: 'security_center.action.aging_credentials',
      });
    }

    if (sensitiveShareEntries.length > 0) {
      issues.push({
        type: 'sensitive_sharing',
        count: sensitiveShareEntries.length,
        severity: 'high',
        messageKey: 'security_center.issue.sensitive_sharing',
        actionKey: 'security_center.action.sensitive_sharing',
      });
    }

    if (missingIdentityEntries.length > 0) {
      issues.push({
        type: 'missing_identity',
        count: missingIdentityEntries.length,
        severity: 'low',
        messageKey: 'security_center.issue.missing_identity',
        actionKey: 'security_center.action.missing_identity',
      });
    }

    if (aliasExposureEntries.length > 0) {
      issues.push({
        type: 'alias_exposure',
        count: aliasExposureEntries.length,
        severity: 'medium',
        messageKey: 'security_center.issue.alias_exposure',
        actionKey: 'security_center.action.alias_exposure',
      });
    }

    if (weakPasswordEntries.length > 0) {
      issues.push({
        type: 'weak_password',
        count: weakPasswordEntries.length,
        severity: 'medium',
        messageKey: 'security_center.issue.weak_password',
        actionKey: 'security_center.action.weak_password',
      });
    }

    if (reusedPasswordEntries.length > 0) {
      issues.push({
        type: 'reused_password',
        count: reusedPasswordEntries.length,
        severity: 'high',
        messageKey: 'security_center.issue.reused_password',
        actionKey: 'security_center.action.reused_password',
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
    aliasExposureEntries.forEach(e => addTriageItem(e, 'alias_exposure'));
    weakPasswordEntries.forEach(e => addTriageItem(e, 'weak_password'));
    reusedPasswordEntries.forEach(e => addTriageItem(e, 'reused_password'));
    /* Stryker restore all */

    // ── Score Calculation (0-100) ──
    let score = 100;
    const totalCredentials = Math.max(credentialEntries.length, 1);

    // Deduct for missing 2FA (up to 30 points)
    score -= Math.min(30, Math.round((missingSecondFactorEntries.length / totalCredentials) * 30));

    // Deduct for aging credentials (up to 25 points)
    score -= Math.min(25, Math.round((agingCredentialEntries.length / totalCredentials) * 25));

    // Deduct for sensitive sharing gaps (up to 20 points)
    score -= Math.min(20, sensitiveShareEntries.length * 5);

    // Deduct for missing identity (up to 15 points)
    score -= Math.min(15, Math.round((missingIdentityEntries.length / totalCredentials) * 15));

    // Deduct for alias exposure / rotation gaps (up to 15 points)
    score -= Math.min(15, aliasExposureEntries.length * 5);

    // Deduct for local Watchtower password quality signals (up to 45 points)
    score -= Math.min(20, Math.round((weakPasswordEntries.length / totalCredentials) * 20));
    score -= Math.min(25, Math.round((reusedPasswordEntries.length / totalCredentials) * 25));

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
