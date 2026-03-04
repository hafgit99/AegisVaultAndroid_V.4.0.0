import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { CloudSyncModule } from '../CloudSyncModule';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeContext';

export const CloudSyncModal = ({ visible, onClose, onRefresh }: any) => {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [authType, setAuthType] = useState<'Bearer' | 'Basic'>('Bearer');
  const [password, setPassword] = useState(''); // Encrypt/Decrypt password
  const [loading, setLoading] = useState(false);

  const handleSync = async (direction: 'up' | 'down') => {
    if (!url.startsWith('https://')) {
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
        <View style={[st.container, { backgroundColor: C.bg }]}>
          <View style={st.header}>
            <Text style={[st.title, { color: C.navy }]}>{t('cloud.title')}</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}><Text style={[st.closeBtn, { color: C.muted }]}>✕</Text></TouchableOpacity>
          </View>

          <View style={st.content}>
            <Text style={[st.label, { color: C.muted }]}>{t('cloud.url_label')}</Text>
            <TextInput
              style={[st.input, { backgroundColor: C.inputBg, color: C.navy, borderColor: C.cardBorder }]} value={url} onChangeText={setUrl}
              placeholder="https://nextcloud.example.com/remote.php/webdav/aegis.aegis"
              placeholderTextColor={C.muted} autoCapitalize="none"
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
              <Text style={[st.label, { color: C.muted }]}>{t('cloud.token_label')}</Text>
              <TouchableOpacity onPress={() => setAuthType(authType === 'Bearer' ? 'Basic' : 'Bearer')}>
                <Text style={[st.toggleText, { color: C.sage }]}>{authType} 🔄</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[st.input, { backgroundColor: C.inputBg, color: C.navy, borderColor: C.cardBorder }]} value={token} onChangeText={setToken}
              placeholder={authType === 'Bearer' ? 'API Token' : 'username:password (base64 optional)'}
              placeholderTextColor={C.muted} secureTextEntry autoCapitalize="none"
            />

            <Text style={[st.label, { color: C.muted }]}>{t('cloud.pw_label')}</Text>
            <TextInput
              style={[st.input, { backgroundColor: C.inputBg, color: C.navy, borderColor: C.cardBorder }]} value={password} onChangeText={setPassword}
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
    width: '100%', borderRadius: 24, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '800' },
  closeBtn: { fontSize: 24, padding: 4 },
  content: { padding: 20, paddingTop: 10 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  input: {
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, borderWidth: 1, fontWeight: '500',
  },
  toggleText: { fontSize: 12, fontWeight: '700' },
  infoBox: {
    backgroundColor: 'rgba(114,136,111,0.12)', borderRadius: 14, padding: 14, marginTop: 20, marginBottom: 10,
  },
  infoText: { fontSize: 12, color: '#4a5b48', lineHeight: 18, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
