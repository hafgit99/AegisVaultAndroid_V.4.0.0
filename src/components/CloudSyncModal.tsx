import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CloudSyncModule } from '../CloudSyncModule';
import { useTranslation } from 'react-i18next';

const C = {
  bg: '#F0EEE9',
  navy: '#101828',
  sage: '#72886f',
  sageLight: 'rgba(114,136,111,0.12)',
  muted: 'rgba(16,24,40,0.45)',
  card: 'rgba(255,255,255,0.45)',
  inputBg: 'rgba(255,255,255,0.6)',
  cardBorder: 'rgba(255,255,255,0.55)',
  green: '#22c55e',
  red: '#ef4444',
};

export const CloudSyncModal = ({ visible, onClose, onRefresh, theme }: any) => {
  const { t } = useTranslation();
  const cc = { ...C, ...(theme || {}) };
  const isDark = String(cc.bg || '').toLowerCase() === '#0b1220';
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [authType, setAuthType] = useState<'Bearer' | 'Basic'>('Bearer');
  const [password, setPassword] = useState(''); // Encrypt/Decrypt password
  const [certificatePin, setCertificatePin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSync = async (direction: 'up' | 'down') => {
    const safeUrl = url.trim();
    if (!safeUrl.startsWith('https://')) {
      Alert.alert(t('cloud.error'), t('cloud.err_url'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('cloud.error'), t('cloud.err_len'));
      return;
    }
    const safePin = certificatePin.trim();
    const validPin = /^sha256\/[A-Za-z0-9+/]{43}=$/.test(safePin);
    if (!validPin) {
      Alert.alert(
        t('cloud.error'),
        'Certificate pin zorunludur. Format: sha256/<base64>',
      );
      return;
    }

    setLoading(true);
    try {
      if (direction === 'up') {
        await CloudSyncModule.syncToCloud(
          safeUrl,
          token,
          authType,
          password,
          safePin,
        );
        Alert.alert(t('cloud.success'), t('cloud.success_up'));
      } else {
        const res = await CloudSyncModule.syncFromCloud(
          safeUrl,
          token,
          authType,
          password,
          safePin,
        );
        if (onRefresh) onRefresh();
        Alert.alert(
          t('cloud.success'),
          t('cloud.success_down', {
            imported: res.imported,
            skipped: res.skipped,
          }),
        );
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
        <View style={[st.container, { backgroundColor: cc.bg || '#0b1220' }]}>
          <View style={st.header}>
            <Text style={[st.title, { color: cc.navy }]}>
              {t('cloud.title')}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Text style={[st.closeBtn, { color: cc.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={st.content}>
            <Text style={[st.label, { color: cc.muted }]}>
              {t('cloud.url_label')}
            </Text>
            <TextInput
              style={[
                st.input,
                {
                  backgroundColor: cc.inputBg,
                  borderColor: cc.cardBorder || 'rgba(148,163,184,0.25)',
                  color: cc.navy,
                },
              ]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://nextcloud.example.com/remote.php/webdav/aegis.aegis"
              placeholderTextColor={cc.muted}
              autoCapitalize="none"
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginTop: 14,
              }}
            >
              <Text style={[st.label, { color: cc.muted }]}>
                {t('cloud.token_label')}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setAuthType(authType === 'Bearer' ? 'Basic' : 'Bearer')
                }
              >
                <Text style={[st.toggleText, { color: cc.sage }]}>
                  {authType} 🔄
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                st.input,
                {
                  backgroundColor: cc.inputBg,
                  borderColor: cc.cardBorder || 'rgba(148,163,184,0.25)',
                  color: cc.navy,
                },
              ]}
              value={token}
              onChangeText={setToken}
              placeholder={
                authType === 'Bearer'
                  ? 'API Token'
                  : 'username:password (base64 optional)'
              }
              placeholderTextColor={cc.muted}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={[st.label, { color: cc.muted }]}>
              {t('cloud.pw_label')}
            </Text>
            <TextInput
              style={[
                st.input,
                {
                  backgroundColor: cc.inputBg,
                  borderColor: cc.cardBorder || 'rgba(148,163,184,0.25)',
                  color: cc.navy,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder={t('cloud.pw_ph')}
              placeholderTextColor={cc.muted}
              secureTextEntry
            />

            <Text style={[st.label, { color: cc.muted }]}>
              TLS Certificate Pin
            </Text>
            <TextInput
              style={[
                st.input,
                {
                  backgroundColor: cc.inputBg,
                  borderColor: cc.cardBorder || 'rgba(148,163,184,0.25)',
                  color: cc.navy,
                },
              ]}
              value={certificatePin}
              onChangeText={setCertificatePin}
              placeholder="sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
              placeholderTextColor={cc.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={[st.infoBox, { backgroundColor: cc.sageLight }]}>
              <Text style={[st.infoText, { color: cc.navy }]}>
                {t('cloud.info')}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator
                size="large"
                color={cc.sage}
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={st.buttonRow}>
                <TouchableOpacity
                  style={[st.btn, { backgroundColor: cc.sage }]}
                  onPress={() => handleSync('up')}
                >
                  <Text style={st.btnText}>{t('cloud.btn_up')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    st.btn,
                    { backgroundColor: isDark ? '#1f2937' : cc.navy },
                  ]}
                  onPress={() => handleSync('down')}
                >
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
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#F0EEE9',
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: C.navy },
  closeBtn: { fontSize: 24, color: C.muted, padding: 4 },
  content: { padding: 20, paddingTop: 10 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: C.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: C.navy,
    borderWidth: 1,
    borderColor: C.cardBorder,
    fontWeight: '500',
  },
  toggleText: { fontSize: 12, fontWeight: '700', color: C.sage },
  infoBox: {
    backgroundColor: 'rgba(114,136,111,0.12)',
    borderRadius: 14,
    padding: 14,
    marginTop: 20,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#4a5b48',
    lineHeight: 18,
    fontWeight: '600',
  },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
