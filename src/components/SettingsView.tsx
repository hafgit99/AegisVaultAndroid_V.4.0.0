/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecurityModule, VaultSettings } from '../SecurityModule';
import { IntegritySignals } from '../IntegrityModule';
import { SecureAppSettings } from '../SecureAppSettings';
import { WearOSModule } from '../WearOSModule';
import { AppMonitoring, CrashReport } from '../AppMonitoring';
import { switchLanguage } from '../i18n';
import { AutofillService } from '../AutofillService';
import { PasskeyBindingService } from '../PasskeyBindingService';
import { ToggleRow } from './FormFields';
import { SecurityHardeningSettings } from './SecurityHardeningSettings';
import { SyncSettings } from './SyncSettings';
import { PasskeySettings } from './PasskeySettings';
import {
  SettingsActionCard,
  SettingsCard,
  SettingsSectionTitle,
} from './settings/SettingsPrimitives';

interface SettingsViewProps {
  theme: any;
  integrity: IntegritySignals | null;
  integrityLoading: boolean;
  settings: VaultSettings;
  onLock: () => void;
  onBackup: () => void;
  onCloud: () => void;
  onSecurityReport: () => void;
  onSharedVaults: () => void;
  onRoadmap: () => void;
  onValidationWorkspace: () => void;
  onPairingWorkspace: () => void;
  openLegal: (type: 'terms' | 'privacy') => void;
  onDonation: () => void;
  onTrash: () => void;
  insets: any;
  onRefresh: () => void;
  styles: any;
}

export const SettingsView = ({
  styles: s,
  ...props
}: SettingsViewProps) => {
  const {
    theme,
    integrity,
    integrityLoading,
    settings: st2,
    onLock,
    onBackup,
    onCloud,
    onSecurityReport,
    onSharedVaults,
    onRoadmap,
    onValidationWorkspace,
    onPairingWorkspace,
    openLegal,
    onDonation,
    onTrash,
    insets,
    onRefresh,
  } = props;

  const { t, i18n } = useTranslation();
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [crashReports, setCrashReports] = useState<CrashReport[]>([]);
  const [crashLoading, setCrashLoading] = useState(false);
  const [bindings, setBindings] = useState<any[]>([]);

  const boolLabel = (value: boolean) =>
    value ? t('settings.integrity.yes') : t('settings.integrity.no');
  const adbLabel = (value: boolean) =>
    value ? t('settings.integrity.on') : t('settings.integrity.off');

  const integrityReasonLabel = (reason: string) => {
    const key = `settings.integrity.reason_${reason}`;
    if (i18n.exists(key)) return t(key);
    if (/exception|error/i.test(reason)) {
      return t('settings.integrity.reason_request_error_detail_hidden');
    }
    return reason;
  };

  const auditEventLabel = (eventType: string) => {
    const key = `settings.audit.events.${eventType}`;
    return i18n.exists(key) ? t(key) : eventType;
  };

  const auditStatusLabel = (status: string) => {
    const key = `settings.audit.status.${status}`;
    return i18n.exists(key) ? t(key) : status;
  };

  const auditDetailsLabel = (ev: any) => {
    if (ev.event_type === 'audit_log_cleared') {
      return '';
    }
    try {
      const d = ev.details ? JSON.parse(ev.details) : {};
      if (ev.event_type === 'vault_unlock' && ev.event_status === 'success') {
        return Number(d.count || 0) > 1
          ? t('settings.audit.compacted_unlock', { count: d.count })
          : '';
      }
      return Object.entries(d)
        .slice(0, 2)
        .map(([k, v]) => `${k}:${String(v)}`)
        .join(' \u2022 ');
    } catch {
      return '';
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    const events = await SecurityModule.getAuditEvents(30);
    setAuditEvents(events);
    setAuditLoading(false);
  };

  const loadCrashReports = async () => {
    setCrashLoading(true);
    const reports = await AppMonitoring.getCrashReports(20);
    setCrashReports(reports);
    setCrashLoading(false);
  };

  const loadPasskeyBindings = async () => {
    const allBindings = await PasskeyBindingService.loadAllBindings(SecurityModule.db);
    setBindings(Object.values(allBindings.bindings));
  };

  useEffect(() => {
    loadAudit();
    loadCrashReports();
    loadPasskeyBindings();
  }, []);

  const upd = async (k: string, v: any) => {
    try {
      await SecureAppSettings.update({ [k]: v }, SecurityModule.db);
      if (
        [
          'darkMode',
          'biometricEnabled',
          'autoLockSeconds',
          'breachCheckEnabled',
          'deviceTrustPolicy',
          'rootDetectionEnabled',
          'rootBlocksVault',
          'degradedDeviceAction',
        ].includes(k)
      ) {
        await SecurityModule.setAppConfigSetting(k, v);
      }
      await loadAudit();
    } catch {
      Alert.alert(t('backup.msg_err'), t('settings.err_save_config'));
    }
  };
  const ALO = [
    { l: t('settings.off'), v: 0 },
    { l: `30 ${t('settings.sec')}`, v: 30 },
    { l: `1 ${t('settings.min')}`, v: 60 },
    { l: `2 ${t('settings.min')}`, v: 120 },
    { l: `5 ${t('settings.min')}`, v: 300 },
    { l: `15 ${t('settings.min')}`, v: 900 },
  ];
  const CLO = [
    { l: t('settings.off'), v: 0 },
    { l: `15 ${t('settings.sec')}`, v: 15 },
    { l: `20 ${t('settings.sec')}`, v: 20 },
    { l: `30 ${t('settings.sec')}`, v: 30 },
    { l: `1 ${t('settings.min')}`, v: 60 },
  ];
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: 20,
        paddingBottom: 100 + (insets?.bottom || 0),
      }}
    >
      <Text style={[s.hdrT, { color: theme.navy }]}>{t('settings.title')}</Text>
      <Text style={[s.hdrS, { color: theme.sage }]}>
        {t('settings.subtitle')}
      </Text>

      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[s.sLbl, { color: theme.navy, fontWeight: '700' }]}>
          {t('lock_screen.choose_lang')}
        </Text>
        <View style={s.chipR}>
          {(['tr', 'en'] as const).map(lang => {
            const selected = i18n.language === lang;
            return (
              <TouchableOpacity
                key={lang}
                onPress={() => switchLanguage(lang)}
                style={[
                  s.oChip,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.cardBorder,
                  },
                  selected && {
                    backgroundColor: theme.sage,
                    borderColor: theme.sage,
                  },
                ]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={lang === 'tr' ? 'T\u00FCrk\u00E7e' : 'English'}
              >
                <Text
                  style={[
                    s.oChipT,
                    { color: theme.navy },
                    selected && { color: '#fff' },
                  ]}
                >
                  {lang === 'tr'
                    ? '\uD83C\uDDF9\uD83C\uDDF7 T\u00FCrk\u00E7e'
                    : '\uD83C\uDDEC\uD83C\uDDE7 English'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Text style={[s.sec, { color: theme.navy }]}>
        {t('settings.security')}
      </Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <ToggleRow
          label={t('settings.security.biometric')}
          value={st2.biometricEnabled}
          onToggle={(v: boolean) => upd('biometricEnabled', v)}
          theme={theme}
        />
      </View>

      <SecurityHardeningSettings
        theme={theme}
        policy={st2.deviceTrustPolicy}
        onUpdate={upd}
      />

      <SettingsSectionTitle styles={s} theme={theme}>
        {t('settings.autofill.title')}
      </SettingsSectionTitle>
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('settings.autofill.enable')}
        description={t('settings.autofill.enable_desc')}
        onPress={() => AutofillService.openSettings()}
        accessibilityLabel={t('settings.autofill.enable')}
      />
      <SettingsCard styles={s} theme={theme} backgroundColor={theme.sageLight}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.navy, marginBottom: 8 }}>
          {t('settings.autofill.how_to')}
        </Text>
        <Text style={{ fontSize: 12, color: theme.navy, lineHeight: 19 }}>
          {t('settings.autofill.steps')}
        </Text>
      </SettingsCard>

      <SettingsSectionTitle styles={s} theme={theme}>
        {t('wear_os.title')}
      </SettingsSectionTitle>
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('wear_os.sync')}
        description={t('wear_os.desc')}
        onPress={async () => {
          const allItems = await SecurityModule.getAllItems();
          const ok = await WearOSModule.syncFavoritesToWatch(allItems);
          Alert.alert(
            ok ? t('wear_os.sync_success') : t('wear_os.sync_error'),
            ok ? t('wear_os.security_warning') : t('wear_os.no_watch'),
          );
        }}
        accessibilityLabel={t('wear_os.sync')}
        right={<Text style={{ fontSize: 20 }}>{'\u231A'}</Text>}
      />

      <SettingsSectionTitle styles={s} theme={theme}>
        {t('settings.security')}
      </SettingsSectionTitle>
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('roadmap_center.title')}
        description={t('roadmap_center.subtitle')}
        onPress={onRoadmap}
      />
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('pairing_workspace.title')}
        description={t('pairing_workspace.entrypoint_desc')}
        onPress={onPairingWorkspace}
      />
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('validation_workspace.title')}
        description={t('validation_workspace.entrypoint_desc')}
        onPress={onValidationWorkspace}
      />
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('settings.security_report.title')}
        description={t('settings.security_report.entrypoint_desc')}
        onPress={onSecurityReport}
      />
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('settings.shared_vaults.title')}
        description={t('settings.shared_vaults.desc')}
        onPress={onSharedVaults}
      />
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[s.sLbl, { color: theme.navy, marginBottom: 6 }]}>
          {t('settings.integrity.title')}
        </Text>
        <Text style={[s.sLbl, { color: theme.muted, marginBottom: 10 }]}>
          {integrityLoading
            ? t('settings.integrity.checking')
            : t('settings.integrity.status', {
                level: t(
                  `settings.integrity.level_${integrity?.riskLevel || 'low'}`,
                ),
                score: integrity?.score ?? 100,
              })}
        </Text>
        {!!integrity && !integrityLoading && (
          <>
            <Text style={[s.sLbl, { color: theme.navy }]}>{'\u2022'} {t('settings.integrity.rooted')}: {boolLabel(integrity.rooted)}
            </Text>
            <Text style={[s.sLbl, { color: theme.navy }]}>{'\u2022'} {t('settings.integrity.test_keys')}:{' '}
              {boolLabel(integrity.testKeys)}
            </Text>
            <Text style={[s.sLbl, { color: theme.navy }]}>{'\u2022'} {t('settings.integrity.adb')}: {adbLabel(integrity.adbEnabled)}
            </Text>
            <Text style={[s.sLbl, { color: theme.navy }]}>{'\u2022'} {t('settings.integrity.debug')}:{' '}
              {boolLabel(integrity.debugBuild)}
            </Text>
            <Text style={[s.sLbl, { color: theme.navy }]}>{'\u2022'} {t('settings.integrity.emulator')}:{' '}
              {boolLabel(integrity.emulator)}
            </Text>
            {integrity.reasons?.length > 0 && (
              <Text style={[s.sLbl, { color: theme.muted, marginTop: 8 }]}>
                {t('settings.integrity.reasons')}:{' '}
                {integrity.reasons.map(integrityReasonLabel).join(' \u2022 ')}
              </Text>
            )}
          </>
        )}
      </View>

      <Text style={[s.sec, { color: theme.navy }]}>
        {t('settings.audit.title')}
      </Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text style={[s.sLbl, { color: theme.muted }]}>
            {auditLoading
              ? t('settings.audit.loading')
              : t('settings.audit.count', { count: auditEvents.length })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[
                s.oChip,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={loadAudit}
            >
              <Text style={[s.oChipT, { color: theme.navy }]}>{'\u21BB'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.oChip,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() =>
                Alert.alert(
                  t('settings.audit.clear_title'),
                  t('settings.audit.clear_confirm'),
                  [
                    { text: t('vault.cancel'), style: 'cancel' },
                    {
                      text: t('settings.audit.clear_btn'),
                      style: 'destructive',
                      onPress: async () => {
                        await SecurityModule.clearAuditEvents();
                        await loadAudit();
                      },
                    },
                  ],
                )
              }
            >
              <Text style={[s.oChipT, { color: theme.navy }]}>{'\uD83D\uDDD1\uFE0F'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {auditEvents.length === 0 ? (
          <Text style={[s.sLbl, { color: theme.muted }]}>
            {t('settings.audit.empty')}
          </Text>
        ) : (
          auditEvents.slice(0, 12).map(ev => {
            const detailsText = auditDetailsLabel(ev);

            const statusColor =
              ev.event_status === 'success'
                ? '#16a34a'
                : ev.event_status === 'failed'
                ? '#dc2626'
                : ev.event_status === 'blocked'
                ? '#d97706'
                : '#64748b';

            return (
              <View
                key={ev.id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: theme.cardBorder,
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: statusColor,
                    }}
                  />
                  <Text
                    style={[s.sLbl, { color: theme.navy, fontWeight: '700' }]}
                  >
                    {auditEventLabel(ev.event_type)}
                  </Text>
                  <Text
                    style={[s.sLbl, { color: statusColor, fontWeight: '700' }]}
                  >
                    {auditStatusLabel(ev.event_status)}
                  </Text>
                  <Text style={[s.sLbl, { color: theme.muted }]}>
                    {new Date(ev.created_at).toLocaleString()}
                  </Text>
                </View>
                {detailsText ? (
                  <Text
                    style={[
                      s.sLbl,
                      { color: theme.muted, marginTop: 4, lineHeight: 17 },
                    ]}
                  >
                    {detailsText}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      <Text style={[s.sec, { color: theme.navy }]}>
        {t('settings.crash_monitoring.title')}
      </Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text style={[s.sLbl, { color: theme.muted }]}>
            {crashLoading
              ? t('settings.crash_monitoring.loading')
              : t('settings.crash_monitoring.count', {
                  count: crashReports.length,
                })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[
                s.oChip,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={loadCrashReports}
            >
              <Text style={[s.oChipT, { color: theme.navy }]}>{'\u21BB'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.oChip,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              onPress={() =>
                Alert.alert(
                  t('settings.crash_monitoring.clear_title'),
                  t('settings.crash_monitoring.clear_confirm'),
                  [
                    { text: t('vault.cancel'), style: 'cancel' },
                    {
                      text: t('settings.crash_monitoring.clear_btn'),
                      style: 'destructive',
                      onPress: async () => {
                        await AppMonitoring.clearCrashReports();
                        await loadCrashReports();
                      },
                    },
                  ],
                )
              }
            >
              <Text style={[s.oChipT, { color: theme.navy }]}>{'\uD83D\uDDD1\uFE0F'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {crashReports.length === 0 ? (
          <Text style={[s.sLbl, { color: theme.muted }]}>
            {t('settings.crash_monitoring.empty')}
          </Text>
        ) : (
          crashReports.slice(0, 8).map(report => (
            <View
              key={report.id}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.cardBorder,
                paddingTop: 8,
                marginTop: 8,
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
                  style={[s.sLbl, { color: theme.navy, fontWeight: '700', flex: 1 }]}
                >
                  {report.name}
                </Text>
                <Text
                  style={[
                    s.sLbl,
                    {
                      color: report.isFatal ? '#dc2626' : '#d97706',
                      fontWeight: '700',
                    },
                  ]}
                >
                  {report.isFatal
                    ? t('settings.crash_monitoring.fatal')
                    : t('settings.crash_monitoring.nonfatal')}
                </Text>
              </View>
              <Text style={[s.sLbl, { color: theme.muted }]}>
                {report.source} {'\u2022'} {new Date(report.createdAt).toLocaleString()}
              </Text>
              <Text
                style={[
                  s.sLbl,
                  { color: theme.navy, marginBottom: 0, lineHeight: 17 },
                ]}
                numberOfLines={3}
              >
                {report.message}
              </Text>
            </View>
          ))
        )}
      </View>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
        >
          <ToggleRow
            label={t('settings.breach_check.title')}
            value={Boolean(st2.breachCheckEnabled)}
            onToggle={(v: boolean) => upd('breachCheckEnabled', v)}
            theme={theme}
          />
          <Text style={[s.sLbl, { color: theme.muted, marginBottom: 0 }]}>
            {t('settings.breach_check.desc')}
          </Text>
        </View>
        <View
          style={[
            s.sCard,
            { backgroundColor: theme.card, borderColor: theme.cardBorder },
          ]}
        >
          <ToggleRow
            label={t('settings.bio_login')}
            value={st2.biometricEnabled}
            onToggle={(v: boolean) => upd('biometricEnabled', v)}
            theme={theme}
          />
      </View>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <ToggleRow
          label={t('settings.dark_mode')}
          value={st2.darkMode}
          onToggle={(v: boolean) => upd('darkMode', v)}
          theme={theme}
        />
      </View>
      <Text style={[s.sec, { color: theme.navy }]}>
        {t('settings.auto_lock')}
      </Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[s.sLbl, { color: theme.navy }]}>
          {t('settings.auto_lock_desc')}
        </Text>
        <View style={s.chipR}>
          {ALO.map(o => (
            <TouchableOpacity
              key={o.v}
              style={[
                s.oChip,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
                st2.autoLockSeconds === o.v && {
                  backgroundColor: theme.sage,
                  borderColor: theme.sage,
                },
              ]}
              onPress={() => upd('autoLockSeconds', o.v)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.oChipT,
                  { color: theme.navy },
                  st2.autoLockSeconds === o.v && { color: '#fff' },
                ]}
              >
                {o.l}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={[s.sec, { color: theme.navy }]}>
        {t('settings.clipboard_clear')}
      </Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[s.sLbl, { color: theme.navy }]}>
          {t('settings.clipboard_clear_desc')}
        </Text>
        <View style={s.chipR}>
          {CLO.map(o => (
            <TouchableOpacity
              key={o.v}
              style={[
                s.oChip,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
                st2.clipboardClearSeconds === o.v && {
                  backgroundColor: theme.sage,
                  borderColor: theme.sage,
                },
              ]}
              onPress={() => upd('clipboardClearSeconds', o.v)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  s.oChipT,
                  st2.clipboardClearSeconds === o.v && { color: '#fff' },
                  { color: theme.navy },
                ]}
              >
                {o.l}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={[s.sec, { color: theme.navy }]}>
        {t('settings.default_length')}
      </Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[s.sLbl, { color: theme.navy }]}>
          {t('settings.default_length_desc', { length: st2.passwordLength })}
        </Text>
        <View style={s.sliderR}>
          <TouchableOpacity
            onPress={() =>
              upd('passwordLength', Math.max(8, st2.passwordLength - 2))
            }
            style={[s.sliderB, { backgroundColor: theme.sageLight }]}
          >
            <Text style={[s.sliderBT, { color: theme.sage }]}>{'\u2212'}</Text>
          </TouchableOpacity>
          <View style={[s.sliderTr, { backgroundColor: theme.divider }]}>
            <View
              style={[
                s.sliderFl,
                {
                  width: `${((st2.passwordLength - 8) / 56) * 100}%`,
                  backgroundColor: theme.sage,
                },
              ]}
            />
          </View>
          <TouchableOpacity
            onPress={() =>
              upd('passwordLength', Math.min(64, st2.passwordLength + 2))
            }
            style={[s.sliderB, { backgroundColor: theme.sageLight }]}
          >
            <Text style={[s.sliderBT, { color: theme.sage }]}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <ToggleRow
          label={t('settings.exclude_ambiguous')}
          value={Boolean(st2.excludeAmbiguousCharacters)}
          onToggle={(v: boolean) => upd('excludeAmbiguousCharacters', v)}
          theme={theme}
        />
        <Text style={[s.sLbl, { color: theme.muted }]}>
          {t('settings.exclude_ambiguous_desc')}
        </Text>
      </View>
      <SettingsSectionTitle styles={s} theme={theme}>
        {t('settings.backup')}
      </SettingsSectionTitle>
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('settings.import_export')}
        description={t('settings.import_export_desc')}
        onPress={onBackup}
      />

      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('settings.cloud')}
        description={t('settings.cloud_desc')}
        onPress={onCloud}
      />

      <SyncSettings theme={theme} />
      <PasskeySettings theme={theme} bindings={bindings} onRefresh={loadPasskeyBindings} />

      <SettingsSectionTitle styles={s} theme={theme}>
        {t('trash.title')}
      </SettingsSectionTitle>
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('trash.subtitle')}
        onPress={onTrash}
      />

      <SettingsSectionTitle styles={s} theme={theme}>
        {t('donation.title')}
      </SettingsSectionTitle>
      <SettingsActionCard
        styles={s}
        theme={theme}
        title={t('donation.subtitle')}
        description={t('donation.description')}
        onPress={onDonation}
      />

      <Text style={[s.sec, { color: theme.navy }]}>{t('settings.about')}</Text>
      <View
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[s.sLbl, { color: theme.muted }]}>
          {t('settings.about_desc')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => openLegal('terms')}
            activeOpacity={0.7}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: theme.sage }}
            >
              {t('legal.terms')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openLegal('privacy')}
            activeOpacity={0.7}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: theme.sage }}
            >
              {t('legal.privacy')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[s.sec, { color: theme.navy }]}>
        {'\u26A0\uFE0F'} {t('reset.vault_title')}
      </Text>
      <TouchableOpacity
        style={[
          s.sCard,
          { backgroundColor: theme.card, borderColor: 'rgba(239,68,68,0.35)' },
        ]}
        onPress={() => {
          Alert.alert(t('reset.vault_title'), t('reset.vault_confirm'), [
            { text: t('vault.cancel'), style: 'cancel' },
            {
              text: t('vault.delete'),
              style: 'destructive',
              onPress: async () => {
                await SecurityModule.resetVault();
                Alert.alert(t('reset.success'));
                onRefresh();
              },
            },
          ]);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('reset.factory_title')}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.red }}>
          {t('reset.vault_title')}
        </Text>
        <Text style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
          {t('reset.vault_desc')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          s.sCard,
          { backgroundColor: theme.redBg, borderColor: theme.red },
        ]}
        onPress={() => {
          Alert.alert(t('reset.factory_title'), t('reset.factory_confirm'), [
            { text: t('vault.cancel'), style: 'cancel' },
            {
              text: t('reset.factory_title'),
              style: 'destructive',
              onPress: async () => {
                await SecurityModule.factoryReset();
                Alert.alert(t('reset.factory_success'));
              },
            },
          ]);
        }}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.red }}>
          {t('reset.factory_title')}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: theme.navy,
            opacity: 0.75,
            marginTop: 4,
          }}
        >
          {t('reset.factory_desc')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          s.sCard,
          { backgroundColor: theme.redBg, borderColor: theme.red },
        ]}
        onPress={() => {
          Alert.alert(t('reset.panic_title'), t('reset.panic_confirm'), [
            { text: t('vault.cancel'), style: 'cancel' },
            {
              text: t('reset.panic_title'),
              style: 'destructive',
              onPress: async () => {
                await SecurityModule.panicWipe();
                Alert.alert(t('reset.panic_success'));
              },
            },
          ]);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('reset.panic_title')}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.red }}>
          {t('reset.panic_title')}
        </Text>
        <Text style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
          {t('reset.panic_desc')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          s.lockBtn,
          { backgroundColor: theme.redBg, borderColor: theme.red },
        ]}
        onPress={onLock}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('settings.lock_vault')}
      >
        <Text style={[s.lockBtnT, { color: theme.red }]}>
          {t('settings.lock_vault')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
