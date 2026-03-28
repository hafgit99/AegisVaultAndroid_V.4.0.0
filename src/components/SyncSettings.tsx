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
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const settings = SecureAppSettings.get();
  
  const [relayUrl, setRelayUrl] = useState(settings.relayUrl);
  const [sessionId, setSessionId] = useState(settings.syncSessionId);

  const onSave = async () => {
    await SecureAppSettings.update({
        relayUrl,
        syncSessionId: sessionId
    }, SecurityModule.db);
  };

  const onSync = async () => {
    const normalizedRelayUrl = relayUrl.trim();
    const normalizedSessionId = sessionId.trim();

    if (!normalizedRelayUrl || !normalizedSessionId) {
      setStatus({ type: 'error', message: t('sync.err_missing') });
      return;
    }

    if (!/^https?:\/\//i.test(normalizedRelayUrl)) {
      setStatus({ type: 'error', message: t('sync.err_url') });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: t('sync.status_syncing') });
    try {
        await SecureAppSettings.update({
          relayUrl: normalizedRelayUrl,
          syncSessionId: normalizedSessionId,
        }, SecurityModule.db);

        const rootSecret = await SecurityModule.getActiveSyncRootSecret();
        if (!rootSecret) {
          throw new Error(t('sync.err_locked'));
        }

        const itemsBeforeSync = await SecurityModule.getAllItems();
        await SyncManager.pullAndMerge(rootSecret, itemsBeforeSync, SecurityModule.db);

        const latestItems = await SecurityModule.getAllItems();
        const pushed = await SyncManager.push(rootSecret, latestItems, SecurityModule.db);
        if (!pushed) {
          throw new Error(t('sync.err_failed'));
        }

        setStatus({ type: 'success', message: t('sync.success') });
        Alert.alert(t('sync.title'), t('sync.success'));
    } catch (e) {
        console.error('[SyncSettings] Sync failed:', e);
        const message = e instanceof Error ? e.message : t('sync.err_failed');
        setStatus({ type: 'error', message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[styles.title, { color: theme.navy }]}>{t('sync.title')}</Text>
      <Text style={[styles.info, { color: theme.muted }]}>{t('sync.info')}</Text>
      <View style={[styles.helpCard, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.helpTitle, { color: theme.navy }]}>{t('sync.how_title')}</Text>
        <Text style={[styles.helpText, { color: theme.muted }]}>{t('sync.how_body')}</Text>
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
      />

      {settings.syncLastSequence > 0 && (
         <Text style={[styles.meta, { color: theme.sage }]}>
            {t('sync.last_sync', { date: new Date().toLocaleDateString() })} (Seq: {settings.syncLastSequence})
         </Text>
      )}

      {status && (
        <Text
          style={[
            styles.status,
            {
              color:
                status.type === 'error'
                  ? theme.red || '#ef4444'
                  : status.type === 'success'
                    ? theme.sage
                    : theme.muted,
            },
          ]}
        >
          {status.message}
        </Text>
      )}

      <TouchableOpacity 
         style={[styles.btn, { backgroundColor: theme.sage }]}
         onPress={onSync}
         disabled={loading}
      >
        {loading ? (
            <ActivityIndicator color={theme.white || '#fff'} />
        ) : (
            <Text style={[styles.btnText, { color: theme.white || '#fff' }]}>{t('sync.btn_sync')}</Text>
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
    marginBottom: 12,
    lineHeight: 18,
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
  }
});
