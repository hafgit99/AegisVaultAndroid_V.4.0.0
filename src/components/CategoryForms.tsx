import React, { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import {
  FIELD_VALIDATION_RESULTS,
  FieldValidationService,
} from '../FieldValidationService';
import { Field, PasswordField, SelectChips } from './FormFields';
import { formatPasskeyBackendError } from '../PasskeyErrorMapper';
import { PasskeyReadinessService } from '../PasskeyReadinessService';
import { PasskeyRpApi } from '../PasskeyRpApi';
import { PasskeyRpService } from '../PasskeyRpService';
import { SecureAppSettings } from '../SecureAppSettings';
import { SecurityModule } from '../SecurityModule';
import { PasskeyModule } from '../PasskeyModule';

const SECURITY_TYPES = [
  { id: 'WPA2', label: 'WPA2' },
  { id: 'WPA3', label: 'WPA3' },
  { id: 'WEP', label: 'WEP' },
  { id: 'open', label: 'Açık' },
];
const getCardBrands = (_t: any) => [
  { id: 'visa', label: 'Visa', icon: '💳' },
  { id: 'mastercard', label: 'MC', icon: '💳' },
  { id: 'amex', label: 'Amex', icon: '💳' },
  { id: 'other', label: 'Other', icon: '💳' },
];
const getGenders = (_t: any) => [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
];

const PASSKEY_TRANSPORTS = [
  { id: 'internal', label: 'Internal (Platform)' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'usb', label: 'USB' },
  { id: 'nfc', label: 'NFC' },
  { id: 'ble', label: 'BLE' },
];

// ── Login Form ──
export const LoginForm = ({
  form,
  setForm,
  showPw,
  setShowPw,
  pwLen,
  t,
  theme,
}: any) => {
  const strength = SecurityModule.getPasswordStrength(form.password);
  return (
    <View>
      <Field
        label={t('fields.username')}
        value={form.username}
        onChange={(v: string) => setForm({ ...form, username: v })}
        placeholder="email@example.com"
        theme={theme}
      />
      <PasswordField
        label={t('fields.password')}
        value={form.password}
        onChange={(v: string) => setForm({ ...form, password: v })}
        onGenerate={() =>
          setForm({ ...form, password: SecurityModule.generatePassword(pwLen) })
        }
        showPw={showPw}
        setShowPw={setShowPw}
        strength={strength}
        theme={theme}
      />
      <Field
        label={t('fields.url')}
        value={form.url}
        onChange={(v: string) => setForm({ ...form, url: v })}
        placeholder="https://..."
        keyboardType="url"
        theme={theme}
      />
      <Field
        label={t('fields.totp_secret')}
        value={form.data?.totp_secret}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, totp_secret: v } })
        }
        placeholder="Base32 encoded secret"
        theme={theme}
      />
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

// ── Card Form ──
export const CardForm = ({
  form,
  setForm,
  showPw,
  setShowPw: _setShowPw,
  t,
  theme,
}: any) => (
  <View>
    <Field
      label={t('fields.cardholder')}
      value={form.data?.cardholder}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, cardholder: v } })
      }
      placeholder="..."
      theme={theme}
    />
    <Field
      label={t('fields.card_number')}
      value={form.data?.card_number}
      onChange={(v: string) => {
        const clean = v.replace(/\D/g, '').slice(0, 16);
        const formatted = clean.replace(/(.{4})/g, '$1 ').trim();
        setForm({ ...form, data: { ...form.data, card_number: formatted } });
      }}
      placeholder="1234 5678 9012 3456"
      keyboardType="numeric"
      theme={theme}
    />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.expiry')}
          value={form.data?.expiry}
          onChange={(v: string) => {
            let clean = v.replace(/\D/g, '').slice(0, 4);
            if (clean.length > 2)
              clean = clean.slice(0, 2) + '/' + clean.slice(2);
            setForm({ ...form, data: { ...form.data, expiry: clean } });
          }}
          placeholder="MM/YY"
          keyboardType="numeric"
          theme={theme}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.cvv')}
          value={form.data?.cvv}
          onChange={(v: string) =>
            setForm({
              ...form,
              data: { ...form.data, cvv: v.replace(/\D/g, '').slice(0, 4) },
            })
          }
          placeholder="***"
          keyboardType="numeric"
          secure={!showPw}
          theme={theme}
        />
      </View>
    </View>
    <Field
      label={t('fields.pin')}
      value={form.data?.pin}
      onChange={(v: string) =>
        setForm({
          ...form,
          data: { ...form.data, pin: v.replace(/\D/g, '').slice(0, 6) },
        })
      }
      placeholder="ATM PIN"
      keyboardType="numeric"
      secure={!showPw}
      theme={theme}
    />
    <SelectChips
      label={t('fields.card_brand')}
      options={getCardBrands(t)}
      value={form.data?.brand || 'visa'}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, brand: v } })
      }
      theme={theme}
    />
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

// ── Identity Form ──
export const IdentityForm = ({ form, setForm, t, theme }: any) => (
  <View>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.first_name')}
          value={form.data?.first_name}
          onChange={(v: string) =>
            setForm({ ...form, data: { ...form.data, first_name: v } })
          }
          placeholder="..."
          theme={theme}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.last_name')}
          value={form.data?.last_name}
          onChange={(v: string) =>
            setForm({ ...form, data: { ...form.data, last_name: v } })
          }
          placeholder="..."
          theme={theme}
        />
      </View>
    </View>
    <Field
      label={t('fields.national_id')}
      value={form.data?.national_id}
      onChange={(v: string) =>
        setForm({
          ...form,
          data: {
            ...form.data,
            national_id: v.replace(/\D/g, '').slice(0, 11),
          },
        })
      }
      placeholder="11111111111"
      keyboardType="numeric"
      theme={theme}
    />
    <Field
      label={t('fields.birthday')}
      value={form.data?.birthday}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, birthday: v } })
      }
      placeholder="DD/MM/YYYY"
      theme={theme}
    />
    <SelectChips
      label={t('fields.gender')}
      options={getGenders(t)}
      value={form.data?.gender || ''}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, gender: v } })
      }
      theme={theme}
    />
    <Field
      label={t('fields.phone')}
      value={form.data?.phone}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, phone: v } })
      }
      placeholder="+X XXX XXX XXXX"
      keyboardType="phone-pad"
      theme={theme}
    />
    <Field
      label={t('fields.email')}
      value={form.data?.email}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, email: v } })
      }
      placeholder="email@example.com"
      keyboardType="email-address"
      theme={theme}
    />
    <Field
      label={t('fields.company')}
      value={form.data?.company}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, company: v } })
      }
      placeholder="..."
      theme={theme}
    />
    <Field
      label={t('fields.address')}
      value={form.data?.address}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, address: v } })
      }
      placeholder="..."
      multiline
      lines={2}
      theme={theme}
    />
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

// ── Note Form ──
export const NoteForm = ({ form, setForm, t, theme }: any) => (
  <View>
    <Field
      label={t('fields.note_content')}
      value={form.data?.content}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, content: v } })
      }
      placeholder="..."
      multiline
      lines={8}
      theme={theme}
    />
  </View>
);

// ── WiFi Form ──
export const WifiForm = ({
  form,
  setForm,
  showPw,
  setShowPw,
  t,
  theme,
}: any) => {
  const strength = SecurityModule.getPasswordStrength(form.data?.wifi_password);
  return (
    <View>
      <Field
        label={t('fields.ssid')}
        value={form.data?.ssid}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, ssid: v } })
        }
        placeholder="..."
        theme={theme}
      />
      <PasswordField
        label={t('fields.wifi_password')}
        value={form.data?.wifi_password}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, wifi_password: v } })
        }
        showPw={showPw}
        setShowPw={setShowPw}
        strength={strength}
        onGenerate={null}
        theme={theme}
      />
      <SelectChips
        label={t('fields.security')}
        options={SECURITY_TYPES}
        value={form.data?.security || 'WPA2'}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, security: v } })
        }
        theme={theme}
      />
      <Field
        label={t('vault.notes')}
        value={form.notes}
        onChange={(v: string) => setForm({ ...form, notes: v })}
        placeholder="..."
        multiline
        lines={2}
        theme={theme}
      />
    </View>
  );
};

// ── Passkey Form ──
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

      <View
        style={{
          backgroundColor: cc.sageLight,
          borderWidth: 1,
          borderColor: cc.cardBorder,
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: cc.navy,
            fontSize: 12,
            fontWeight: '700',
            marginBottom: 4,
          }}
        >
          {nativeAvailable === false
            ? t('passkey.native_unavailable')
            : t('passkey.native_ready')}
        </Text>
        <Text style={{ color: cc.muted, fontSize: 12, lineHeight: 18 }}>
          {t('passkey.native_hint')}
        </Text>
        <Text
          style={{
            color: cc.muted,
            fontSize: 11,
            lineHeight: 17,
            marginTop: 6,
          }}
        >
          {t('passkey.scope_notice')}
        </Text>
        <Text
          style={{
            color: cc.muted,
            fontSize: 11,
            lineHeight: 17,
            marginTop: 8,
          }}
        >
          {getPasskeyStatusText()}
        </Text>
        <Text
          style={{
            color: backendSummary.configured ? cc.sage : cc.muted,
            fontSize: 11,
            lineHeight: 17,
            marginTop: 8,
            fontWeight: '700',
          }}
        >
          {backendSummary.configured
            ? t('passkey.backend_ready', {
                baseUrl: backendSummary.baseUrl,
                accountId: backendSummary.accountId,
              })
            : t('passkey.backend_missing')}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: cc.inputBg,
          borderWidth: 1,
          borderColor: cc.cardBorder,
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: cc.navy,
            fontSize: 12,
            fontWeight: '700',
            marginBottom: 4,
          }}
        >
          {t('passkey.readiness.title')}
        </Text>
        <Text style={{ color: cc.muted, fontSize: 12, lineHeight: 18 }}>
          {t('passkey.readiness.subtitle')}
        </Text>

        <View style={{ marginTop: 10, gap: 8 }}>
          {readiness.items.map(item => {
            const tone = getReadinessTone(item);
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: cc.cardBorder,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    color: cc.navy,
                    fontSize: 12,
                    fontWeight: '600',
                    flex: 1,
                    marginRight: 12,
                  }}
                >
                  {t(`passkey.readiness.items.${item.id}`)}
                </Text>
                <Text
                  style={{
                    color: tone.color,
                    fontSize: 11,
                    fontWeight: '800',
                  }}
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

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
              backgroundColor: readiness.createReady
                ? 'rgba(22,163,74,0.12)'
                : 'rgba(220,38,38,0.08)',
            }}
          >
            <Text style={{ color: cc.muted, fontSize: 11, marginBottom: 2 }}>
              {t('passkey.readiness.create_label')}
            </Text>
            <Text
              style={{
                color: readiness.createReady ? '#16a34a' : '#dc2626',
                fontSize: 12,
                fontWeight: '800',
              }}
            >
              {readiness.createReady
                ? t('passkey.readiness.states.ready')
                : t('passkey.readiness.states.blocked')}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
              backgroundColor: readiness.authReady
                ? 'rgba(22,163,74,0.12)'
                : 'rgba(220,38,38,0.08)',
            }}
          >
            <Text style={{ color: cc.muted, fontSize: 11, marginBottom: 2 }}>
              {t('passkey.readiness.auth_label')}
            </Text>
            <Text
              style={{
                color: readiness.authReady ? '#16a34a' : '#dc2626',
                fontSize: 12,
                fontWeight: '800',
              }}
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
          style={{
            marginTop: 12,
            backgroundColor: cc.sageLight,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: checkingBackend ? 0.6 : 1,
          }}
        >
          <Text style={{ color: cc.sage, fontSize: 12, fontWeight: '700' }}>
            {checkingBackend
              ? t('passkey.native_working')
              : t('passkey.readiness.check_backend')}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          backgroundColor: cc.inputBg,
          borderWidth: 1,
          borderColor: cc.cardBorder,
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: cc.navy,
            fontSize: 12,
            fontWeight: '700',
            marginBottom: 4,
          }}
        >
          {t('passkey.validation.title')}
        </Text>
        <Text style={{ color: cc.muted, fontSize: 12, lineHeight: 18 }}>
          {t('passkey.validation.subtitle')}
        </Text>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {['passkey_create', 'passkey_auth', 'passkey_prereq_failure'].map(scenario => (
            <TouchableOpacity
              key={scenario}
              onPress={() =>
                setValidationDraft(current => ({ ...current, scenario: scenario as any }))
              }
              style={{
                flex: 1,
                borderRadius: 10,
                borderWidth: 1,
                borderColor:
                  validationDraft.scenario === scenario ? cc.sage : cc.cardBorder,
                backgroundColor:
                  validationDraft.scenario === scenario ? cc.sageLight : 'transparent',
                paddingVertical: 9,
                paddingHorizontal: 8,
              }}
            >
              <Text
                style={{
                  color:
                    validationDraft.scenario === scenario ? cc.sage : cc.navy,
                  fontSize: 11,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {t(`passkey.validation.scenarios.${scenario}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
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
          <View style={{ flex: 1 }}>
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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
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
          <View style={{ flex: 1 }}>
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

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
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
          <View style={{ flex: 1 }}>
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
          style={{
            marginBottom: 12,
            backgroundColor: cc.sageLight,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: cc.sage, fontSize: 12, fontWeight: '700' }}>
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
          style={{
            marginTop: 4,
            backgroundColor: cc.sage,
            borderWidth: 1,
            borderColor: cc.sage,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: validationSaving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {validationSaving
              ? t('passkey.native_working')
              : t('passkey.validation.save')}
          </Text>
        </TouchableOpacity>

        {validationRecords.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text
              style={{
                color: cc.navy,
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              {t('passkey.validation.recent_title')}
            </Text>
            {validationRecords.map(record => (
              <View
                key={record.id}
                style={{
                  borderWidth: 1,
                  borderColor: cc.cardBorder,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: cc.navy, fontSize: 12, fontWeight: '700' }}>
                  {record.vendor} {record.model} •{' '}
                  {t(`passkey.validation.scenarios.${record.scenario}`)}
                </Text>
                <Text style={{ color: cc.muted, fontSize: 11, lineHeight: 17 }}>
                  {t(`passkey.validation.results.${record.result}`)} • Android{' '}
                  {record.androidVersion || '-'} • {record.deviceId}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={autofillRpId}
          style={{
            flex: 1,
            backgroundColor: cc.sageLight,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: cc.sage, fontSize: 12, fontWeight: '700' }}>
            {t('passkey.fill_rp_id')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={generateIds}
          style={{
            flex: 1,
            backgroundColor: cc.sageLight,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: cc.sage, fontSize: 12, fontWeight: '700' }}>
            {t('passkey.generate_ids')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={createOnDevice}
          disabled={working}
          style={{
            flex: 1,
            backgroundColor: cc.sage,
            borderWidth: 1,
            borderColor: cc.sage,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: working ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {working ? t('passkey.native_working') : t('passkey.native_create')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={authenticateOnDevice}
          disabled={working || !form.data?.credential_id}
          style={{
            flex: 1,
            backgroundColor: cc.inputBg,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: working || !form.data?.credential_id ? 0.6 : 1,
          }}
        >
          <Text style={{ color: cc.navy, fontSize: 12, fontWeight: '700' }}>
            {working ? t('passkey.native_working') : t('passkey.native_auth')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={createWithBackend}
          disabled={working || !backendSummary.configured}
          style={{
            flex: 1,
            backgroundColor: backendSummary.configured ? cc.sage : cc.inputBg,
            borderWidth: 1,
            borderColor: backendSummary.configured ? cc.sage : cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: working || !backendSummary.configured ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              color: backendSummary.configured ? '#fff' : cc.navy,
              fontSize: 12,
              fontWeight: '700',
            }}
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
          style={{
            flex: 1,
            backgroundColor: cc.inputBg,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity:
              working || !backendSummary.configured || !form.data?.credential_id
                ? 0.6
                : 1,
          }}
        >
          <Text style={{ color: cc.navy, fontSize: 12, fontWeight: '700' }}>
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
        style={{
          backgroundColor: cc.inputBg,
          borderWidth: 1,
          borderColor: cc.cardBorder,
          borderRadius: 12,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: cc.navy, fontSize: 12, fontWeight: '700' }}>
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

// ── Form Router ──
export const CategoryForm = ({
  category,
  form,
  setForm,
  showPw,
  setShowPw,
  pwLen,
  t,
  theme,
}: any) => {
  switch (category) {
    case 'card':
      return (
        <CardForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          t={t}
          theme={theme}
        />
      );
    case 'identity':
      return <IdentityForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'note':
      return <NoteForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'wifi':
      return (
        <WifiForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          t={t}
          theme={theme}
        />
      );
    case 'passkey':
      return <PasskeyForm form={form} setForm={setForm} t={t} theme={theme} />;
    default:
      return (
        <LoginForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          pwLen={pwLen}
          t={t}
          theme={theme}
        />
      );
  }
};
