/**
 * SyncSettings — Aegis Vault Android v4.02
 * UI for configuring and triggering relay-based E2E sync.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecureAppSettings } from '../SecureAppSettings';
import { SyncManager } from '../SyncManager';
import { SecurityModule } from '../SecurityModule';

export const SyncSettings = ({ theme }: any) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [checkingRelay, setCheckingRelay] = useState(false);
  const [creatingRelay, setCreatingRelay] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const settings = SecureAppSettings.get();
  
  const [relayUrl, setRelayUrl] = useState(settings.relayUrl);
  const [sessionId, setSessionId] = useState(settings.syncSessionId);
  const [relayCertificatePin, setRelayCertificatePin] = useState(
    settings.relayCertificatePin || '',
  );

  const normalizePin = (value: string) => value.trim();

  const isPinFormatValid = (value: string) =>
    /^sha256\/[A-Za-z0-9+/=_-]+$/.test(value);

  const createSessionId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const onSave = async () => {
    const normalizedRelayUrl = relayUrl.trim();
    const normalizedSessionId = sessionId.trim();
    const normalizedPin = normalizePin(relayCertificatePin);
    await SecureAppSettings.update({
      relayUrl: normalizedRelayUrl,
      syncSessionId: normalizedSessionId,
      relayCertificatePin: normalizedPin,
    }, SecurityModule.db);
  };

  const onSync = async () => {
    const normalizedRelayUrl = relayUrl.trim();
    const normalizedSessionId = sessionId.trim();
    const normalizedPin = normalizePin(relayCertificatePin);

    if (!normalizedRelayUrl || !normalizedSessionId) {
      setStatus({ type: 'error', message: t('sync.err_missing') });
      return;
    }

    if (!/^https:\/\//i.test(normalizedRelayUrl)) {
      setStatus({ type: 'error', message: t('sync.err_url') });
      return;
    }
    if (!normalizedPin) {
      setStatus({ type: 'error', message: t('sync.err_pin_required') });
      return;
    }
    if (!isPinFormatValid(normalizedPin)) {
      setStatus({ type: 'error', message: t('sync.err_pin_format') });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: t('sync.status_syncing') });
    const attemptAt = new Date().toISOString();
    try {
        await SecureAppSettings.update({
          relayUrl: normalizedRelayUrl,
          syncSessionId: normalizedSessionId,
          relayCertificatePin: normalizedPin,
          syncHealth: {
            ...SecureAppSettings.get().syncHealth,
            lastSyncAttemptAt: attemptAt,
            lastSyncError: '',
          },
        }, SecurityModule.db);

        const rootSecret = await SecurityModule.getActiveSyncRootSecret();
        if (!rootSecret) {
          throw new Error(t('sync.err_locked'));
        }

        const itemsBeforeSync = await SecurityModule.getAllItems();
        await SyncManager.pullAndMerge(rootSecret as any, itemsBeforeSync, SecurityModule.db);

        const latestItems = await SecurityModule.getAllItems();
        const pushed = await SyncManager.push(rootSecret as any, latestItems, SecurityModule.db);
        if (!pushed) {
          throw new Error(t('sync.err_failed'));
        }

        setStatus({ type: 'success', message: t('sync.success') });
        await SecureAppSettings.update({
          syncHealth: {
            ...SecureAppSettings.get().syncHealth,
            relayReachable: true,
            relayCheckedAt: new Date().toISOString(),
            lastSyncAttemptAt: attemptAt,
            lastSyncSuccessAt: new Date().toISOString(),
            lastSyncError: '',
          },
        }, SecurityModule.db);
        Alert.alert(t('sync.title'), t('sync.success'));
    } catch (e) {
        console.error('[SyncSettings] Sync failed:', e);
        const message = e instanceof Error ? e.message : t('sync.err_failed');
        setStatus({ type: 'error', message });
        await SecureAppSettings.update({
          syncHealth: {
            ...SecureAppSettings.get().syncHealth,
            relayReachable: false,
            relayCheckedAt: new Date().toISOString(),
            lastSyncAttemptAt: attemptAt,
            lastSyncError: message,
          },
        }, SecurityModule.db);
    } finally {
        setLoading(false);
    }
  };

  const onCreateRelayServer = async () => {
    const normalizedRelayUrl = relayUrl.trim();
    const normalizedPin = normalizePin(relayCertificatePin);
    if (!/^https:\/\//i.test(normalizedRelayUrl)) {
      setStatus({ type: 'error', message: t('sync.err_url') });
      return;
    }
    if (!normalizedPin) {
      setStatus({ type: 'error', message: t('sync.err_pin_required') });
      return;
    }
    if (!isPinFormatValid(normalizedPin)) {
      setStatus({ type: 'error', message: t('sync.err_pin_format') });
      return;
    }

    const generatedSessionId = createSessionId();
    setCreatingRelay(true);
    setStatus({ type: 'info', message: t('sync.status_creating_server') });
    try {
      const res = await fetch(`${normalizedRelayUrl}/v1/sync/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: generatedSessionId }),
      });

      if (!res.ok) {
        throw new Error(`relay_create_failed_${res.status}`);
      }

      const payload = (await res.json()) as { sessionId?: string };
      const createdSessionId = (payload?.sessionId || generatedSessionId).trim();
      setSessionId(createdSessionId);

      await SecureAppSettings.update(
        {
          relayUrl: normalizedRelayUrl,
          syncSessionId: createdSessionId,
          relayCertificatePin: normalizedPin,
          syncLastSequence: 0,
        },
        SecurityModule.db,
      );

      setStatus({
        type: 'success',
        message: t('sync.server_create_success', { sessionId: createdSessionId }),
      });
    } catch {
      try {
        const healthRes = await fetch(`${normalizedRelayUrl}/health`);
        if (!healthRes.ok) {
          throw new Error(t('sync.self_hosted_health_fail'));
        }

        setSessionId(generatedSessionId);
        await SecureAppSettings.update(
          {
            relayUrl: normalizedRelayUrl,
            syncSessionId: generatedSessionId,
            relayCertificatePin: normalizedPin,
            syncLastSequence: 0,
          },
          SecurityModule.db,
        );

        setStatus({
          type: 'info',
          message: t('sync.server_create_fallback', { sessionId: generatedSessionId }),
        });
      } catch (e) {
        const message =
          e instanceof Error ? e.message : t('sync.server_create_failed');
        setStatus({ type: 'error', message });
      }
    } finally {
      setCreatingRelay(false);
    }
  };

  const onCheckRelay = async () => {
    const normalizedRelayUrl = relayUrl.trim();
    if (!/^https:\/\//i.test(normalizedRelayUrl)) {
      setStatus({ type: 'error', message: t('sync.err_url') });
      return;
    }
    setCheckingRelay(true);
    try {
      const res = await fetch(`${normalizedRelayUrl}/health`);
      if (!res.ok) {
        throw new Error(`${t('sync.self_hosted_health_fail')} (${res.status})`);
      }
      await SecureAppSettings.update({
        syncHealth: {
          ...SecureAppSettings.get().syncHealth,
          relayReachable: true,
          relayCheckedAt: new Date().toISOString(),
          lastSyncError: '',
        },
      }, SecurityModule.db);
      setStatus({ type: 'success', message: t('sync.self_hosted_health_ok') });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t('sync.self_hosted_health_fail');
      await SecureAppSettings.update({
        syncHealth: {
          ...SecureAppSettings.get().syncHealth,
          relayReachable: false,
          relayCheckedAt: new Date().toISOString(),
          lastSyncError: message,
        },
      }, SecurityModule.db);
      setStatus({ type: 'error', message });
    } finally {
      setCheckingRelay(false);
    }
  };

  const statusCardDynamicStyle =
    status
      ? {
          backgroundColor:
            status.type === 'error'
              ? theme.redBg || 'rgba(239,68,68,0.10)'
              : status.type === 'success'
              ? theme.sageLight
              : theme.inputBg,
          borderColor:
            status.type === 'error'
              ? 'rgba(239,68,68,0.28)'
              : status.type === 'success'
              ? theme.sageMid
              : theme.cardBorder,
        }
      : null;

  const statusTextDynamicStyle =
    status
      ? {
          color:
            status.type === 'error'
              ? theme.red || '#ef4444'
              : status.type === 'success'
              ? theme.navy
              : theme.muted,
        }
      : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[styles.title, { color: theme.navy }]}>{t('sync.title')}</Text>
      <Text style={[styles.info, { color: theme.muted }]}>{t('sync.info')}</Text>
      <View style={[styles.helpCard, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.helpTitle, { color: theme.navy }]}>{t('sync.how_title')}</Text>
        <Text style={[styles.helpText, { color: theme.muted }]}>{t('sync.how_body')}</Text>
        <Text style={[styles.helpText, styles.helpTextSecondary, { color: theme.muted }]}>
          {t('sync.self_hosted_hint')}
        </Text>
      </View>

      <View
        style={[
          styles.securityNotice,
          {
            backgroundColor: theme.inputBg,
            borderColor: theme.cardBorder,
          },
        ]}
      >
        <Text style={[styles.securityNoticeTitle, { color: theme.navy }]}>
          {t('sync.security_notice_title')}
        </Text>
        <Text style={[styles.securityNoticeText, { color: theme.muted }]}>
          {t('sync.security_notice_body')}
        </Text>
      </View>
      
      <Text style={[styles.label, { color: theme.navy }]}>{t('sync.relay_url')}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBg, color: theme.navy, borderColor: theme.cardBorder }]}
        value={relayUrl}
        onChangeText={setRelayUrl}
        onBlur={onSave}
        placeholder="https://..."
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        accessibilityLabel={t('sync.relay_url')}
      />

      <Text style={[styles.label, { color: theme.navy }]}>{t('sync.certificate_pin')}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBg, color: theme.navy, borderColor: theme.cardBorder }]}
        value={relayCertificatePin}
        onChangeText={setRelayCertificatePin}
        onBlur={onSave}
        placeholder="sha256/..."
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('sync.certificate_pin')}
      />

      <Text style={[styles.label, { color: theme.navy }]}>{t('sync.session_id')}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.inputBg, color: theme.navy, borderColor: theme.cardBorder }]}
        value={sessionId}
        onChangeText={setSessionId}
        onBlur={onSave}
        placeholder="UUID..."
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        accessibilityLabel={t('sync.session_id')}
      />

      {settings.syncLastSequence > 0 && (
         <Text style={[styles.meta, { color: theme.sage }]}>
            {t('sync.last_sync', { date: new Date().toLocaleDateString() })} (Seq: {settings.syncLastSequence})
         </Text>
      )}

      {status && (
        <View style={[styles.statusCard, statusCardDynamicStyle]}>
          <Text style={[styles.status, statusTextDynamicStyle]}>
            {status.message}
          </Text>
        </View>
      )}

      <TouchableOpacity 
         style={[styles.btn, { backgroundColor: theme.sage }]}
         onPress={onSync}
         disabled={loading}
         accessibilityRole="button"
         accessibilityLabel={t('sync.btn_sync')}
      >
        {loading ? (
            <ActivityIndicator color={theme.white || '#fff'} />
        ) : (
            <Text style={[styles.btnText, { color: theme.white || '#fff' }]}>{t('sync.btn_sync')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.btn,
          styles.secondaryBtn,
          { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
        ]}
        onPress={onCreateRelayServer}
        disabled={creatingRelay}
        accessibilityRole="button"
        accessibilityLabel={t('sync.create_server')}
      >
        {creatingRelay ? (
          <ActivityIndicator color={theme.navy} />
        ) : (
          <Text style={[styles.btnText, { color: theme.navy }]}>
            {t('sync.create_server')}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.btn,
          styles.secondaryBtn,
          { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
        ]}
        onPress={onCheckRelay}
        disabled={checkingRelay}
        accessibilityRole="button"
        accessibilityLabel={t('sync.self_hosted_health_check')}
      >
        {checkingRelay ? (
          <ActivityIndicator color={theme.navy} />
        ) : (
          <Text style={[styles.btnText, { color: theme.navy }]}>
            {t('sync.self_hosted_health_check')}
          </Text>
        )}
      </TouchableOpacity>
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
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  info: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 18,
  },
  helpCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  helpText: {
    fontSize: 12,
    lineHeight: 18,
  },
  helpTextSecondary: {
    marginTop: 8,
  },
  securityNotice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  securityNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  securityNoticeText: {
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    fontSize: 14,
  },
  meta: {
    fontSize: 11,
    marginBottom: 12,
  },
  status: {
    fontSize: 12,
    lineHeight: 18,
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  btn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtn: {
    borderWidth: 1,
    marginTop: 10,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  }
});
