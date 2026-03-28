/* eslint-disable react-native/no-inline-styles */
/**
 * SecurityCenterModal — Aegis Vault Android v4.02
 * A dedicated panel for reviewing vault security risks and triage items.
 *
 * Güvenlik Merkezi Modalı — Kasa risklerini ve aksiyon bekleyen bulguları inceleme paneli.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecurityCenterService, SecurityCenterSummary, SecurityCenterTriageItem } from '../SecurityCenterService';
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

const Card = ({ children, style, theme }: any) => (
  <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }, style]}>
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

  // Compute summary when items or reviews change
  useEffect(() => {
    if (visible) {
      const settings = SecureAppSettings.get();
      const s = SecurityCenterService.buildSummary(items, settings.securityCenterReviews || {});
      setSummary(s);
    }
  }, [visible, items]);

  const handleReview = async (item: SecurityCenterTriageItem) => {
    await SecureAppSettings.markReviewed(item.reviewKey, item.issueType, item.title, db);
    // Refresh summary
    const settings = SecureAppSettings.get();
    setSummary(SecurityCenterService.buildSummary(items, settings.securityCenterReviews));
  };

  const handleReopen = async (item: SecurityCenterTriageItem) => {
    await SecureAppSettings.reopenReview(item.reviewKey, item.issueType, item.title, db);
    const settings = SecureAppSettings.get();
    setSummary(SecurityCenterService.buildSummary(items, settings.securityCenterReviews));
  };

  if (!summary) return null;

  const scoreColor = summary.score >= 75 ? '#22c55e' : summary.score >= 45 ? '#f59e0b' : '#ef4444';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[s.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.hdr}>
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <Text style={{ fontSize: 24, color: theme.navy }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[s.title, { color: theme.navy }]}>{t('security_center.title')}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={[s.content, { paddingBottom: 40 + insets.bottom }]}>
          {/* Score Section */}
          <Card style={s.scoreCard} theme={theme}>
            <View style={[s.scoreRing, { borderColor: scoreColor }]}>
              <Text style={[s.scoreValue, { color: theme.navy }]}>{summary.score}</Text>
              <Text style={[s.scoreLabel, { color: theme.muted }]}>/100</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 20 }}>
              <Text style={[s.riskLevel, { color: scoreColor }]}>
                {t(`security_center.risk_${summary.riskLevel}`)}
              </Text>
              <Text style={[s.subtitle, { color: theme.muted }]} numberOfLines={2}>
                {t('security_center.subtitle')}
              </Text>
            </View>
          </Card>

          {/* Metrics Grid */}
          <View style={s.grid}>
            {Object.entries(summary.metrics).map(([key, val]) => (
              <View key={key} style={[s.gridItem, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <Text style={[s.gridVal, { color: theme.navy }]}>{val}</Text>
                <Text style={[s.gridLbl, { color: theme.muted }]}>{t(`security_center.metrics.${key}`)}</Text>
              </View>
            ))}
          </View>

          {/* Triage Items */}
          <Text style={[s.secTitle, { color: theme.navy }]}>
            {t('security_center.triage_title', { count: summary.triageItems.length })}
          </Text>

          {summary.triageItems.length === 0 ? (
            <Card style={s.emptyCard} theme={theme}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>🛡️</Text>
              <Text style={[s.emptyText, { color: theme.muted }]}>{t('security_center.no_issues')}</Text>
            </Card>
          ) : (
            summary.triageItems.map((item, idx) => (
              <Card key={`${item.reviewKey}_${idx}`} style={s.issueCard} theme={theme}>
                <View style={[s.severityBar, { backgroundColor: item.severity === 'high' ? '#ef4444' : item.severity === 'medium' ? '#f59e0b' : '#64748b' }]} />
                <View style={{ flex: 1, padding: 12 }}>
                  <Text style={[s.issueTitle, { color: theme.navy }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={[s.issueDetail, { color: theme.muted }]}>{t(item.detailKey)}</Text>
                  <Text style={[s.issueAction, { color: theme.sage }]}>{t(item.actionKey)}</Text>
                  
                  <View style={s.issueActions}>
                    <TouchableOpacity 
                      onPress={() => { onClose(); if(onNavigateToItem) onNavigateToItem(item.itemId); }} 
                      style={[s.actionBtn, { backgroundColor: theme.sage }]}
                    >
                      <Text style={s.actionBtnT}>{t('vault.edit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleReview(item)} 
                      style={[s.actionBtnSecondary, { borderColor: theme.divider }]}
                    >
                      <Text style={[s.actionBtnSecondaryT, { color: theme.navy }]}>{t('security_center.review_btn')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))
          )}

          {/* Recently Reviewed */}
          {summary.reviewedTriageItems.length > 0 && (
            <>
              <TouchableOpacity onPress={() => setShowHistory(!showHistory)} style={s.historyToggle}>
                <Text style={[s.secTitle, { color: theme.muted, marginTop: 10 }]}>
                  {t('security_center.reviewed_title', { count: summary.reviewedTriageItems.length })} {showHistory ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>
              
              {showHistory && summary.reviewedTriageItems.map((item, idx) => (
                <Card key={`rev_${idx}`} style={[s.issueCard, { opacity: 0.6 }]} theme={theme}>
                  <View style={{ flex: 1, padding: 12 }}>
                    <Text style={[s.issueTitle, { color: theme.navy, textDecorationLine: 'line-through' }]}>{item.title}</Text>
                    <Text style={[s.issueDetail, { color: theme.muted }]}>
                      {t('security_center.reviewed_at', { date: item.reviewedAt ? new Date(item.reviewedAt).toLocaleDateString() : '-' })}
                    </Text>
                    <TouchableOpacity onPress={() => handleReopen(item)} style={{ marginTop: 8 }}>
                       <Text style={{ color: theme.sage, fontWeight: '700', fontSize: 12 }}>{t('security_center.reopen_btn')}</Text>
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
    height: 56,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    padding: 12,
  },
  scoreCard: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  scoreRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  scoreValue: { fontSize: 24, fontWeight: '800' },
  scoreLabel: { fontSize: 12, marginTop: 6, marginLeft: 2 },
  riskLevel: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  gridItem: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  gridVal: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  gridLbl: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  secTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12, marginTop: 8 },
  emptyCard: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
  issueCard: { padding: 0, flexDirection: 'row' },
  severityBar: { width: 6, height: '100%' },
  issueTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  issueDetail: { fontSize: 12, marginBottom: 4 },
  issueAction: { fontSize: 11, fontWeight: '700', fontStyle: 'italic', marginBottom: 12 },
  issueActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actionBtnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnSecondaryT: { fontSize: 12, fontWeight: '700' },
  historyToggle: { paddingVertical: 4 },
});
