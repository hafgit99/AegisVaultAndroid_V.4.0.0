import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { CloudSyncModule } from '../CloudSyncModule';
import { useTranslation } from 'react-i18next';

const C = {
  navy: '#101828', sage: '#72886f', muted: 'rgba(16,24,40,0.45)',
  card: 'rgba(255,255,255,0.45)', inputBg: 'rgba(255,255,255,0.6)',
  green: '#22c55e', red: '#ef4444',
};

export const CloudSyncModal = ({ visible, onClose, onRefresh }: any) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [authType, setAuthType] = useState<'Bearer' | 'Basic'>('Bearer');
  const [password, setPassword] = useState(''); // Encrypt/Decrypt password
  const [loading, setLoading] = useState(false);

  const handleSync = async (direction: 'up' | 'down') => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert(t('cloud.error'), t('cloud.err_url'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('cloud.error'), t('cloud.err_len'));
      return;
    }

    setLoading(true);
    try {
      if (direction === 'up') {
        await CloudSyncModule.syncToCloud(url, token, authType, password);
        Alert.alert(t('cloud.success'), t('cloud.success_up'));
      } else {
        const res = await CloudSyncModule.syncFromCloud(url, token, authType, password);
        if (onRefresh) onRefresh();
        Alert.alert(t('cloud.success'), t('cloud.success_down', { imported: res.imported, skipped: res.skipped }));
      }
      onClose();
    } catch (e: any) {
      Alert.alert(t('cloud.err_sync'), e.message || 'Error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={st.overlay}>
        <View style={st.container}>
          <View style={st.header}>
            <Text style={st.title}>{t('cloud.title')}</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}><Text style={st.closeBtn}>✕</Text></TouchableOpacity>
          </View>

          <View style={st.content}>
            <Text style={st.label}>{t('cloud.url_label')}</Text>
            <TextInput
              style={st.input} value={url} onChangeText={setUrl}
              placeholder="https://nextcloud.example.com/remote.php/webdav/aegis.aegis"
              placeholderTextColor={C.muted} autoCapitalize="none"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
              <Text style={st.label}>{t('cloud.token_label')}</Text>
              <TouchableOpacity onPress={() => setAuthType(authType === 'Bearer' ? 'Basic' : 'Bearer')}>
                <Text style={st.toggleText}>{authType} 🔄</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.input} value={token} onChangeText={setToken}
              placeholder={authType === 'Bearer' ? 'API Token' : 'username:password (base64 optional)'}
              placeholderTextColor={C.muted} secureTextEntry autoCapitalize="none"
            />

            <Text style={st.label}>{t('cloud.pw_label')}</Text>
            <TextInput
              style={st.input} value={password} onChangeText={setPassword}
              placeholder={t('cloud.pw_ph')} placeholderTextColor={C.muted} secureTextEntry
            />

            <View style={st.infoBox}>
              <Text style={st.infoText}>
                {t('cloud.info')}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={C.sage} style={{ marginVertical: 20 }} />
            ) : (
              <View style={st.buttonRow}>
                <TouchableOpacity style={[st.btn, { backgroundColor: C.sage }]} onPress={() => handleSync('up')}>
                  <Text style={st.btnText}>{t('cloud.btn_up')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btn, { backgroundColor: C.navy }]} onPress={() => handleSync('down')}>
                  <Text style={st.btnText}>{t('cloud.btn_down')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  container: {
    backgroundColor: '#F0EEE9', width: '100%', borderRadius: 24, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: C.navy },
  closeBtn: { fontSize: 24, color: C.muted, padding: 4 },
  content: { padding: 20, paddingTop: 10 },
  label: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: C.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: C.navy, borderWidth: 1, borderColor: C.cardBorder, fontWeight: '500',
  },
  toggleText: { fontSize: 12, fontWeight: '700', color: C.sage },
  infoBox: {
    backgroundColor: 'rgba(114,136,111,0.12)', borderRadius: 14, padding: 14, marginTop: 20, marginBottom: 10,
  },
  infoText: { fontSize: 12, color: '#4a5b48', lineHeight: 18, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
