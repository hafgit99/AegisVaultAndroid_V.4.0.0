/* eslint-disable react-native/no-inline-styles */
/**
 * PasskeySettings — Aegis Vault Android v4.02
 * UI for managing FIDO2 Passkey bindings and lifecycle.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PasskeyBindingService } from '../PasskeyBindingService';
import { SecurityModule } from '../SecurityModule';

export const PasskeySettings = ({ theme, onRefresh }: any) => {
  const { t } = useTranslation();
  const state = PasskeyBindingService.get();
  const bindings = Object.values(state.bindings);

  const onRevoke = async (id: string) => {
    await PasskeyBindingService.revokeBinding(id, 'user_requested', SecurityModule.db);
    if (onRefresh) onRefresh();
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[styles.title, { color: theme.navy }]}>{t('passkeys.title')}</Text>
      <Text style={[styles.info, { color: theme.muted }]}>{t('passkeys.info')}</Text>

      {bindings.length === 0 ? (
        <Text style={[styles.empty, { color: theme.muted }]}>Henüz bağlı passkey yok.</Text>
      ) : (
        bindings.map((b: any) => (
          <View key={b.credentialId} style={[styles.item, { borderColor: theme.cardBorder }]}>
            <View style={styles.content}>
              <Text style={[styles.name, { color: theme.navy }]}>{b.displayName || 'Unnamed Passkey'}</Text>
              <Text style={[styles.meta, { color: theme.muted }]}>
                 ID: ...{b.credentialId.slice(-8)} • {new Date(b.meta.createdAt).toLocaleDateString()}
              </Text>
              {PasskeyBindingService.getPolicyViolations(b.credentialId).length > 0 && (
                 <Text style={[styles.warn, { color: '#E53935' }]}>⚠️ POLICY VIOLATION</Text>
              )}
            </View>
            <TouchableOpacity 
              style={[styles.revBtn, { borderColor: '#E53935' }]}
              onPress={() => onRevoke(b.credentialId)}
            >
              <Text style={{ color: '#E53935', fontWeight: '700', fontSize: 11 }}>{t('passkeys.btn_revoke')}</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <TouchableOpacity 
         style={[styles.btn, { backgroundColor: theme.sage, marginTop: 16 }]}
         onPress={async () => { 
           // Implementation of FIDO2 Passkey Enrollment Mock for testing
           const id = `pk_${Date.now()}`;
           await PasskeyBindingService.saveBinding({
             credentialId: id,
             encryptedPayload: 'mock_payload',
             prfSalt: 'mock_salt',
             meta: {
               createdAt: new Date().toISOString(),
               lastUsedAt: new Date().toISOString(),
               version: 1,
               deviceLabel: 'Current Device'
             },
             eventLog: []
           }, SecurityModule.db);
           if (onRefresh) onRefresh();
           Alert.alert(t('passkeys.title'), 'Passkey başarıyla bağlandı (Test Modu).');
         }}
      >
        <Text style={styles.btnText}>{t('passkeys.btn_bind')}</Text>
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
    marginBottom: 16,
    lineHeight: 18,
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
