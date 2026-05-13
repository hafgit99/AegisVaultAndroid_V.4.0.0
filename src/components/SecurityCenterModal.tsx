/* eslint-disable react-native/no-inline-styles */
/**
 * SecurityCenterModal - Aegis Vault Android
 * Professional vault-wide risk cockpit with bilingual and dark-mode support.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  SecurityCenterService,
  SecurityCenterSummary,
  SecurityCenterTriageItem,
} from '../SecurityCenterService';
import { SecureAppSettings } from '../SecureAppSettings';
import { VaultItem } from '../SecurityModule';

interface SecurityCenterModalProps {
  visible: boolean;
  onClose: () => void;
  items: VaultItem[];
  theme: any;
  insets: any;
  onNavigateToItem?: (itemId: number) => void;
  db?: any;
}

const riskTone = (score: number) => {
  if (score >= 75) {
    return {
      color: '#16a34a',
      bg: 'rgba(22,163,74,0.12)',
      border: 'rgba(22,163,74,0.26)',
    };
  }
  if (score >= 45) {
    return {
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.13)',
      border: 'rgba(245,158,11,0.28)',
    };
  }
  return {
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.28)',
  };
};

const severityTone = (severity: SecurityCenterTriageItem['severity']) =>
  ({
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#64748b',
  })[severity] || '#64748b';

const clampScore = (score: number) => Math.max(0, Math.min(100, score));

const Card = ({ children, style, theme }: any) => (
  <View
    style={[
      s.card,
      {
        backgroundColor: theme.cardElevated || theme.card,
        borderColor: theme.cardBorder,
        shadowColor: theme.shadow || '#000000',
      },
      style,
    ]}
  >
    {children}
  </View>
);

export const SecurityCenterModal = ({
  visible,
  onClose,
  items,
  theme,
  insets,
  onNavigateToItem,
  db,
}: SecurityCenterModalProps) => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<SecurityCenterSummary | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (visible) {
      const settings = SecureAppSettings.get();
      setSummary(
        SecurityCenterService.buildSummary(
          items,
          settings.securityCenterReviews || {},
        ),
      );
    }
  }, [visible, items]);

  const handleReview = async (item: SecurityCenterTriageItem) => {
    await SecureAppSettings.markReviewed(
      item.reviewKey,
      item.issueType,
      item.title,
      db,
    );
    const settings = SecureAppSettings.get();
    setSummary(
      SecurityCenterService.buildSummary(
        items,
        settings.securityCenterReviews,
      ),
    );
  };

  const handleReopen = async (item: SecurityCenterTriageItem) => {
    await SecureAppSettings.reopenReview(
      item.reviewKey,
      item.issueType,
      item.title,
      db,
    );
    const settings = SecureAppSettings.get();
    setSummary(
      SecurityCenterService.buildSummary(
        items,
        settings.securityCenterReviews,
      ),
    );
  };

  if (!summary) return null;

  const primaryText = theme.textPrimary || theme.navy;
  const secondaryText = theme.textSecondary || theme.muted;
  const tertiaryText = theme.textTertiary || theme.muted;
  const scoreTone = riskTone(summary.score);
  const topMetrics = Object.entries(summary.metrics)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 4);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View
        style={[s.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}
      >
        <View style={s.hdr}>
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <Text style={{ fontSize: 24, color: primaryText }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.title, { color: primaryText }]}>
              {t('security_center.title')}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.content,
            { paddingBottom: 40 + insets.bottom },
          ]}
        >
          <Card style={[s.scoreCard, { borderColor: scoreTone.border }]} theme={theme}>
            <View style={s.heroTop}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[s.eyebrow, { color: tertiaryText }]}>
                  {t('security_center.overview_label')}
                </Text>
                <Text style={[s.heroTitle, { color: primaryText }]}>
                  {t('security_center.posture_title')}
                </Text>
                <Text
                  style={[s.subtitle, { color: secondaryText }]}
                  numberOfLines={3}
                >
                  {t('security_center.subtitle')}
                </Text>
              </View>
              <View
                style={[
                  s.riskPill,
                  {
                    backgroundColor: scoreTone.bg,
                    borderColor: scoreTone.border,
                  },
                ]}
              >
                <Text style={[s.riskPillText, { color: scoreTone.color }]}>
                  {t(`security_center.risk_${summary.riskLevel}`)}
                </Text>
              </View>
            </View>

            <View style={s.scoreBody}>
              <View
                style={[
                  s.scoreRing,
                  { borderColor: scoreTone.color, backgroundColor: scoreTone.bg },
                ]}
              >
                <Text style={[s.scoreValue, { color: primaryText }]}>
                  {summary.score}
                </Text>
                <Text style={[s.scoreLabel, { color: secondaryText }]}>
                  /100
                </Text>
              </View>
              <View style={s.scoreCopy}>
                <Text style={[s.scoreCaption, { color: secondaryText }]}>
                  {t('security_center.score_label')}
                </Text>
                <View
                  style={[s.progressTrack, { backgroundColor: theme.inputBg }]}
                >
                  <View
                    style={[
                      s.progressFill,
                      {
                        width: `${clampScore(summary.score)}%`,
                        backgroundColor: scoreTone.color,
                      },
                    ]}
                  />
                </View>
                <Text style={[s.scoreHint, { color: tertiaryText }]}>
                  {t('security_center.evidence_hint', {
                    count: summary.triageItems.length,
                    reviewed: summary.reviewedTriageItems.length,
                  })}
                </Text>
              </View>
            </View>
          </Card>

          <View style={s.quickStrip}>
            {[
              {
                label: t('security_center.queue_label'),
                value: summary.triageItems.length,
                color: scoreTone.color,
              },
              {
                label: t('security_center.reviewed_label'),
                value: summary.reviewedTriageItems.length,
                color: theme.sage,
              },
              {
                label: t('security_center.coverage_label'),
                value: `${clampScore(summary.score)}%`,
                color: '#0f766e',
              },
            ].map(card => (
              <View
                key={card.label}
                style={[
                  s.quickCard,
                  {
                    backgroundColor: theme.bgAccent || theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <Text style={[s.quickValue, { color: card.color }]}>
                  {card.value}
                </Text>
                <Text style={[s.quickLabel, { color: secondaryText }]}>
                  {card.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.sectionHeader}>
            <Text style={[s.secTitle, { color: primaryText }]}>
              {t('security_center.metrics_title')}
            </Text>
            <Text style={[s.sectionHint, { color: tertiaryText }]}>
              {t('security_center.metrics_hint')}
            </Text>
          </View>
          <View style={s.grid}>
            {topMetrics.map(([key, val]) => (
              <View
                key={key}
                style={[
                  s.gridItem,
                  {
                    backgroundColor: theme.cardElevated || theme.card,
                    borderColor: theme.cardBorder,
                    shadowColor: theme.shadow || '#000000',
                  },
                ]}
              >
                <Text style={[s.gridVal, { color: primaryText }]}>{val}</Text>
                <Text style={[s.gridLbl, { color: secondaryText }]}>
                  {t(`security_center.metrics.${key}`)}
                </Text>
              </View>
            ))}
          </View>

          <View style={s.sectionHeader}>
            <Text style={[s.secTitle, { color: primaryText }]}>
              {t('security_center.triage_title', {
                count: summary.triageItems.length,
              })}
            </Text>
            <Text style={[s.sectionHint, { color: tertiaryText }]}>
              {t('security_center.triage_hint')}
            </Text>
          </View>

          {summary.triageItems.length === 0 ? (
            <Card style={s.emptyCard} theme={theme}>
              <View
                style={[
                  s.emptyIcon,
                  { backgroundColor: scoreTone.bg, borderColor: scoreTone.border },
                ]}
              >
                <Text style={[s.emptyIconText, { color: scoreTone.color }]}>
                  ✓
                </Text>
              </View>
              <Text style={[s.emptyText, { color: secondaryText }]}>
                {t('security_center.no_issues')}
              </Text>
            </Card>
          ) : (
            summary.triageItems.map((item, idx) => {
              const issueColor = severityTone(item.severity);
              return (
                <Card
                  key={`${item.reviewKey}_${idx}`}
                  style={s.issueCard}
                  theme={theme}
                >
                  <View
                    style={[s.severityBar, { backgroundColor: issueColor }]}
                  />
                  <View style={s.issueContent}>
                    <View style={s.issueTop}>
                      <Text
                        style={[s.issueTitle, { color: primaryText }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <View
                        style={[
                          s.severityPill,
                          {
                            borderColor: issueColor,
                            backgroundColor: `${issueColor}1A`,
                          },
                        ]}
                      >
                        <Text
                          style={[s.severityPillText, { color: issueColor }]}
                        >
                          {item.severity.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.issueDetail, { color: secondaryText }]}>
                      {t(item.detailKey)}
                    </Text>
                    <Text style={[s.issueAction, { color: theme.sage }]}>
                      {t(item.actionKey)}
                    </Text>

                    <View style={s.issueActions}>
                      <TouchableOpacity
                        onPress={() => {
                          onClose();
                          if (onNavigateToItem) onNavigateToItem(item.itemId);
                        }}
                        style={[s.actionBtn, { backgroundColor: theme.sage }]}
                      >
                        <Text style={s.actionBtnT}>{t('vault.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleReview(item)}
                        style={[
                          s.actionBtnSecondary,
                          {
                            borderColor: theme.cardBorder,
                            backgroundColor: theme.bgAccent || 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[s.actionBtnSecondaryT, { color: primaryText }]}
                        >
                          {t('security_center.review_btn')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              );
            })
          )}

          {summary.reviewedTriageItems.length > 0 && (
            <>
              <TouchableOpacity
                onPress={() => setShowHistory(!showHistory)}
                style={s.historyToggle}
              >
                <Text
                  style={[s.secTitle, { color: secondaryText, marginTop: 10 }]}
                >
                  {t('security_center.reviewed_title', {
                    count: summary.reviewedTriageItems.length,
                  })}{' '}
                  {showHistory ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {showHistory &&
                summary.reviewedTriageItems.map((item, idx) => (
                  <Card
                    key={`rev_${idx}`}
                    style={[s.issueCard, { opacity: 0.72 }]}
                    theme={theme}
                  >
                    <View style={s.issueContent}>
                      <Text
                        style={[
                          s.issueTitle,
                          {
                            color: primaryText,
                            textDecorationLine: 'line-through',
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                      <Text style={[s.issueDetail, { color: secondaryText }]}>
                        {t('security_center.reviewed_at', {
                          date: item.reviewedAt
                            ? new Date(item.reviewedAt).toLocaleDateString()
                            : '-',
                        })}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleReopen(item)}
                        style={{ marginTop: 8 }}
                      >
                        <Text
                          style={{
                            color: theme.sage,
                            fontWeight: '800',
                            fontSize: 12,
                          }}
                        >
                          {t('security_center.reopen_btn')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  hdr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 58,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16 },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    padding: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  scoreCard: { padding: 18, borderRadius: 28 },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: { fontSize: 22, fontWeight: '900', marginTop: 6, marginBottom: 7 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  riskPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  riskPillText: { fontSize: 11, fontWeight: '900' },
  scoreBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 7,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  scoreValue: { fontSize: 28, fontWeight: '900' },
  scoreLabel: { fontSize: 12, marginTop: 8, marginLeft: 2, fontWeight: '700' },
  scoreCopy: { flex: 1 },
  scoreCaption: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  scoreHint: { fontSize: 12, lineHeight: 17, marginTop: 9 },
  quickStrip: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  quickCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  quickValue: { fontSize: 20, fontWeight: '900' },
  quickLabel: { fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 4 },
  sectionHeader: { marginTop: 2, marginBottom: 10 },
  secTitle: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  sectionHint: { fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  gridItem: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  gridVal: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  gridLbl: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  emptyCard: { alignItems: 'center', paddingVertical: 34 },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyIconText: { fontSize: 24, fontWeight: '900' },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 20,
  },
  issueCard: { padding: 0, flexDirection: 'row' },
  severityBar: { width: 6 },
  issueContent: { flex: 1, padding: 14 },
  issueTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 5,
  },
  severityPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  severityPillText: { fontSize: 10, fontWeight: '900' },
  issueTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  issueDetail: { fontSize: 12, marginBottom: 5, lineHeight: 17 },
  issueAction: { fontSize: 12, fontWeight: '800', marginBottom: 12, lineHeight: 17 },
  issueActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  actionBtnSecondary: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnSecondaryT: { fontSize: 12, fontWeight: '800' },
  historyToggle: { paddingVertical: 4 },
});
