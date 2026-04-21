/* eslint-disable react-native/no-inline-styles */
/**
 * PasskeySettings — Aegis Vault Android v4.2.0
 * UI for managing native FIDO2/Passkey bindings and lifecycle.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { PasskeyBindingService } from '../PasskeyBindingService';
import { PasskeyEnrollmentService } from '../PasskeyEnrollmentService';
import { PasskeyModule } from '../PasskeyModule';
import { PasskeyRpApi } from '../PasskeyRpApi';
import { PasskeyRpService } from '../PasskeyRpService';
import { SecureAppSettings } from '../SecureAppSettings';
import { SecurityModule } from '../SecurityModule';

export const PasskeySettings = ({ theme, bindings = [], onRefresh }: any) => {
  const { t } = useTranslation();
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [checkingNative, setCheckingNative] = useState(true);
  const [showEnroll, setShowEnroll] = useState(false);
  const [working, setWorking] = useState(false);
  const [username, setUsername] = useState('');
  const [rpId, setRpId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [notice, setNotice] = useState<null | { type: 'success' | 'error'; message: string }>(null);
  const [rpBaseUrl, setRpBaseUrl] = useState('');
  const [rpAccountId, setRpAccountId] = useState('');
  const [rpAuthToken, setRpAuthToken] = useState('');
  const [rpTenantHeaderName, setRpTenantHeaderName] = useState('');
  const [rpTenantHeaderValue, setRpTenantHeaderValue] = useState('');
  const [checkingBackend, setCheckingBackend] = useState(false);

  const orderedBindings = useMemo(
    () =>
      [...bindings].sort(
        (a, b) =>
          new Date(b?.meta?.createdAt || 0).getTime() -
          new Date(a?.meta?.createdAt || 0).getTime(),
      ),
    [bindings],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const available = await PasskeyModule.isAvailable();
        if (active) setNativeAvailable(available);
      } finally {
        if (active) setCheckingNative(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const settings = SecureAppSettings.get().passkeyRp;
    setRpBaseUrl(settings.baseUrl || '');
    setRpAccountId(settings.accountId || '');
    setRpAuthToken(settings.authToken || '');
    setRpTenantHeaderName(settings.tenantHeaderName || '');
    setRpTenantHeaderValue(settings.tenantHeaderValue || '');
  }, []);

  const resetForm = () => {
    setUsername('');
    setRpId('');
    setDisplayName('');
    setDeviceLabel('');
  };

  const saveRpSettings = async () => {
    await SecureAppSettings.update(
      {
        passkeyRp: {
          baseUrl: rpBaseUrl.trim(),
          accountId: rpAccountId.trim(),
          authToken: rpAuthToken.trim(),
          tenantHeaderName: rpTenantHeaderName.trim(),
          tenantHeaderValue: rpTenantHeaderValue.trim(),
        },
      },
      SecurityModule.db,
    );
    setNotice({
      type: 'success',
      message: t('passkeys.backend.saved'),
    });
  };

  const checkBackend = async () => {
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
      setNotice({
        type: ok ? 'success' : 'error',
        message: ok
          ? t('passkeys.backend.health_ok')
          : t('passkeys.backend.health_fail'),
      });
    } catch (error: any) {
      setNotice({
        type: 'error',
        message: error?.message || t('passkeys.backend.health_fail'),
      });
    } finally {
      setCheckingBackend(false);
    }
  };

  const backendSummary = PasskeyRpService.getConfigurationSummary();

  const onRevoke = async (id: string) => {
    await PasskeyBindingService.revokeBinding(id, 'user_requested', SecurityModule.db);
    setNotice({
      type: 'success',
      message: t('passkeys.revoke_success'),
    });
    if (onRefresh) onRefresh();
  };

  const onEnroll = async () => {
    if (!username.trim() || !rpId.trim()) {
      setNotice({
        type: 'error',
        message: t('passkeys.validation_required'),
      });
      return;
    }

    setWorking(true);
    setNotice(null);
    try {
      const result = await PasskeyEnrollmentService.enrollDevicePasskey({
        username,
        rpId,
        displayName,
        deviceLabel,
      });
      setShowEnroll(false);
      resetForm();
      setNotice({
        type: 'success',
        message: t('passkeys.bind_success', {
          credentialId: result.credentialId.slice(-8),
        }),
      });
      if (onRefresh) onRefresh();
    } catch (error: any) {
      setNotice({
        type: 'error',
        message: error?.message || t('passkeys.bind_failed'),
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[styles.title, { color: theme.navy }]}>{t('passkeys.title')}</Text>
      <Text style={[styles.info, { color: theme.muted }]}>{t('passkeys.info')}</Text>

      <View
        style={[
          styles.backendCard,
          { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[styles.backendTitle, { color: theme.navy }]}>
          {t('passkeys.backend.title')}
        </Text>
        <Text style={[styles.info, { color: theme.muted, marginBottom: 12 }]}>
          {t('passkeys.backend.desc')}
        </Text>

        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: backendSummary.configured
                ? theme.sageLight
                : theme.redBg || 'rgba(239,68,68,0.08)',
              borderColor: backendSummary.configured
                ? theme.sageMid
                : 'rgba(239,68,68,0.22)',
              marginBottom: 14,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: backendSummary.configured ? theme.sage : '#E53935' },
            ]}
          >
            {backendSummary.configured
              ? t('passkeys.backend.status_ready')
              : t('passkeys.backend.status_missing')}
          </Text>
        </View>

        <Text style={[styles.label, { color: theme.navy }]}>
          {t('passkeys.backend.base_url')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.navy,
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
          placeholder={t('passkeys.backend.base_url_placeholder')}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          keyboardType="url"
          value={rpBaseUrl}
          onChangeText={setRpBaseUrl}
        />

        <Text style={[styles.label, { color: theme.navy }]}>
          {t('passkeys.backend.account_id')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.navy,
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
          placeholder={t('passkeys.backend.account_id_placeholder')}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          value={rpAccountId}
          onChangeText={setRpAccountId}
        />

        <Text style={[styles.label, { color: theme.navy }]}>
          {t('passkeys.backend.auth_token')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.navy,
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
          placeholder={t('passkeys.backend.auth_token_placeholder')}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          value={rpAuthToken}
          onChangeText={setRpAuthToken}
        />

        <Text style={[styles.label, { color: theme.navy }]}>
          {t('passkeys.backend.header_name')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.navy,
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
          placeholder={t('passkeys.backend.header_name_placeholder')}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          value={rpTenantHeaderName}
          onChangeText={setRpTenantHeaderName}
        />

        <Text style={[styles.label, { color: theme.navy }]}>
          {t('passkeys.backend.header_value')}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.navy,
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
          placeholder={t('passkeys.backend.header_value_placeholder')}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          value={rpTenantHeaderValue}
          onChangeText={setRpTenantHeaderValue}
        />

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.sage, marginTop: 4 }]}
          onPress={saveRpSettings}
        >
          <Text style={styles.btnText}>{t('passkeys.backend.save')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secondaryAction,
            { borderColor: theme.cardBorder, backgroundColor: theme.card },
          ]}
          onPress={checkBackend}
          disabled={checkingBackend}
        >
          {checkingBackend ? (
            <ActivityIndicator color={theme.navy} />
          ) : (
            <Text style={[styles.secondaryActionText, { color: theme.navy }]}>
              {t('passkeys.backend.health_check')}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.statusPill,
          {
            backgroundColor: nativeAvailable
              ? theme.sageLight
              : theme.redBg || 'rgba(239,68,68,0.08)',
            borderColor: nativeAvailable
              ? theme.sageMid
              : 'rgba(239,68,68,0.22)',
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            { color: nativeAvailable ? theme.sage : '#E53935' },
          ]}
        >
          {checkingNative
            ? t('passkeys.status_checking')
            : nativeAvailable
            ? t('passkeys.status_ready')
            : t('passkeys.status_unavailable')}
        </Text>
      </View>

      {notice ? (
        <View
          style={[
            styles.notice,
            {
              backgroundColor:
                notice.type === 'success'
                  ? theme.sageLight
                  : theme.redBg || 'rgba(239,68,68,0.08)',
              borderColor:
                notice.type === 'success'
                  ? theme.sageMid
                  : 'rgba(239,68,68,0.22)',
            },
          ]}
        >
          <Text
            style={[
              styles.noticeText,
              { color: notice.type === 'success' ? theme.navy : '#E53935' },
            ]}
          >
            {notice.message}
          </Text>
        </View>
      ) : null}

      {orderedBindings.length === 0 ? (
        <Text style={[styles.empty, { color: theme.muted }]}>{t('passkeys.empty')}</Text>
      ) : (
        orderedBindings.map((binding: any) => (
          <View
            key={binding.credentialId}
            style={[styles.item, { borderColor: theme.cardBorder }]}
          >
            <View style={styles.content}>
              <Text style={[styles.name, { color: theme.navy }]}>
                {binding?.meta?.deviceLabel || t('passkeys.default_device_label')}
              </Text>
              <Text style={[styles.meta, { color: theme.muted }]}>
                {t('passkeys.credential_suffix')}: ...
                {binding.credentialId.slice(-8)} • {new Date(binding.meta.createdAt).toLocaleDateString()}
              </Text>
              {PasskeyBindingService.getPolicyViolations(binding.credentialId).length > 0 ? (
                <Text style={[styles.warn, { color: '#E53935' }]}>
                  {t('passkeys.policy_violation')}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.revBtn, { borderColor: '#E53935' }]}
              onPress={() => onRevoke(binding.credentialId)}
            >
              <Text style={styles.revBtnText}>{t('passkeys.btn_revoke')}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity
        style={[
          styles.btn,
          {
            backgroundColor: nativeAvailable ? theme.sage : theme.cardBorder,
            marginTop: 16,
          },
        ]}
        onPress={() => {
          if (!nativeAvailable) {
            setNotice({
              type: 'error',
              message: t('passkeys.status_unavailable_desc'),
            });
            return;
          }
          setShowEnroll(true);
        }}
      >
        <Text style={styles.btnText}>{t('passkeys.btn_bind')}</Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent
        visible={showEnroll}
        onRequestClose={() => {
          if (!working) setShowEnroll(false);
        }}
      >
        <View style={styles.modalScrim}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.navy }]}>
              {t('passkeys.enroll_title')}
            </Text>
            <Text style={[styles.modalInfo, { color: theme.muted }]}>
              {t('passkeys.enroll_info')}
            </Text>

            <Text style={[styles.label, { color: theme.navy }]}>{t('passkeys.field_username')}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.navy,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              placeholder={t('passkeys.field_username_placeholder')}
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={username}
              onChangeText={setUsername}
            />

            <Text style={[styles.label, { color: theme.navy }]}>{t('passkeys.field_rp_id')}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.navy,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              placeholder={t('passkeys.field_rp_id_placeholder')}
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              value={rpId}
              onChangeText={setRpId}
            />

            <Text style={[styles.label, { color: theme.navy }]}>{t('passkeys.field_display_name')}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.navy,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              placeholder={t('passkeys.field_display_name_placeholder')}
              placeholderTextColor={theme.muted}
              value={displayName}
              onChangeText={setDisplayName}
            />

            <Text style={[styles.label, { color: theme.navy }]}>{t('passkeys.field_device_label')}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.navy,
                  backgroundColor: theme.inputBg,
                  borderColor: theme.cardBorder,
                },
              ]}
              placeholder={t('passkeys.field_device_label_placeholder')}
              placeholderTextColor={theme.muted}
              value={deviceLabel}
              onChangeText={setDeviceLabel}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: theme.cardBorder }]}
                onPress={() => {
                  if (!working) setShowEnroll(false);
                }}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.navy }]}>
                  {t('passkeys.btn_cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.sage }]}
                onPress={onEnroll}
                disabled={working}
              >
                <Text style={styles.primaryBtnText}>
                  {working ? t('passkeys.btn_binding') : t('passkeys.btn_confirm_bind')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  backendCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  backendTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  secondaryAction: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  info: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  notice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 10,
  },
  item: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    fontSize: 11,
    marginTop: 2,
  },
  warn: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  revBtn: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  revBtnText: {
    color: '#E53935',
    fontWeight: '700',
    fontSize: 11,
  },
  btn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalInfo: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
