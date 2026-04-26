/**
 * SharedVaultService — Aegis Vault Android
 * Manages family and team shared spaces and their association with vault items.
 */

import {
  SharedVaultSpace,
  SharedVaultMember,
  SharedItemAssignment,
  SharingOverviewReport,
  SharingOverviewIssue,
  VaultItem,
  SharedVaultRole,
  SharedMemberStatus,
  SharedVaultKind,
} from '../SecurityModule';

const penaltyWeight = {
  high: 12,
  medium: 6,
  pendingMember: 2,
};

const REVIEW_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

export const sanitizeSharedMember = (
  input: Partial<SharedVaultMember>,
  generateId: (prefix: string) => string,
): SharedVaultMember => {
  return {
    id: (input.id || generateId('member')).trim(),
    name: (input.name || '').trim(),
    email: (input.email || '').trim().toLowerCase(),
    role: (input.role || 'viewer') as SharedVaultRole,
    status: (input.status || 'active') as SharedMemberStatus,
    inviteCode: (input.inviteCode || '').trim() || undefined,
    invitedAt: input.invitedAt || undefined,
    acceptedAt: input.acceptedAt || undefined,
    deviceLabel: (input.deviceLabel || '').trim() || undefined,
    notes: (input.notes || '').trim() || undefined,
    lastVerifiedAt: input.lastVerifiedAt || undefined,
  };
};

export const sanitizeSharedSpace = (
  input: Partial<SharedVaultSpace>,
  generateId: (prefix: string) => string,
): SharedVaultSpace => {
  const now = new Date().toISOString();
  const members = Array.isArray(input.members)
    ? input.members
        .map(member => sanitizeSharedMember(member, generateId))
        .filter(member => member.name || member.email)
    : [];

  return {
    id: (input.id || generateId('space')).trim(),
    name: (input.name || '').trim(),
    kind: (input.kind || 'family') as SharedVaultKind,
    description: (input.description || '').trim(),
    defaultRole: (input.defaultRole || 'viewer') as Exclude<
      SharedVaultRole,
      'owner'
    >,
    allowExport: input.allowExport !== false,
    requireReview: Boolean(input.requireReview),
    createdAt: input.createdAt || now,
    updatedAt: now,
    members,
  };
};

export const parseSharedAssignment = (
  data: any,
): SharedItemAssignment | null => {
  const shared = data?.shared;
  if (!shared || typeof shared !== 'object') return null;
  if (!(shared.spaceId || '').trim()) return null;

  return {
    spaceId: String(shared.spaceId).trim(),
    role: (
      shared.role && ['editor', 'viewer'].includes(shared.role)
        ? shared.role
        : 'viewer'
    ) as 'editor' | 'viewer',
    sharedBy: (shared.sharedBy || '').trim() || undefined,
    isSensitive: Boolean(shared.isSensitive),
    emergencyAccess: Boolean(shared.emergencyAccess),
    notes: (shared.notes || '').trim() || undefined,
    lastReviewedAt: (shared.lastReviewedAt || '').trim() || undefined,
  };
};

export const generateSharingOverview = (
  spaces: SharedVaultSpace[],
  items: VaultItem[],
  parseAssignment: (item: VaultItem) => SharedItemAssignment | null,
): SharingOverviewReport => {
  const issues: SharingOverviewIssue[] = [];
  const now = Date.now();
  let sharedItemsCount = 0;
  let reviewRequiredItems = 0;
  let pendingMembersCount = 0;

  const spaceSummaries = spaces.map(space => {
    const activeMembers = space.members.filter(m => m.status === 'active').length;
    const pending = space.members.filter(m => m.status === 'pending').length;
    pendingMembersCount += pending;
    return {
      ...space,
      itemCount: 0,
      activeMembers,
      pendingMembers: pending,
    };
  });

  const spaceIndex = new Map(spaceSummaries.map(s => [s.id, s]));

  for (const item of items) {
    const assignment = parseAssignment(item);
    if (!assignment) continue;
    sharedItemsCount++;
    
    const space = spaceIndex.get(assignment.spaceId);
    if (!space) {
      issues.push({
        itemId: item.id || 0,
        title: item.title || 'Untitled',
        severity: 'high',
        type: 'orphaned_space',
        message: 'Shared assignment points to a space that no longer exists.',
      });
      continue;
    }

    space.itemCount += 1;

    if (space.members.length === 0) {
      issues.push({
        itemId: item.id || 0,
        title: item.title || 'Untitled',
        severity: 'high',
        type: 'no_members',
        message: 'Shared item belongs to a space without any configured members.',
      });
    }

    const reviewedAt = assignment.lastReviewedAt ? new Date(assignment.lastReviewedAt).getTime() : 0;
    const requiresReview = space.requireReview && (!reviewedAt || now - reviewedAt > REVIEW_THRESHOLD_MS);
    if (requiresReview) {
      reviewRequiredItems++;
      issues.push({
        itemId: item.id || 0,
        title: item.title || 'Untitled',
        severity: 'medium',
        type: 'review_required',
        message: 'Shared access review is overdue for this item.',
      });
    }

    if (assignment.isSensitive && !assignment.emergencyAccess) {
      issues.push({
        itemId: item.id || 0,
        title: item.title || 'Untitled',
        severity: 'medium',
        type: 'sensitive_without_emergency',
        message: 'Sensitive shared item has no emergency access path configured.',
      });
    }
  }

  const penalty =
    issues.filter(i => i.severity === 'high').length * penaltyWeight.high +
    issues.filter(i => i.severity === 'medium').length * penaltyWeight.medium +
    pendingMembersCount * penaltyWeight.pendingMember;

  const score = Math.max(0, 100 - penalty);
  const actions: string[] = [];
  
  if (issues.some(i => i.type === 'orphaned_space')) actions.push('Fix items linked to deleted spaces.');
  if (issues.some(i => i.type === 'no_members')) actions.push('Add members to empty shared spaces.');
  if (reviewRequiredItems > 0) actions.push('Perform access reviews for spaces requiring periodic audits.');
  if (issues.some(i => i.type === 'sensitive_without_emergency')) actions.push('Enable emergency access for sensitive shared data.');
  
  if (actions.length === 0) actions.push('Shared spaces are healthy.');

  return {
    score,
    riskLevel: score > 80 ? 'low' : score > 50 ? 'medium' : score > 25 ? 'high' : 'critical',
    summary: {
      spaces: spaces.length,
      sharedItems: sharedItemsCount,
      familySpaces: spaces.filter(s => s.kind === 'family').length,
      teamSpaces: spaces.filter(s => s.kind === 'team').length,
      pendingMembers: pendingMembersCount,
      reviewRequiredItems,
    },
    actions,
    issues,
    spaces: spaceSummaries,
  };
};
