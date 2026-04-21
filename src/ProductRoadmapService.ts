import type { VaultItem } from './SecurityModule';
import type { SecureAppSettingsState } from './SecureAppSettings';
import { SecurityCenterService } from './SecurityCenterService';

export type RoadmapInitiativeId =
  | 'passkey'
  | 'security'
  | 'sync'
  | 'sharing'
  | 'pairing';

export type RoadmapInitiativeStatus =
  | 'planned'
  | 'foundation'
  | 'advanced'
  | 'ready';

export interface RoadmapInitiativeSnapshot {
  id: RoadmapInitiativeId;
  priority: number;
  progress: number;
  status: RoadmapInitiativeStatus;
  titleKey: string;
  summaryKey: string;
  nextStepKey: string;
  ctaTarget?:
    | 'security_center'
    | 'shared_spaces'
    | 'autofill'
    | 'validation_workspace'
    | 'pairing_workspace';
  stats: Record<string, number | boolean>;
}

export interface ProductRoadmapSummary {
  overallProgress: number;
  focusInitiatives: RoadmapInitiativeId[];
  initiatives: RoadmapInitiativeSnapshot[];
}

interface BuildOptions {
  entries: VaultItem[];
  settings: SecureAppSettingsState;
  autofillSupported: boolean;
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const toStatus = (progress: number): RoadmapInitiativeStatus => {
  if (progress >= 85) {
    return 'ready';
  }
  if (progress >= 60) {
    return 'advanced';
  }
  if (progress >= 30) {
    return 'foundation';
  }
  return 'planned';
};

const isActiveEntry = (entry: VaultItem) =>
  !entry.is_deleted || entry.is_deleted === 0;

const parseEntryData = (entry: VaultItem): Record<string, any> => {
  if (!entry.data) {
    return {};
  }

  if (typeof entry.data === 'object') {
    return entry.data as Record<string, any>;
  }

  try {
    return JSON.parse(entry.data);
  } catch {
    return {};
  }
};

export const ProductRoadmapService = {
  buildSummary(options: BuildOptions): ProductRoadmapSummary {
    const activeEntries = options.entries.filter(isActiveEntry);
    const reviewed =
      options.settings.securityCenterReviews || {};
    const securitySummary = SecurityCenterService.buildSummary(
      activeEntries,
      reviewed,
    );

    const passkeyEntries = activeEntries.filter(
      entry => entry.category === 'passkey',
    );
    const passkeyBackendConfigured = Boolean(
      options.settings.passkeyRp?.baseUrl?.trim() &&
        options.settings.passkeyRp?.accountId?.trim(),
    );
    const rpConnectedCount = passkeyEntries.filter(entry => {
      const data = parseEntryData(entry);
      return data.mode === 'rp_connected';
    }).length;
    const serverVerifiedCount = passkeyEntries.filter(entry => {
      const data = parseEntryData(entry);
      return data.server_verified === true;
    }).length;
    const passkeyProgress = clamp(
      (passkeyEntries.length > 0 ? 15 : 0) +
        (passkeyBackendConfigured ? 25 : 0) +
        (rpConnectedCount > 0 ? 30 : 0) +
        (serverVerifiedCount > 0 ? 30 : 0),
    );

    const relayConfigured = Boolean(
      options.settings.relayUrl?.trim() &&
        options.settings.syncSessionId?.trim(),
    );
    const certificatePinned = Boolean(
      options.settings.relayCertificatePin?.trim(),
    );
    const syncValidated = Boolean(
      options.settings.syncLastSequence > 0 ||
        options.settings.syncLastPushTimestamp,
    );
    const validationRuns = options.settings.validationRecords?.length || 0;
    const syncProgress = clamp(
      (relayConfigured ? 30 : 0) +
        (certificatePinned ? 35 : 0) +
        (syncValidated ? 35 : 0),
    );

    const sharedSpaces = options.settings.sharedSpaces || [];
    const activeMembers = sharedSpaces.reduce(
      (sum, space) =>
        sum +
        space.members.filter(member => member.status === 'active').length,
      0,
    );
    const pendingMembers = sharedSpaces.reduce(
      (sum, space) =>
        sum +
        space.members.filter(member => member.status === 'pending').length,
      0,
      );
    const sensitiveSharedEntries = activeEntries.filter(entry => {
      const data = parseEntryData(entry);
      return Boolean(data.shared_space_id);
    });
    const reviewedSensitiveEntries = sensitiveSharedEntries.filter(entry => {
      const data = parseEntryData(entry);
      return data.shared_reviewed === true;
    }).length;
    const sharingProgress = clamp(
      (sharedSpaces.length > 0 ? 35 : 0) +
        (activeMembers > 0 ? 25 : 0) +
        (pendingMembers > 0 ? 15 : 0) +
        (reviewedSensitiveEntries > 0 ? 25 : 0),
    );

    const loginEntries = activeEntries.filter(entry => entry.category === 'login');
    const browserReadyEntries = activeEntries.filter(entry => {
      if (entry.category === 'login') {
        return Boolean(entry.url?.trim());
      }
      if (entry.category !== 'passkey') {
        return false;
      }
      const data = parseEntryData(entry);
      return Boolean(data.rp_id || entry.url?.trim());
    }).length;
    const pairedBridges = (options.settings.browserPairings || []).filter(
      pairing => pairing.status === 'paired',
    ).length;
    const pendingBridges = (options.settings.browserPairings || []).filter(
      pairing => pairing.status === 'pending',
    ).length;
    const pairingProgress = clamp(
      (options.autofillSupported ? 40 : 0) +
        (browserReadyEntries > 0 ? 35 : 0) +
        (pairedBridges > 0 ? 15 : pendingBridges > 0 ? 8 : 0) +
        (options.settings.biometricEnabled ? 15 : 0) +
        (loginEntries.length > 0 || passkeyEntries.length > 0 ? 10 : 0),
    );

    const securityProgress = clamp(
      35 +
        (options.settings.breachCheckEnabled ? 20 : 0) +
        Math.round(securitySummary.score * 0.45),
    );

    const initiatives: RoadmapInitiativeSnapshot[] = [
      {
        id: 'passkey',
        priority: 1,
        progress: passkeyProgress,
        status: toStatus(passkeyProgress),
        titleKey: 'roadmap_center.initiatives.passkey.title',
        summaryKey: 'roadmap_center.initiatives.passkey.summary',
        nextStepKey:
          passkeyEntries.length === 0
            ? 'roadmap_center.initiatives.passkey.next_no_passkeys'
            : rpConnectedCount === 0
            ? 'roadmap_center.initiatives.passkey.next_enable_rp'
            : serverVerifiedCount === 0
            ? 'roadmap_center.initiatives.passkey.next_enable_verification'
            : 'roadmap_center.initiatives.passkey.next_expand',
        stats: {
          entries: passkeyEntries.length,
          backendConfigured: passkeyBackendConfigured,
          rpConnected: rpConnectedCount,
          serverVerified: serverVerifiedCount,
        },
      },
      {
        id: 'security',
        priority: 2,
        progress: securityProgress,
        status: toStatus(securityProgress),
        titleKey: 'roadmap_center.initiatives.security.title',
        summaryKey: 'roadmap_center.initiatives.security.summary',
        nextStepKey:
          !options.settings.breachCheckEnabled
            ? 'roadmap_center.initiatives.security.next_enable_breach'
            : securitySummary.triageItems.length > 0
            ? 'roadmap_center.initiatives.security.next_resolve_queue'
            : 'roadmap_center.initiatives.security.next_expand',
        ctaTarget: 'security_center',
        stats: {
          score: securitySummary.score,
          triage: securitySummary.triageItems.length,
          missingSecondFactor: securitySummary.metrics.missingSecondFactor,
          breachEnabled: options.settings.breachCheckEnabled,
        },
      },
      {
        id: 'sync',
        priority: 3,
        progress: syncProgress,
        status: toStatus(syncProgress),
        titleKey: 'roadmap_center.initiatives.sync.title',
        summaryKey: 'roadmap_center.initiatives.sync.summary',
        nextStepKey: !relayConfigured
          ? 'roadmap_center.initiatives.sync.next_configure_relay'
          : !certificatePinned
          ? 'roadmap_center.initiatives.sync.next_add_pin'
          : !syncValidated
          ? 'roadmap_center.initiatives.sync.next_validate_field'
          : 'roadmap_center.initiatives.sync.next_expand',
        ctaTarget: 'validation_workspace',
        stats: {
          relayConfigured,
          certificatePinned,
          syncValidated,
          sequence: options.settings.syncLastSequence || 0,
          validationRuns,
        },
      },
      {
        id: 'sharing',
        priority: 4,
        progress: sharingProgress,
        status: toStatus(sharingProgress),
        titleKey: 'roadmap_center.initiatives.sharing.title',
        summaryKey: 'roadmap_center.initiatives.sharing.summary',
        nextStepKey:
          sharedSpaces.length === 0
            ? 'roadmap_center.initiatives.sharing.next_create_space'
            : activeMembers === 0 && pendingMembers === 0
            ? 'roadmap_center.initiatives.sharing.next_invite_members'
            : sensitiveSharedEntries.length > reviewedSensitiveEntries
            ? 'roadmap_center.initiatives.sharing.next_review_sensitive'
            : 'roadmap_center.initiatives.sharing.next_expand',
        ctaTarget: 'shared_spaces',
        stats: {
          spaces: sharedSpaces.length,
          activeMembers,
          pendingMembers,
          reviewedSensitive: reviewedSensitiveEntries,
        },
      },
      {
        id: 'pairing',
        priority: 5,
        progress: pairingProgress,
        status: toStatus(pairingProgress),
        titleKey: 'roadmap_center.initiatives.pairing.title',
        summaryKey: 'roadmap_center.initiatives.pairing.summary',
        nextStepKey:
          !options.autofillSupported
            ? 'roadmap_center.initiatives.pairing.next_enable_autofill'
            : pairedBridges === 0 && pendingBridges === 0
            ? 'roadmap_center.initiatives.pairing.next_create_bridge'
            : browserReadyEntries === 0
            ? 'roadmap_center.initiatives.pairing.next_add_domains'
            : 'roadmap_center.initiatives.pairing.next_expand',
        ctaTarget: options.autofillSupported ? 'pairing_workspace' : undefined,
        stats: {
          autofillSupported: options.autofillSupported,
          browserReady: browserReadyEntries,
          biometrics: options.settings.biometricEnabled,
          loginEntries: loginEntries.length,
          pairedBridges,
          pendingBridges,
        },
      },
    ];

    const overallProgress = clamp(
      initiatives.reduce((sum, initiative) => sum + initiative.progress, 0) /
        initiatives.length,
    );

    const focusInitiatives = [...initiatives]
      .sort((left, right) => left.progress - right.progress)
      .slice(0, 2)
      .map(initiative => initiative.id);

    return {
      overallProgress,
      focusInitiatives,
      initiatives,
    };
  },
};
