import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  FIELD_VALIDATION_RESULTS,
  FieldValidationService,
} from '../../FieldValidationService';
import { formatPasskeyBackendError } from '../../PasskeyErrorMapper';
import { PasskeyModule } from '../../PasskeyModule';
import { PasskeyReadinessService } from '../../PasskeyReadinessService';
import { PasskeyRpApi } from '../../PasskeyRpApi';
import { PasskeyRpService } from '../../PasskeyRpService';
import { SecureAppSettings } from '../../SecureAppSettings';
import { SecurityModule } from '../../SecurityModule';
import { Field, SelectChips } from '../FormFields';

const PASSKEY_TRANSPORTS = [
  { id: 'internal', label: 'Internal (Platform)' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'usb', label: 'USB' },
  { id: 'nfc', label: 'NFC' },
  { id: 'ble', label: 'BLE' },
];

// Passkey Form
export const PasskeyForm = ({ form, setForm, t, theme }: any) => {
  const [importJson, setImportJson] = useState('');
  const [working, setWorking] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState<boolean | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(false);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [validationSaving, setValidationSaving] = useState(false);
  const [validationDraft, setValidationDraft] = useState(() =>
    FieldValidationService.createDraft(),
  );
  const [validationRecords, setValidationRecords] = useState(() =>
    FieldValidationService.list().slice(0, 3),
  );
  const backendSummary = PasskeyRpService.getConfigurationSummary();
  const cc = {
    navy: theme?.navy || '#101828',
    sage: theme?.sage || '#72886f',
    sageLight: theme?.sageLight || 'rgba(114,136,111,0.12)',
    muted: theme?.muted || 'rgba(16,24,40,0.45)',
    inputBg: theme?.inputBg || 'rgba(255,255,255,0.7)',
    cardBorder: theme?.cardBorder || 'rgba(255,255,255,0.55)',
  };
  useEffect(() => {
    let mounted = true;

    PasskeyModule.isAvailable()
      .then((available) => {
        if (mounted) {
          setNativeAvailable(available);
        }
      })
      .catch(() => {
        if (mounted) {
          setNativeAvailable(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setBackendReachable(null);
  }, [backendSummary.baseUrl, backendSummary.accountId]);

  useEffect(() => {
    const latestRecord = FieldValidationService.list()[0];
    if (!latestRecord) {
      return;
    }
    setValidationDraft(current => ({
      ...current,
      priority: current.priority || latestRecord.priority,
      deviceId: current.deviceId || latestRecord.deviceId,
      vendor: current.vendor || latestRecord.vendor,
      model: current.model || latestRecord.model,
      androidVersion: current.androidVersion || latestRecord.androidVersion,
      owner: current.owner || latestRecord.owner || '',
    }));
  }, []);

  const updatePasskey = (patch: any) =>
    setForm({ ...form, data: { ...form.data, ...patch } });

  const getPasskeyStatusText = () => {
    const mode =
      form.data?.mode === 'rp_connected'
        ? t('passkey.mode_rp_connected')
        : t('passkey.mode_local_helper');
    const challengeSource =
      form.data?.challenge_source === 'server'
        ? t('passkey.challenge_server')
        : t('passkey.challenge_local_helper');
    const verified = form.data?.server_verified
      ? t('passkey.verified_yes')
      : t('passkey.verified_no');

    return [
      `${t('passkey.mode_label')}: ${mode}`,
      `${t('passkey.challenge_source_label')}: ${challengeSource}`,
      `${t('passkey.server_verified_label')}: ${verified}`,
    ].join('\n');
  };

  const refreshValidationRecords = () => {
    setValidationRecords(FieldValidationService.list().slice(0, 3));
  };

  const stageValidationCapture = (
    scenario: 'passkey_create' | 'passkey_auth' | 'passkey_prereq_failure',
    result: 'PASS' | 'PASS-WARN' | 'FAIL' | 'BLOCKED',
    notes?: string,
  ) => {
    setValidationDraft(current => ({
      ...current,
      scenario,
      result,
      notes: notes || current.notes || '',
    }));
  };

  const autofillRpId = () => {
    const rpId = SecurityModule.normalizePasskeyRpId(form.url, form.data?.rp_id);
    updatePasskey({
      rp_id: rpId,
      display_name:
        form.data?.display_name || form.username || rpId || 'Device passkey',
    });
  };

  const generateIds = () => {
    const generated = SecurityModule.generatePasskeyData({
      username: form.username,
      url: form.url,
      rpId: form.data?.rp_id,
      displayName: form.data?.display_name,
    });
    updatePasskey({
      ...generated,
      mode: 'local_helper',
      challenge_source: 'local_helper',
      server_verified: false,
    });
  };

  const importPayload = () => {
    const parsed = SecurityModule.parsePasskeyPayload(importJson, {
      url: form.url,
      rpId: form.data?.rp_id,
      username: form.username,
    });
    if (!parsed.valid) {
      Alert.alert(t('passkey.import_title'), parsed.errors.join('\n'));
      return;
    }
    setForm({
      ...form,
      data: {
        ...form.data,
        ...parsed.normalized,
        mode: parsed.normalized.mode || 'local_helper',
        challenge_source: parsed.normalized.challenge_source || 'local_helper',
        server_verified: Boolean(parsed.normalized.server_verified),
      },
      url: form.url || !parsed.normalized.rp_id
        ? form.url
        : `https://${parsed.normalized.rp_id}`,
    });
    setImportJson('');
    Alert.alert(t('backup.success'), t('passkey.import_success'));
  };

  const ensureNativeAvailable = () => {
    if (nativeAvailable) {
      return true;
    }

    Alert.alert(
      t('passkey.native_unavailable_title'),
      t('passkey.native_unavailable_message'),
    );
    return false;
  };

  const createOnDevice = async () => {
    if (!ensureNativeAvailable()) {
      return;
    }
    if (!form.username || !(form.url || form.data?.rp_id)) {
      stageValidationCapture(
        'passkey_prereq_failure',
        'BLOCKED',
        t('passkey.validation.capture_notes.prereq_missing'),
      );
      Alert.alert(
        t('passkey.native_create_title'),
        t('passkey.create_prereq'),
      );
      return;
    }

    try {
      setWorking(true);
      const requestJson = PasskeyModule.buildRegistrationRequest({
        title: form.title,
        username: form.username,
        url: form.url,
        rpId: form.data?.rp_id,
        displayName: form.data?.display_name,
        userHandle: form.data?.user_handle,
      });
      const result = await PasskeyModule.createPasskey(requestJson);
      const parsed = SecurityModule.parsePasskeyPayload(
        result.registrationResponseJson,
        {
          url: form.url,
          rpId: form.data?.rp_id,
          username: form.username,
        },
      );
      if (!parsed.normalized.credential_id) {
        Alert.alert(
          t('passkey.native_create_title'),
          t('passkey.native_create_failed'),
        );
        return;
      }

      const validation = SecurityModule.validatePasskeyItem({
        ...form,
        category: 'passkey',
        data: {
          ...form.data,
          ...parsed.normalized,
        },
      });
      if (!validation.valid) {
        Alert.alert(
          t('passkey.validation_title'),
          validation.errors.join('\n'),
        );
        return;
      }
      setForm({
        ...form,
        data: {
          ...form.data,
          ...validation.normalized,
          registration_response_json: result.registrationResponseJson,
          mode: 'local_helper',
          challenge_source: 'local_helper',
          server_verified: false,
          last_registration_at: new Date().toISOString(),
        },
      });
      stageValidationCapture(
        'passkey_create',
        'PASS',
        t('passkey.validation.capture_notes.native_create_success'),
      );
      Alert.alert(t('backup.success'), t('passkey.native_create_success'));
    } catch (error: any) {
      stageValidationCapture(
        'passkey_create',
        'FAIL',
        error?.message || t('passkey.native_create_failed'),
      );
      Alert.alert(
        t('passkey.native_create_title'),
        error?.message || t('passkey.native_create_failed'),
      );
    } finally {
      setWorking(false);
    }
  };

  const authenticateOnDevice = async () => {
    if (!ensureNativeAvailable()) {
      return;
    }
    if (!form.data?.credential_id) {
      stageValidationCapture(
        'passkey_prereq_failure',
        'BLOCKED',
        t('passkey.validation.capture_notes.credential_missing'),
      );
      Alert.alert(t('passkey.native_auth_title'), t('passkey.auth_prereq'));
      return;
    }

    try {
      setWorking(true);
      const requestJson = PasskeyModule.buildAuthenticationRequest({
        url: form.url,
        rpId: form.data?.rp_id,
        credentialId: form.data?.credential_id,
        transport: form.data?.transport,
      });
      const result = await PasskeyModule.authenticatePasskey(requestJson);
      updatePasskey({
        authentication_response_json: result.authenticationResponseJson,
        mode: form.data?.mode === 'rp_connected' ? 'rp_connected' : 'local_helper',
        challenge_source:
          form.data?.challenge_source === 'server' ? 'server' : 'local_helper',
        server_verified: Boolean(form.data?.server_verified),
        last_auth_at: new Date().toISOString(),
      });
      stageValidationCapture(
        'passkey_auth',
        'PASS',
        t('passkey.validation.capture_notes.native_auth_success'),
      );
      Alert.alert(t('backup.success'), t('passkey.native_auth_success'));
    } catch (error: any) {
      stageValidationCapture(
        'passkey_auth',
        'FAIL',
        error?.message || t('passkey.native_auth_failed'),
      );
      Alert.alert(
        t('passkey.native_auth_title'),
        error?.message || t('passkey.native_auth_failed'),
      );
    } finally {
      setWorking(false);
    }
  };

  const createWithBackend = async () => {
    if (!ensureNativeAvailable()) {
      return;
    }
    if (!form.username || !(form.url || form.data?.rp_id)) {
      stageValidationCapture(
        'passkey_prereq_failure',
        'BLOCKED',
        t('passkey.validation.capture_notes.prereq_missing'),
      );
      Alert.alert(
        t('passkey.backend_create_title'),
        t('passkey.create_prereq'),
      );
      return;
    }

    try {
      setWorking(true);
      const result = await PasskeyRpService.enrollWithBackend({
        title: form.title,
        username: form.username,
        url: form.url,
        rpId: form.data?.rp_id,
        displayName: form.data?.display_name,
      });
      setForm({
        ...form,
        url: form.url || `https://${result.dataPatch.rp_id}`,
        data: {
          ...form.data,
          ...result.dataPatch,
        },
      });
      stageValidationCapture(
        'passkey_create',
        'PASS',
        t('passkey.validation.capture_notes.backend_create_success'),
      );
      Alert.alert(t('backup.success'), t('passkey.backend_create_success'));
    } catch (error: any) {
      const message = formatPasskeyBackendError(error, t);
      stageValidationCapture('passkey_create', 'FAIL', message);
      Alert.alert(
        t('passkey.backend_create_title'),
        message,
      );
    } finally {
      setWorking(false);
    }
  };

  const authenticateWithBackend = async () => {
    if (!ensureNativeAvailable()) {
      return;
    }
    if (!form.data?.credential_id) {
      stageValidationCapture(
        'passkey_prereq_failure',
        'BLOCKED',
        t('passkey.validation.capture_notes.credential_missing'),
      );
      Alert.alert(t('passkey.backend_auth_title'), t('passkey.auth_prereq'));
      return;
    }

    try {
      setWorking(true);
      const result = await PasskeyRpService.authenticateWithBackend({
        url: form.url,
        rpId: form.data?.rp_id,
        credentialId: form.data?.credential_id,
        transport: form.data?.transport,
      });
      updatePasskey(result.dataPatch);
      stageValidationCapture(
        'passkey_auth',
        'PASS',
        t('passkey.validation.capture_notes.backend_auth_success'),
      );
      Alert.alert(t('backup.success'), t('passkey.backend_auth_success'));
    } catch (error: any) {
      const message = formatPasskeyBackendError(error, t);
      stageValidationCapture('passkey_auth', 'FAIL', message);
      Alert.alert(
        t('passkey.backend_auth_title'),
        message,
      );
    } finally {
      setWorking(false);
    }
  };

  const checkBackendReadiness = async () => {
    if (!backendSummary.configured) {
      setBackendReachable(false);
      Alert.alert(
        t('passkey.readiness.title'),
        t('passkey.errors.configuration_error'),
      );
      return;
    }

    setCheckingBackend(true);
    try {
      const settings = SecureAppSettings.get().passkeyRp;
      const ok = await PasskeyRpApi.healthCheck({
        baseUrl: (settings.baseUrl || '').trim(),
        authToken: (settings.authToken || '').trim() || undefined,
        headers:
          (settings.tenantHeaderName || '').trim() &&
          (settings.tenantHeaderValue || '').trim()
            ? {
                [(settings.tenantHeaderName || '').trim()]:
                  (settings.tenantHeaderValue || '').trim(),
              }
            : undefined,
      });
      setBackendReachable(ok);
      Alert.alert(
        t('passkey.readiness.title'),
        ok
          ? t('passkeys.backend.health_ok')
          : t('passkeys.backend.health_fail'),
      );
    } catch (error: any) {
      setBackendReachable(false);
      Alert.alert(
        t('passkey.readiness.title'),
        formatPasskeyBackendError(error, t),
      );
    } finally {
      setCheckingBackend(false);
    }
  };

  const readiness = PasskeyReadinessService.build({
    backendConfigured: backendSummary.configured,
    backendReachable,
    nativeAvailable,
    username: form.username,
    url: form.url,
    rpId: form.data?.rp_id,
    credentialId: form.data?.credential_id,
  });

  const themed = {
    nativeCard: [styles.card, { backgroundColor: cc.sageLight, borderColor: cc.cardBorder }],
    defaultCard: [styles.card, { backgroundColor: cc.inputBg, borderColor: cc.cardBorder }],
    heading: [styles.heading, { color: cc.navy }],
    bodyText: [styles.bodyText, { color: cc.muted }],
    smallText: [styles.smallText, { color: cc.muted }],
    smallTextTop6: [styles.smallTextTop6, { color: cc.muted }],
    smallTextTop8: [styles.smallTextTop8, { color: cc.muted }],
    actionText: [styles.actionText, { color: cc.sage }],
    darkActionText: [styles.actionText, { color: cc.navy }],
    primaryActionText: [styles.actionText, styles.primaryActionText],
    checkBackendButton: [
      styles.fullButton,
      {
        backgroundColor: cc.sageLight,
        borderColor: cc.cardBorder,
        opacity: checkingBackend ? 0.6 : 1,
      },
    ],
    secondaryButton: [
      styles.flexButton,
      { backgroundColor: cc.sageLight, borderColor: cc.cardBorder },
    ],
    importButton: [
      styles.importButton,
      { backgroundColor: cc.inputBg, borderColor: cc.cardBorder },
    ],
    saveButton: [
      styles.saveButton,
      {
        backgroundColor: cc.sage,
        borderColor: cc.sage,
        opacity: validationSaving ? 0.6 : 1,
      },
    ],
    createSummaryPill: [
      styles.summaryPill,
      readiness.createReady ? styles.readyPill : styles.blockedPill,
    ],
    createSummaryValue: [
      styles.pillValue,
      readiness.createReady ? styles.readyText : styles.blockedText,
    ],
    authSummaryPill: [
      styles.summaryPill,
      readiness.authReady ? styles.readyPill : styles.blockedPill,
    ],
    authSummaryValue: [
      styles.pillValue,
      readiness.authReady ? styles.readyText : styles.blockedText,
    ],
    scenarioActive: [
      styles.scenarioButton,
      { borderColor: cc.sage, backgroundColor: cc.sageLight },
    ],
    scenarioInactive: [
      styles.scenarioButton,
      { borderColor: cc.cardBorder, backgroundColor: 'transparent' },
    ],
    createOnDeviceButton: [
      styles.flexButton,
      { backgroundColor: cc.sage, borderColor: cc.sage, opacity: working ? 0.6 : 1 },
    ],
    authenticateOnDeviceButton: [
      styles.flexButton,
      {
        backgroundColor: cc.inputBg,
        borderColor: cc.cardBorder,
        opacity: working || !form.data?.credential_id ? 0.6 : 1,
      },
    ],
    createWithBackendButton: [
      styles.flexButton,
      {
        backgroundColor: backendSummary.configured ? cc.sage : cc.inputBg,
        borderColor: backendSummary.configured ? cc.sage : cc.cardBorder,
        opacity: working || !backendSummary.configured ? 0.6 : 1,
      },
    ],
    createWithBackendText: [
      styles.actionText,
      { color: backendSummary.configured ? '#fff' : cc.navy },
    ],
    authenticateWithBackendButton: [
      styles.flexButton,
      {
        backgroundColor: cc.inputBg,
        borderColor: cc.cardBorder,
        opacity:
          working || !backendSummary.configured || !form.data?.credential_id
            ? 0.6
            : 1,
      },
    ],
  };

  const getReadinessTone = (item: { ready: boolean; pending: boolean }) => {
    if (item.ready) {
      return { icon: 'OK', color: '#16a34a' };
    }
    if (item.pending) {
      return { icon: '...', color: cc.muted };
    }
    return { icon: '!!', color: '#dc2626' };
  };

  const applySuggestedEvidenceName = () => {
    const suggested = FieldValidationService.buildEvidenceFileName({
      vendor: validationDraft.vendor,
      model: validationDraft.model,
      androidVersion: validationDraft.androidVersion,
      scenario: validationDraft.scenario || 'passkey_create',
      result: validationDraft.result || 'PASS',
    });
    setValidationDraft(current => ({
      ...current,
      evidencePath: `docs/validation/kanit/${suggested}`,
    }));
  };

  const saveValidationRecord = async () => {
    if (!validationDraft.deviceId || !validationDraft.vendor || !validationDraft.model) {
      Alert.alert(
        t('passkey.validation.title'),
        t('passkey.validation.missing_identity'),
      );
      return;
    }

    try {
      setValidationSaving(true);
      await FieldValidationService.saveRecord(validationDraft, SecurityModule.db);
      setValidationDraft(current =>
        FieldValidationService.createDraft({
          priority: current.priority,
          deviceId: current.deviceId,
          vendor: current.vendor,
          model: current.model,
          androidVersion: current.androidVersion,
          owner: current.owner,
          scenario: current.scenario,
          result: current.result,
          notes: '',
          evidencePath: '',
        }),
      );
      refreshValidationRecords();
      Alert.alert(t('backup.success'), t('passkey.validation.saved'));
    } catch (error: any) {
      Alert.alert(
        t('passkey.validation.title'),
        error?.message || t('passkey.validation.save_failed'),
      );
    } finally {
      setValidationSaving(false);
    }
  };

  return (
    <View>
      <Field
        label={t('fields.username')}
        value={form.username}
        onChange={(v: string) => setForm({ ...form, username: v })}
        placeholder="user@example.com"
        keyboardType="email-address"
        theme={theme}
      />
      <Field
        label={t('fields.url')}
        value={form.url}
        onChange={(v: string) => setForm({ ...form, url: v })}
        placeholder="https://example.com"
        keyboardType="url"
        theme={theme}
      />

      <View style={themed.nativeCard}>
        <Text style={themed.heading}>
          {nativeAvailable === false
            ? t('passkey.native_unavailable')
            : t('passkey.native_ready')}
        </Text>
        <Text style={themed.bodyText}>
          {t('passkey.native_hint')}
        </Text>
        <Text style={themed.smallTextTop6}>
          {t('passkey.scope_notice')}
        </Text>
        <Text style={themed.smallTextTop8}>
          {getPasskeyStatusText()}
        </Text>
        <Text
          style={[
            styles.smallStrongTextTop8,
            { color: backendSummary.configured ? cc.sage : cc.muted },
          ]}
        >
          {backendSummary.configured
            ? t('passkey.backend_ready', {
                baseUrl: backendSummary.baseUrl,
                accountId: backendSummary.accountId,
              })
            : t('passkey.backend_missing')}
        </Text>
      </View>

      <View style={themed.defaultCard}>
        <Text style={themed.heading}>
          {t('passkey.readiness.title')}
        </Text>
        <Text style={themed.bodyText}>
          {t('passkey.readiness.subtitle')}
        </Text>

        <View style={styles.readinessList}>
          {readiness.items.map(item => {
            const tone = getReadinessTone(item);
            return (
              <View
                key={item.id}
                style={[styles.readinessItem, { borderColor: cc.cardBorder }]}
              >
                <Text
                  style={[styles.readinessLabel, { color: cc.navy }]}
                >
                  {t(`passkey.readiness.items.${item.id}`)}
                </Text>
                <Text
                  style={[styles.readinessState, { color: tone.color }]}
                >
                  {item.ready
                    ? t('passkey.readiness.states.ready')
                    : item.pending
                    ? t('passkey.readiness.states.pending')
                    : t('passkey.readiness.states.missing')}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.summaryRow}>
          <View
            style={themed.createSummaryPill}
          >
            <Text style={[styles.pillLabel, { color: cc.muted }]}>
              {t('passkey.readiness.create_label')}
            </Text>
            <Text
              style={themed.createSummaryValue}
            >
              {readiness.createReady
                ? t('passkey.readiness.states.ready')
                : t('passkey.readiness.states.blocked')}
            </Text>
          </View>
          <View
            style={themed.authSummaryPill}
          >
            <Text style={[styles.pillLabel, { color: cc.muted }]}>
              {t('passkey.readiness.auth_label')}
            </Text>
            <Text
              style={themed.authSummaryValue}
            >
              {readiness.authReady
                ? t('passkey.readiness.states.ready')
                : t('passkey.readiness.states.blocked')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={checkBackendReadiness}
          disabled={checkingBackend}
          style={themed.checkBackendButton}
        >
          <Text style={themed.actionText}>
            {checkingBackend
              ? t('passkey.native_working')
              : t('passkey.readiness.check_backend')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={themed.defaultCard}>
        <Text style={themed.heading}>
          {t('passkey.validation.title')}
        </Text>
        <Text style={themed.bodyText}>
          {t('passkey.validation.subtitle')}
        </Text>

        <View style={styles.summaryRow}>
          {['passkey_create', 'passkey_auth', 'passkey_prereq_failure'].map(scenario => (
            <TouchableOpacity
              key={scenario}
              onPress={() =>
                setValidationDraft(current => ({ ...current, scenario: scenario as any }))
              }
              style={
                validationDraft.scenario === scenario
                  ? themed.scenarioActive
                  : themed.scenarioInactive
              }
            >
              <Text
                style={[
                  styles.scenarioText,
                  {
                    color:
                      validationDraft.scenario === scenario ? cc.sage : cc.navy,
                  },
                ]}
              >
                {t(`passkey.validation.scenarios.${scenario}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.marginTop12}>
          <SelectChips
            label={t('passkey.validation.result_label')}
            options={FIELD_VALIDATION_RESULTS.map(result => ({
              id: result,
              label: t(`passkey.validation.results.${result}`),
            }))}
            value={validationDraft.result || 'PASS'}
            onChange={(value: string) =>
              setValidationDraft(current => ({
                ...current,
                result: value as any,
              }))
            }
            theme={theme}
          />
        </View>

        <View style={styles.formRow}>
          <View style={styles.flexOne}>
            <Field
              label={t('passkey.validation.device_id')}
              value={validationDraft.deviceId || ''}
              onChange={(value: string) =>
                setValidationDraft(current => ({ ...current, deviceId: value }))
              }
              placeholder="pixel-8"
              theme={theme}
            />
          </View>
          <View style={styles.flexOne}>
            <SelectChips
              label={t('passkey.validation.priority_label')}
              options={['P0', 'P1', 'P2'].map(value => ({ id: value, label: value }))}
              value={validationDraft.priority || 'P0'}
              onChange={(value: string) =>
                setValidationDraft(current => ({
                  ...current,
                  priority: value as 'P0' | 'P1' | 'P2',
                }))
              }
              theme={theme}
            />
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.flexOne}>
            <Field
              label={t('passkey.validation.vendor')}
              value={validationDraft.vendor || ''}
              onChange={(value: string) =>
                setValidationDraft(current => ({ ...current, vendor: value }))
              }
              placeholder="Google"
              theme={theme}
            />
          </View>
          <View style={styles.flexOne}>
            <Field
              label={t('passkey.validation.model')}
              value={validationDraft.model || ''}
              onChange={(value: string) =>
                setValidationDraft(current => ({ ...current, model: value }))
              }
              placeholder="Pixel 8"
              theme={theme}
            />
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.flexOne}>
            <Field
              label={t('passkey.validation.android_version')}
              value={validationDraft.androidVersion || ''}
              onChange={(value: string) =>
                setValidationDraft(current => ({
                  ...current,
                  androidVersion: value,
                }))
              }
              placeholder="15"
              theme={theme}
            />
          </View>
          <View style={styles.flexOne}>
            <Field
              label={t('passkey.validation.owner')}
              value={validationDraft.owner || ''}
              onChange={(value: string) =>
                setValidationDraft(current => ({ ...current, owner: value }))
              }
              placeholder="qa@team"
              theme={theme}
            />
          </View>
        </View>

        <Field
          label={t('passkey.validation.evidence_path')}
          value={validationDraft.evidencePath || ''}
          onChange={(value: string) =>
            setValidationDraft(current => ({ ...current, evidencePath: value }))
          }
          placeholder="docs/validation/kanit/..."
          theme={theme}
        />

        <TouchableOpacity
          onPress={applySuggestedEvidenceName}
          style={[styles.fullButton, { backgroundColor: cc.sageLight, borderColor: cc.cardBorder }]}
        >
          <Text style={themed.actionText}>
            {t('passkey.validation.suggest_evidence')}
          </Text>
        </TouchableOpacity>

        <Field
          label={t('passkey.validation.notes')}
          value={validationDraft.notes || ''}
          onChange={(value: string) =>
            setValidationDraft(current => ({ ...current, notes: value }))
          }
          placeholder={t('passkey.validation.notes_placeholder')}
          multiline
          lines={3}
          theme={theme}
        />

        <TouchableOpacity
          onPress={saveValidationRecord}
          disabled={validationSaving}
          style={themed.saveButton}
        >
          <Text style={themed.primaryActionText}>
            {validationSaving
              ? t('passkey.native_working')
              : t('passkey.validation.save')}
          </Text>
        </TouchableOpacity>

        {validationRecords.length > 0 ? (
          <View style={styles.recentList}>
            <Text style={[styles.recentTitle, { color: cc.navy }]}>
              {t('passkey.validation.recent_title')}
            </Text>
            {validationRecords.map(record => (
              <View
                key={record.id}
                style={[styles.recentRecord, { borderColor: cc.cardBorder }]}
              >
                <Text style={[styles.recentRecordTitle, { color: cc.navy }]}>
                  {record.vendor} {record.model} •{' '}
                  {t(`passkey.validation.scenarios.${record.scenario}`)}
                </Text>
                <Text style={[styles.recentRecordMeta, { color: cc.muted }]}>
                  {t(`passkey.validation.results.${record.result}`)} • Android{' '}
                  {record.androidVersion || '-'} • {record.deviceId}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={autofillRpId}
          style={themed.secondaryButton}
        >
          <Text style={themed.actionText}>
            {t('passkey.fill_rp_id')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={generateIds}
          style={themed.secondaryButton}
        >
          <Text style={themed.actionText}>
            {t('passkey.generate_ids')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={createOnDevice}
          disabled={working}
          style={themed.createOnDeviceButton}
        >
          <Text style={themed.primaryActionText}>
            {working ? t('passkey.native_working') : t('passkey.native_create')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={authenticateOnDevice}
          disabled={working || !form.data?.credential_id}
          style={themed.authenticateOnDeviceButton}
        >
          <Text style={themed.darkActionText}>
            {working ? t('passkey.native_working') : t('passkey.native_auth')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={createWithBackend}
          disabled={working || !backendSummary.configured}
          style={themed.createWithBackendButton}
        >
          <Text
            style={themed.createWithBackendText}
          >
            {working
              ? t('passkey.native_working')
              : t('passkey.backend_create')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={authenticateWithBackend}
          disabled={
            working || !backendSummary.configured || !form.data?.credential_id
          }
          style={themed.authenticateWithBackendButton}
        >
          <Text style={themed.darkActionText}>
            {working ? t('passkey.native_working') : t('passkey.backend_auth')}
          </Text>
        </TouchableOpacity>
      </View>

      <Field
        label={t('fields.passkey_rp_id')}
        value={form.data?.rp_id}
        onChange={(v: string) => updatePasskey({ rp_id: v })}
        placeholder="example.com"
        theme={theme}
      />
      <Field
        label={t('fields.passkey_credential_id')}
        value={form.data?.credential_id}
        onChange={(v: string) =>
          updatePasskey({ credential_id: SecurityModule.sanitizeBase64Url(v) })
        }
        placeholder="Base64URL credential id"
        theme={theme}
      />
      <Field
        label={t('fields.passkey_user_handle')}
        value={form.data?.user_handle}
        onChange={(v: string) =>
          updatePasskey({ user_handle: SecurityModule.sanitizeBase64Url(v) })
        }
        placeholder="Base64URL user handle"
        theme={theme}
      />
      <Field
        label={t('fields.passkey_display_name')}
        value={form.data?.display_name}
        onChange={(v: string) => updatePasskey({ display_name: v })}
        placeholder="Device passkey"
        theme={theme}
      />
      <SelectChips
        label={t('fields.passkey_transport')}
        options={PASSKEY_TRANSPORTS}
        value={form.data?.transport || 'internal'}
        onChange={(v: string) => updatePasskey({ transport: v })}
        theme={theme}
      />
      <Field
        label={t('passkey.import_json')}
        value={importJson}
        onChange={setImportJson}
        placeholder={t('passkey.import_placeholder')}
        multiline
        lines={5}
        theme={theme}
      />
      <TouchableOpacity
        onPress={importPayload}
        style={themed.importButton}
      >
        <Text style={themed.darkActionText}>
          {t('passkey.import_apply')}
        </Text>
      </TouchableOpacity>
      <Field
        label={t('vault.notes')}
        value={form.notes}
        onChange={(v: string) => setForm({ ...form, notes: v })}
        placeholder="..."
        multiline
        lines={3}
        theme={theme}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 18,
  },
  blockedPill: {
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  blockedText: {
    color: '#dc2626',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  flexButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  flexOne: {
    flex: 1,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fullButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingVertical: 10,
  },
  heading: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  importButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingVertical: 10,
  },
  marginTop12: {
    marginTop: 12,
  },
  pillLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  pillValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  primaryActionText: {
    color: '#fff',
  },
  readinessItem: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  readinessLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 12,
  },
  readinessList: {
    gap: 8,
    marginTop: 10,
  },
  readinessState: {
    fontSize: 11,
    fontWeight: '800',
  },
  readyPill: {
    backgroundColor: 'rgba(22,163,74,0.12)',
  },
  readyText: {
    color: '#16a34a',
  },
  recentList: {
    gap: 8,
    marginTop: 12,
  },
  recentRecord: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  recentRecordMeta: {
    fontSize: 11,
    lineHeight: 17,
  },
  recentRecordTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  recentTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    paddingVertical: 10,
  },
  scenarioButton: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  scenarioText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  smallStrongTextTop8: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 8,
  },
  smallText: {
    fontSize: 11,
    lineHeight: 17,
  },
  smallTextTop6: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },
  smallTextTop8: {
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  summaryPill: {
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});

