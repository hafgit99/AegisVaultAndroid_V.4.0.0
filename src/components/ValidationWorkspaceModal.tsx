/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useMemo, useState } from 'react';
import {
  DeviceEventEmitter,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  FIELD_VALIDATION_RESULTS,
  FieldValidationService,
  PASSKEY_VALIDATION_SCENARIOS,
} from '../FieldValidationService';
import {
  SETTINGS_CHANGED_EVENT,
  SecureAppSettings,
  type ValidationResultCode,
  type ValidationScenario,
} from '../SecureAppSettings';
import { SyncHealthService } from '../SyncHealthService';
import {
  ValidationMatrixService,
  type ValidationMatrixStatus,
} from '../ValidationMatrixService';

interface ValidationWorkspaceModalProps {
  visible: boolean;
  onClose: () => void;
  theme: any;
  insets: any;
}

const resultTone = (
  result: ValidationResultCode,
): { backgroundColor: string; color: string; borderColor: string } => {
  if (result === 'PASS') {
    return {
      backgroundColor: 'rgba(34,197,94,0.12)',
      color: '#16a34a',
      borderColor: 'rgba(34,197,94,0.22)',
    };
  }
  if (result === 'PASS-WARN') {
    return {
      backgroundColor: 'rgba(245,158,11,0.12)',
      color: '#d97706',
      borderColor: 'rgba(245,158,11,0.24)',
    };
  }
  if (result === 'FAIL') {
    return {
      backgroundColor: 'rgba(239,68,68,0.12)',
      color: '#dc2626',
      borderColor: 'rgba(239,68,68,0.24)',
    };
  }
  return {
    backgroundColor: 'rgba(71,85,105,0.12)',
    color: '#475569',
    borderColor: 'rgba(71,85,105,0.24)',
  };
};

const matrixStatusTone = (
  status: ValidationMatrixStatus,
): { backgroundColor: string; color: string; borderColor: string } => {
  if (status === 'passed') {
    return {
      backgroundColor: 'rgba(34,197,94,0.12)',
      color: '#16a34a',
      borderColor: 'rgba(34,197,94,0.22)',
    };
  }
  if (status === 'blocked') {
    return {
      backgroundColor: 'rgba(100,116,139,0.14)',
      color: '#475569',
      borderColor: 'rgba(100,116,139,0.24)',
    };
  }
  if (status === 'running') {
    return {
      backgroundColor: 'rgba(245,158,11,0.12)',
      color: '#d97706',
      borderColor: 'rgba(245,158,11,0.24)',
    };
  }
  return {
    backgroundColor: 'rgba(15,23,42,0.06)',
    color: '#334155',
    borderColor: 'rgba(148,163,184,0.24)',
  };
};

export const ValidationWorkspaceModal = ({
  visible,
  onClose,
  theme,
  insets,
}: ValidationWorkspaceModalProps) => {
  const { t, i18n } = useTranslation();
  const [scenario, setScenario] = useState<ValidationScenario | 'all'>('all');
  const [result, setResult] = useState<ValidationResultCode | 'all'>('all');
  const [query, setQuery] = useState('');
  const [allRecords, setAllRecords] = useState(() => FieldValidationService.list());

  const refreshRecords = () => {
    setAllRecords(FieldValidationService.list());
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SETTINGS_CHANGED_EVENT, () => {
      refreshRecords();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (visible) {
      refreshRecords();
    }
  }, [visible]);

  const records = useMemo(
    () => allRecords.filter(record => {
      if (scenario !== 'all' && record.scenario !== scenario) {
        return false;
      }
      if (result !== 'all' && record.result !== result) {
        return false;
      }
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        record.deviceId,
        record.vendor,
        record.model,
        record.androidVersion,
        record.owner,
        record.notes,
        record.evidencePath,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    }),
    [allRecords, query, result, scenario],
  );
  const summary = useMemo(
    () => FieldValidationService.getWorkspaceSummary(allRecords),
    [allRecords],
  );
  const matrixBoard = useMemo(
    () => ValidationMatrixService.buildBoard(allRecords),
    [allRecords],
  );
  const syncHealth = SyncHealthService.buildSummary(SecureAppSettings.get());

  const getScenarioLabel = (scenarioKey: string) => {
    const passkeyKey = `passkey.validation.scenarios.${scenarioKey}`;
    if (i18n.exists(passkeyKey)) {
      return t(passkeyKey);
    }
    const matrixKey = `validation_workspace.matrix.scenarios.${scenarioKey}`;
    if (i18n.exists(matrixKey)) {
      return t(matrixKey);
    }
    return scenarioKey;
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
              {t('validation_workspace.title')}
            </Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              {t('validation_workspace.subtitle')}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(32, (insets.bottom || 0) + 20),
          }}
        >
          <View style={styles.summaryRow}>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                {t('validation_workspace.metrics.total')}
              </Text>
              <Text style={[styles.metricValue, { color: theme.navy }]}>
                {summary.total}
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                {t('validation_workspace.metrics.devices')}
              </Text>
              <Text style={[styles.metricValue, { color: theme.navy }]}>
                {summary.deviceCount}
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.metricLabel, { color: theme.muted }]}>
                {t('validation_workspace.metrics.matrix_rows')}
              </Text>
              <Text style={[styles.metricValue, { color: theme.navy }]}>
                {matrixBoard.totalRows}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.navy }]}>
              {t('validation_workspace.sync_health.title')}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.muted }]}>
              {t('validation_workspace.sync_health.subtitle')}
            </Text>

            <View style={styles.summaryRow}>
              {[
                {
                  key: 'configured',
                  ready: syncHealth.configured,
                },
                {
                  key: 'certificate_pinned',
                  ready: syncHealth.certificatePinned,
                },
                {
                  key: 'relay_reachable',
                  ready: syncHealth.relayHealthy,
                  pending: syncHealth.relayPending,
                },
                {
                  key: 'sync_validated',
                  ready: syncHealth.syncValidated,
                },
              ].map(item => {
                const tone = item.ready
                  ? matrixStatusTone('passed')
                  : item.pending
                  ? matrixStatusTone('planned')
                  : matrixStatusTone('blocked');
                return (
                  <View
                    key={item.key}
                    style={[
                      styles.resultCard,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.resultCount, { color: tone.color }]}>
                      {item.ready ? 'OK' : item.pending ? '...' : '!!'}
                    </Text>
                    <Text style={[styles.resultLabel, { color: tone.color }]}>
                      {t(`validation_workspace.sync_health.items.${item.key}`)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View
              style={[
                styles.deviceCard,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <Text style={{ color: theme.navy, fontSize: 13, fontWeight: '700' }}>
                {t(`validation_workspace.sync_health.confidence.${syncHealth.confidence}`)}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                {syncHealth.lastCheckAt
                  ? t('validation_workspace.sync_health.last_check', {
                      date: new Date(syncHealth.lastCheckAt).toLocaleString(),
                    })
                  : t('validation_workspace.sync_health.no_check')}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                {syncHealth.lastSuccessAt
                  ? t('validation_workspace.sync_health.last_success', {
                      date: new Date(syncHealth.lastSuccessAt).toLocaleString(),
                    })
                  : t('validation_workspace.sync_health.no_success')}
              </Text>
              {syncHealth.lastError ? (
                <Text style={{ color: theme.navy, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                  {t('validation_workspace.sync_health.last_error', {
                    error: syncHealth.lastError,
                  })}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.navy }]}>
              {t('validation_workspace.matrix.title')}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.muted }]}>
              {t('validation_workspace.matrix.subtitle', {
                devices: matrixBoard.totalDevices,
                rows: matrixBoard.totalRows,
              })}
            </Text>

            <View style={styles.summaryRow}>
              {(['planned', 'running', 'passed', 'blocked'] as const).map(status => {
                const tone = matrixStatusTone(status);
                return (
                  <View
                    key={status}
                    style={[
                      styles.resultCard,
                      {
                        backgroundColor: tone.backgroundColor,
                        borderColor: tone.borderColor,
                      },
                    ]}
                  >
                    <Text style={[styles.resultCount, { color: tone.color }]}>
                      {matrixBoard.totals[status]}
                    </Text>
                    <Text style={[styles.resultLabel, { color: tone.color }]}>
                      {t(`validation_workspace.matrix.status.${status}`)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={{ gap: 10 }}>
              {matrixBoard.deviceGroups.map(group => (
                <View
                  key={group.deviceId}
                  style={[
                    styles.deviceCard,
                    {
                      backgroundColor: theme.inputBg,
                      borderColor: theme.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.recordHeader}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ color: theme.navy, fontSize: 13, fontWeight: '700' }}>
                        {group.vendor} {group.model}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 2 }}>
                        {group.deviceId} • Android {group.androidVersion} •{' '}
                        {t('validation_workspace.records.priority', {
                          priority: group.priority,
                        })}
                      </Text>
                    </View>
                    <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '700' }}>
                      {t('validation_workspace.matrix.completed', {
                        done: group.statusCounts.passed + group.statusCounts.blocked + group.statusCounts.running,
                        total: group.rows.length,
                      })}
                    </Text>
                  </View>

                  <View style={{ gap: 8, marginTop: 10 }}>
                    {group.rows.map(row => {
                      const tone = matrixStatusTone(row.status);
                      return (
                        <View
                          key={`${row.deviceId}_${row.scenario}`}
                          style={styles.matrixRow}
                        >
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={{ color: theme.navy, fontSize: 12, fontWeight: '600' }}>
                              {getScenarioLabel(row.scenario)}
                            </Text>
                            <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, marginTop: 2 }}>
                              {row.latestRecord?.notes
                                ? row.latestRecord.notes
                                : t('validation_workspace.matrix.no_evidence')}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: tone.backgroundColor,
                                borderColor: tone.borderColor,
                              },
                            ]}
                          >
                            <Text style={{ color: tone.color, fontSize: 10, fontWeight: '800' }}>
                              {t(`validation_workspace.matrix.status.${row.status}`)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.navy }]}>
              {t('validation_workspace.filters.title')}
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('validation_workspace.filters.search_placeholder')}
              placeholderTextColor={theme.muted}
              style={[
                styles.searchInput,
                {
                  color: theme.navy,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
            />

            <Text style={[styles.filterLabel, { color: theme.muted }]}>
              {t('validation_workspace.filters.scenario')}
            </Text>
            <View style={styles.chipRow}>
              {(['all', ...PASSKEY_VALIDATION_SCENARIOS] as const).map(value => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setScenario(value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        scenario === value ? theme.sageLight : theme.inputBg,
                      borderColor:
                        scenario === value ? theme.sage : theme.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: scenario === value ? theme.sage : theme.navy,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {value === 'all'
                      ? t('validation_workspace.filters.all')
                      : t(`passkey.validation.scenarios.${value}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterLabel, { color: theme.muted }]}>
              {t('validation_workspace.filters.result')}
            </Text>
            <View style={styles.chipRow}>
              {(['all', ...FIELD_VALIDATION_RESULTS] as const).map(value => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setResult(value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        result === value ? theme.sageLight : theme.inputBg,
                      borderColor:
                        result === value ? theme.sage : theme.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: result === value ? theme.sage : theme.navy,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {value === 'all'
                      ? t('validation_workspace.filters.all')
                      : t(`passkey.validation.results.${value}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.summaryRow}>
            {FIELD_VALIDATION_RESULTS.map(code => {
              const tone = resultTone(code);
              return (
                <View
                  key={code}
                  style={[
                    styles.resultCard,
                    {
                      backgroundColor: tone.backgroundColor,
                      borderColor: tone.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.resultCount, { color: tone.color }]}>
                    {summary.results[code]}
                  </Text>
                  <Text style={[styles.resultLabel, { color: tone.color }]}>
                    {t(`passkey.validation.results.${code}`)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.navy }]}>
              {t('validation_workspace.records.title')}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.muted }]}>
              {summary.latestUpdatedAt
                ? t('validation_workspace.records.updated_at', {
                    date: new Date(summary.latestUpdatedAt).toLocaleString(),
                  })
                : t('validation_workspace.records.empty')}
            </Text>

            {records.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.cardBorder,
                  },
                ]}
              >
                <Text style={{ color: theme.navy, fontSize: 13, fontWeight: '700' }}>
                  {t('validation_workspace.records.empty')}
                </Text>
                <Text
                  style={{
                    color: theme.muted,
                    fontSize: 12,
                    lineHeight: 18,
                    marginTop: 4,
                  }}
                >
                  {t('validation_workspace.records.empty_hint')}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                {records.map(record => {
                  const tone = resultTone(record.result);
                  return (
                    <View
                      key={record.id}
                      style={[
                        styles.recordCard,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: theme.cardBorder,
                        },
                      ]}
                    >
                      <View style={styles.recordHeader}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text
                            style={{
                              color: theme.navy,
                              fontSize: 13,
                              fontWeight: '700',
                            }}
                          >
                            {record.vendor} {record.model}
                          </Text>
                          <Text
                            style={{
                              color: theme.muted,
                              fontSize: 11,
                              lineHeight: 17,
                              marginTop: 2,
                            }}
                          >
                            {record.deviceId} • Android {record.androidVersion || '-'} •{' '}
                            {t(`passkey.validation.scenarios.${record.scenario}`)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor: tone.backgroundColor,
                              borderColor: tone.borderColor,
                            },
                          ]}
                        >
                          <Text style={{ color: tone.color, fontSize: 10, fontWeight: '800' }}>
                            {t(`passkey.validation.results.${record.result}`)}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.metaLine, { color: theme.muted }]}>
                        {t('validation_workspace.records.priority', {
                          priority: record.priority,
                        })}
                        {' • '}
                        {t('validation_workspace.records.owner', {
                          owner: record.owner || '-',
                        })}
                      </Text>
                      <Text style={[styles.metaLine, { color: theme.muted }]}>
                        {t('validation_workspace.records.updated_short', {
                          date: new Date(record.updatedAt).toLocaleString(),
                        })}
                      </Text>
                      {record.evidencePath ? (
                        <Text style={[styles.detailLine, { color: theme.navy }]}>
                          {t('validation_workspace.records.evidence', {
                            path: record.evidencePath,
                          })}
                        </Text>
                      ) : null}
                      {record.notes ? (
                        <Text style={[styles.detailLine, { color: theme.navy }]}>
                          {record.notes}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
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
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  metricLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginTop: 12,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultCard: {
    flex: 1,
    minWidth: 72,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  deviceCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  resultCount: {
    fontSize: 18,
    fontWeight: '800',
  },
  resultLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  recordCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  metaLine: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  detailLine: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
