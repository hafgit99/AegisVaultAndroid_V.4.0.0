import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AccountHardeningCheck,
  PasswordHealthIssue,
  PasswordHealthReport,
  SecurityModule,
} from '../SecurityModule';
import { useTranslation } from 'react-i18next';

type ThemeShape = {
  bg: string;
  navy: string;
  sage: string;
  sageLight: string;
  sageMid?: string;
  card: string;
  cardBorder: string;
  muted: string;
  inputBg: string;
  red?: string;
  white?: string;
};

interface SecurityReportModalProps {
  visible: boolean;
  onClose: () => void;
  theme: ThemeShape;
  onOpenItem?: (itemId: number) => void | Promise<void>;
}

const riskColor = (level: PasswordHealthReport['riskLevel']) =>
  ({
    critical: '#dc2626',
    high: '#f59e0b',
    medium: '#d97706',
    low: '#16a34a',
  })[level];

const severityColor = (severity: PasswordHealthIssue['severity']) =>
  ({
    critical: '#dc2626',
    high: '#f97316',
    medium: '#d97706',
  })[severity];

const hardeningSeverityColor = (severity: AccountHardeningCheck['severity']) =>
  ({
    critical: '#dc2626',
    high: '#f97316',
    medium: '#d97706',
  })[severity];

export const SecurityReportModal = ({
  visible,
  onClose,
  theme,
  onOpenItem,
}: SecurityReportModalProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PasswordHealthReport | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const nextReport = await SecurityModule.getPasswordHealthReport();
      setReport(nextReport);
      await SecurityModule.logSecurityEvent(
        'password_health_report_viewed',
        'info',
        {
          score: nextReport.score,
          riskLevel: nextReport.riskLevel,
          issueCount: nextReport.issues.length,
        },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadReport();
    }
  }, [visible, loadReport]);

  const openItem = async (itemId: number) => {
    if (!onOpenItem) return;
    await onOpenItem(itemId);
    onClose();
  };

  const summaryCards = report
    ? [
        {
          label: t('settings.security_report.summary.reused'),
          value: report.summary.reusedCount,
          color: '#dc2626',
        },
        {
          label: t('settings.security_report.summary.weak'),
          value: report.summary.weakCount,
          color: '#f97316',
        },
        {
          label: t('settings.security_report.summary.similar'),
          value: report.summary.similarCount,
          color: '#d97706',
        },
        {
          label: t('settings.security_report.summary.incomplete'),
          value: report.summary.emptyOrIncompleteCount,
          color: '#64748b',
        },
      ]
    : [];

  const localizedActions = report
    ? [
        report.summary.reusedCount > 0
          ? t('settings.security_report.action.reused')
          : null,
        report.summary.emptyOrIncompleteCount > 0
          ? t('settings.security_report.action.incomplete')
          : null,
        report.summary.weakCount > 0
          ? t('settings.security_report.action.weak')
          : null,
        report.summary.similarCount > 0
          ? t('settings.security_report.action.similar')
          : null,
      ].filter(Boolean)
    : [];

  const hardeningSummaryCards = report
    ? [
        {
          label: t('settings.security_report.hardening.summary.totp'),
          value: report.hardening.summary.totpProtectedCount,
          color: '#16a34a',
        },
        {
          label: t('settings.security_report.hardening.summary.passkey'),
          value: report.hardening.summary.passkeyProtectedCount,
          color: '#0f766e',
        },
        {
          label: t('settings.security_report.hardening.summary.missing_2fa'),
          value: report.hardening.summary.missing2FACount,
          color: '#dc2626',
        },
        {
          label: t('settings.security_report.hardening.summary.stale'),
          value: report.hardening.summary.staleSecretCount,
          color: '#d97706',
        },
      ]
    : [];

  const localizedHardeningActions = report
    ? [
        report.hardening.summary.missing2FACount > 0
          ? t('settings.security_report.hardening.action.missing_2fa')
          : null,
        report.hardening.summary.staleSecretCount > 0
          ? t('settings.security_report.hardening.action.stale_secret')
          : null,
        report.hardening.summary.incompleteLoginCount > 0
          ? t('settings.security_report.hardening.action.missing_identity')
          : null,
      ].filter(Boolean)
    : [];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: theme.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 24,
            maxHeight: '92%',
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text
                style={{ fontSize: 20, fontWeight: '800', color: theme.navy }}
              >
                {t('settings.security_report.title')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.muted,
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                {t('settings.security_report.subtitle')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={{ fontSize: 22, color: theme.muted, padding: 4 }}>
                ×
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? (
              <View
                style={{
                  backgroundColor: theme.card,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  padding: 24,
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <ActivityIndicator color={theme.sage} />
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  {t('settings.security_report.loading')}
                </Text>
              </View>
            ) : report ? (
              <>
                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    padding: 20,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.muted,
                      fontSize: 12,
                      fontWeight: '700',
                      marginBottom: 8,
                    }}
                  >
                    {t('settings.security_report.score_label')}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 40,
                        fontWeight: '800',
                        color: riskColor(report.riskLevel),
                        lineHeight: 44,
                      }}
                    >
                      {report.score}
                    </Text>
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 15,
                        marginBottom: 6,
                      }}
                    >
                      /100
                    </Text>
                  </View>
                  <Text
                    style={{
                      marginTop: 8,
                      fontSize: 14,
                      fontWeight: '700',
                      color: riskColor(report.riskLevel),
                    }}
                  >
                    {t(`settings.security_report.risk.${report.riskLevel}`)}
                  </Text>
                  <Text
                    style={{
                      color: theme.muted,
                      fontSize: 12,
                      marginTop: 6,
                      lineHeight: 18,
                    }}
                  >
                    {t('settings.security_report.checked', {
                      checked: report.summary.checkedSecrets,
                      total: report.summary.totalItems,
                    })}
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    padding: 20,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.muted,
                      fontSize: 12,
                      fontWeight: '700',
                      marginBottom: 8,
                    }}
                  >
                    {t('settings.security_report.hardening.title')}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 34,
                        fontWeight: '800',
                        color: riskColor(report.hardening.riskLevel),
                        lineHeight: 38,
                      }}
                    >
                      {report.hardening.score}
                    </Text>
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 15,
                        marginBottom: 6,
                      }}
                    >
                      /100
                    </Text>
                  </View>
                  <Text
                    style={{
                      marginTop: 8,
                      fontSize: 14,
                      fontWeight: '700',
                      color: riskColor(report.hardening.riskLevel),
                    }}
                  >
                    {t(
                      `settings.security_report.risk.${report.hardening.riskLevel}`,
                    )}
                  </Text>
                  <Text
                    style={{
                      color: theme.muted,
                      fontSize: 12,
                      marginTop: 6,
                      lineHeight: 18,
                    }}
                  >
                    {t('settings.security_report.hardening.checked', {
                      count: report.hardening.summary.loginItems,
                    })}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  {summaryCards.map(card => (
                    <View
                      key={card.label}
                      style={{
                        width: '47%',
                        backgroundColor: theme.card,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: theme.cardBorder,
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          color: card.color,
                          fontSize: 22,
                          fontWeight: '800',
                        }}
                      >
                        {card.value}
                      </Text>
                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 12,
                          marginTop: 4,
                          lineHeight: 16,
                        }}
                      >
                        {card.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  {hardeningSummaryCards.map(card => (
                    <View
                      key={card.label}
                      style={{
                        width: '47%',
                        backgroundColor: theme.card,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: theme.cardBorder,
                        padding: 14,
                      }}
                    >
                      <Text
                        style={{
                          color: card.color,
                          fontSize: 22,
                          fontWeight: '800',
                        }}
                      >
                        {card.value}
                      </Text>
                      <Text
                        style={{
                          color: theme.muted,
                          fontSize: 12,
                          marginTop: 4,
                          lineHeight: 16,
                        }}
                      >
                        {card.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    padding: 18,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.navy,
                      fontSize: 14,
                      fontWeight: '700',
                      marginBottom: 10,
                    }}
                  >
                    {t('settings.security_report.actions_title')}
                  </Text>
                  {(localizedActions.length > 0
                    ? localizedActions
                    : [t('settings.security_report.action.healthy')]).map(
                    action => (
                    <Text
                      key={action}
                      style={{
                        color: theme.navy,
                        fontSize: 13,
                        lineHeight: 19,
                        marginBottom: 8,
                      }}
                    >
                      • {action}
                    </Text>
                    ),
                  )}
                </View>

                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    padding: 18,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.navy,
                        fontSize: 14,
                        fontWeight: '700',
                      }}
                    >
                      {t('settings.security_report.issues_title', {
                        count: report.issues.length,
                      })}
                    </Text>
                    <TouchableOpacity onPress={loadReport} activeOpacity={0.7}>
                      <Text
                        style={{
                          color: theme.sage,
                          fontSize: 12,
                          fontWeight: '700',
                        }}
                      >
                        {t('settings.security_report.refresh')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {report.issues.length === 0 ? (
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {t('settings.security_report.no_issues')}
                    </Text>
                  ) : (
                    report.issues.slice(0, 20).map((issue, index) => (
                      <TouchableOpacity
                        key={`${issue.itemId}-${issue.field}-${issue.type}-${index}`}
                        activeOpacity={onOpenItem ? 0.7 : 1}
                        onPress={() => openItem(issue.itemId)}
                        style={{
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderTopColor: theme.cardBorder,
                          paddingTop: index === 0 ? 0 : 12,
                          marginTop: index === 0 ? 0 : 12,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.navy,
                              fontSize: 13,
                              fontWeight: '700',
                              flex: 1,
                            }}
                          >
                            {issue.title}
                          </Text>
                          <Text
                            style={{
                              color: severityColor(issue.severity),
                              fontSize: 11,
                              fontWeight: '800',
                            }}
                          >
                            {t(
                              `settings.security_report.severity.${issue.severity}`,
                            )}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: theme.muted,
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          {t(`vault.categories.${issue.category}`)} •{' '}
                          {t(`settings.security_report.field.${issue.field}`)}{' '}
                          •{' '}
                          {t(`settings.security_report.issue_type.${issue.type}`)}
                        </Text>
                        <Text
                          style={{
                            color: theme.navy,
                            fontSize: 13,
                            lineHeight: 18,
                            marginTop: 8,
                          }}
                        >
                          {t(`settings.security_report.issue_message.${issue.type}`)}
                        </Text>
                        {onOpenItem ? (
                          <Text
                            style={{
                              color: theme.sage,
                              fontSize: 12,
                              fontWeight: '700',
                              marginTop: 8,
                            }}
                          >
                            {t('settings.security_report.open_item')}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ))
                  )}
                </View>

                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    padding: 18,
                    marginTop: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.navy,
                      fontSize: 14,
                      fontWeight: '700',
                      marginBottom: 10,
                    }}
                  >
                    {t('settings.security_report.hardening.actions_title')}
                  </Text>
                  {(localizedHardeningActions.length > 0
                    ? localizedHardeningActions
                    : [t('settings.security_report.hardening.action.healthy')]).map(
                    action => (
                      <Text
                        key={action}
                        style={{
                          color: theme.navy,
                          fontSize: 13,
                          lineHeight: 19,
                          marginBottom: 8,
                        }}
                      >
                        • {action}
                      </Text>
                    ),
                  )}
                </View>

                <View
                  style={{
                    backgroundColor: theme.card,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    padding: 18,
                    marginTop: 12,
                  }}
                >
                  <Text
                    style={{
                      color: theme.navy,
                      fontSize: 14,
                      fontWeight: '700',
                      marginBottom: 12,
                    }}
                  >
                    {t('settings.security_report.hardening.issues_title', {
                      count: report.hardening.checks.length,
                    })}
                  </Text>
                  {report.hardening.checks.length === 0 ? (
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {t('settings.security_report.hardening.no_issues')}
                    </Text>
                  ) : (
                    report.hardening.checks.slice(0, 20).map((check, index) => (
                      <TouchableOpacity
                        key={`${check.itemId}-${check.type}-${index}`}
                        activeOpacity={onOpenItem ? 0.7 : 1}
                        onPress={() => openItem(check.itemId)}
                        style={{
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderTopColor: theme.cardBorder,
                          paddingTop: index === 0 ? 0 : 12,
                          marginTop: index === 0 ? 0 : 12,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.navy,
                              fontSize: 13,
                              fontWeight: '700',
                              flex: 1,
                            }}
                          >
                            {check.title}
                          </Text>
                          <Text
                            style={{
                              color: hardeningSeverityColor(check.severity),
                              fontSize: 11,
                              fontWeight: '800',
                            }}
                          >
                            {t(
                              `settings.security_report.severity.${check.severity}`,
                            )}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: theme.muted,
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          {t(`vault.categories.${check.category}`)} •{' '}
                          {t(
                            `settings.security_report.hardening.type.${check.type}`,
                          )}
                        </Text>
                        <Text
                          style={{
                            color: theme.navy,
                            fontSize: 13,
                            lineHeight: 18,
                            marginTop: 8,
                          }}
                        >
                          {t(
                            `settings.security_report.hardening.message.${check.type}`,
                          )}
                        </Text>
                        {onOpenItem ? (
                          <Text
                            style={{
                              color: theme.sage,
                              fontSize: 12,
                              fontWeight: '700',
                              marginTop: 8,
                            }}
                          >
                            {t('settings.security_report.open_item')}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
