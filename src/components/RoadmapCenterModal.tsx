/* eslint-disable react-native/no-inline-styles */
import React, { useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecureAppSettings } from '../SecureAppSettings';
import {
  ProductRoadmapService,
  type RoadmapInitiativeSnapshot,
} from '../ProductRoadmapService';
import type { VaultItem } from '../SecurityModule';

interface RoadmapCenterModalProps {
  visible: boolean;
  onClose: () => void;
  items: VaultItem[];
  theme: any;
  insets: any;
  autofillSupported: boolean;
  onAction: (
    target:
      | 'security_center'
      | 'shared_spaces'
      | 'autofill'
      | 'validation_workspace'
      | 'pairing_workspace'
  ) => void;
}

const progressColor = (progress: number) => {
  if (progress >= 85) {
    return '#22c55e';
  }
  if (progress >= 60) {
    return '#06b6d4';
  }
  if (progress >= 30) {
    return '#f59e0b';
  }
  return '#ef4444';
};

const statusTone = (
  theme: any,
  progress: number,
): { backgroundColor: string; color: string; borderColor: string } => {
  const color = progressColor(progress);
  return {
    backgroundColor:
      progress >= 60 ? theme.sageLight : 'rgba(245,158,11,0.12)',
    color,
    borderColor: progress >= 60 ? theme.sageMid : 'rgba(245,158,11,0.24)',
  };
};

const SummaryLine = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: any;
}) => (
  <Text style={[styles.summary, { color: theme.muted }]}>{children}</Text>
);

export const RoadmapCenterModal = ({
  visible,
  onClose,
  items,
  theme,
  insets,
  autofillSupported,
  onAction,
}: RoadmapCenterModalProps) => {
  const { t } = useTranslation();

  const summary = useMemo(
    () =>
      ProductRoadmapService.buildSummary({
        entries: items,
        settings: SecureAppSettings.get(),
        autofillSupported,
      }),
    [autofillSupported, items],
  );

  const renderDetails = (initiative: RoadmapInitiativeSnapshot) => {
    switch (initiative.id) {
      case 'passkey':
        return (
          <SummaryLine theme={theme}>
            {t(initiative.summaryKey, {
              entries: initiative.stats.entries,
              rpConnected: initiative.stats.rpConnected,
              serverVerified: initiative.stats.serverVerified,
            })}
          </SummaryLine>
        );
      case 'security':
        return (
          <SummaryLine theme={theme}>
            {t(initiative.summaryKey, {
              score: initiative.stats.score,
              triage: initiative.stats.triage,
              missingSecondFactor: initiative.stats.missingSecondFactor,
              breachEnabled: initiative.stats.breachEnabled
                ? t('roadmap_center.enabled')
                : t('roadmap_center.disabled'),
            })}
          </SummaryLine>
        );
      case 'sync':
        return (
          <SummaryLine theme={theme}>
            {t(initiative.summaryKey, {
              relayConfigured: initiative.stats.relayConfigured
                ? t('roadmap_center.configured')
                : t('roadmap_center.not_configured'),
              certificatePinned: initiative.stats.certificatePinned
                ? t('roadmap_center.configured')
                : t('roadmap_center.not_configured'),
              sequence: initiative.stats.sequence,
              validationRuns: initiative.stats.validationRuns,
            })}
          </SummaryLine>
        );
      case 'sharing':
        return (
          <SummaryLine theme={theme}>
            {t(initiative.summaryKey, {
              spaces: initiative.stats.spaces,
              activeMembers: initiative.stats.activeMembers,
              pendingMembers: initiative.stats.pendingMembers,
              reviewedSensitive: initiative.stats.reviewedSensitive,
            })}
          </SummaryLine>
        );
      case 'pairing':
      default:
        return (
          <SummaryLine theme={theme}>
            {t(initiative.summaryKey, {
              autofillSupported: initiative.stats.autofillSupported
                ? t('roadmap_center.available')
                : t('roadmap_center.unavailable'),
              browserReady: initiative.stats.browserReady,
              loginEntries: initiative.stats.loginEntries,
              pairedBridges: initiative.stats.pairedBridges,
              pendingBridges: initiative.stats.pendingBridges,
            })}
          </SummaryLine>
        );
    }
  };

  const renderAction = (initiative: RoadmapInitiativeSnapshot) => {
    if (!initiative.ctaTarget) {
      return null;
    }

    const label =
      initiative.ctaTarget === 'security_center'
        ? t('roadmap_center.actions.open_security_center')
        : initiative.ctaTarget === 'shared_spaces'
        ? t('roadmap_center.actions.open_shared_spaces')
        : initiative.ctaTarget === 'validation_workspace'
        ? t('roadmap_center.actions.open_validation_workspace')
        : initiative.ctaTarget === 'pairing_workspace'
        ? t('roadmap_center.actions.open_pairing_workspace')
        : t('roadmap_center.actions.open_autofill');

    return (
      <TouchableOpacity
        style={[
          styles.actionButton,
          { backgroundColor: theme.sageLight, borderColor: theme.sageMid },
        ]}
        onPress={() => onAction(initiative.ctaTarget!)}
      >
        <Text style={[styles.actionText, { color: theme.sage }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          { backgroundColor: theme.bg, paddingTop: insets.top || 0 },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={{ fontSize: 24, color: theme.navy }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.navy }]}>
              {t('roadmap_center.title')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              {t('roadmap_center.subtitle')}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(32, (insets.bottom || 0) + 20),
          }}
        >
          <View
            style={[
              styles.overviewCard,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <View style={styles.overviewRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.overviewLabel, { color: theme.muted }]}>
                  {t('roadmap_center.overall')}
                </Text>
                <Text style={[styles.overviewValue, { color: theme.navy }]}>
                  {summary.overallProgress}%
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.overviewLabel, { color: theme.muted }]}>
                  {t('roadmap_center.focus')}
                </Text>
                <Text style={[styles.focusText, { color: theme.navy }]}>
                  {summary.focusInitiatives
                    .map(id => t(`roadmap_center.initiatives.${id}.title`))
                    .join(' • ')}
                </Text>
              </View>
            </View>
          </View>

          {summary.initiatives.map(initiative => {
            const tone = statusTone(theme, initiative.progress);
            return (
              <View
                key={initiative.id}
                style={[
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.priority, { color: theme.sage }]}>
                      {t('roadmap_center.priority', {
                        priority: initiative.priority,
                      })}
                    </Text>
                    <Text style={[styles.cardTitle, { color: theme.navy }]}>
                      {t(initiative.titleKey)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: tone.color }]}>
                      {t(`roadmap_center.status.${initiative.status}`)}
                    </Text>
                  </View>
                </View>

                {renderDetails(initiative)}

                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: theme.divider || theme.cardBorder },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${initiative.progress}%`,
                        backgroundColor: progressColor(initiative.progress),
                      },
                    ]}
                  />
                </View>

                <Text style={[styles.nextStepLabel, { color: theme.muted }]}>
                  {t('roadmap_center.next_step')}
                </Text>
                <Text style={[styles.nextStepText, { color: theme.navy }]}>
                  {t(initiative.nextStepKey)}
                </Text>

                {renderAction(initiative)}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  overviewCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 16,
  },
  overviewLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  overviewValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  focusText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  priority: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  summary: {
    fontSize: 13,
    lineHeight: 19,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  nextStepLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
  },
  nextStepText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  actionButton: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
