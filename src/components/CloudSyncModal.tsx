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
  card: 'rgba(255,255,255,0.98)',
  inputBg: 'rgba(255,255,255,0.95)',
  cardBorder: 'rgba(16,24,40,0.12)',
  green: '#22c55e',
  red: '#ef4444',
};

export const CloudSyncModal = ({ visible, onClose, onRefresh, theme }: any) => {
  const { t } = useTranslation();
  const cc = { ...C, ...(theme || {}) };
  const isDark = String(cc.bg || '').toLowerCase() === '#0b1220';
  const primaryText = cc.textPrimary || cc.navy;
  const secondaryText = cc.textSecondary || cc.muted;
  const tertiaryText = cc.textTertiary || cc.muted;
  const elevatedCard = cc.cardElevated || cc.card;
  const accentBg = cc.bgAccent || cc.sageLight;
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [authType, setAuthType] = useState<'Bearer' | 'Basic'>('Bearer');
  const [password, setPassword] = useState(''); // Encrypt/Decrypt password
  const [certificatePin, setCertificatePin] = useState('');
  const [loading, setLoading] = useState(false);
  const tokenRowStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  } as const;
  const loadingStyle = { marginVertical: 20 } as const;
  const downloadButtonStyle = {
    backgroundColor: isDark ? '#1f2937' : cc.navy,
  } as const;

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
        `${t('cloud.pin_required')} ${t('cloud.pin_format')}`,
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
            <Text style={[st.title, { color: primaryText }]}>
              {t('cloud.title')}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <Text style={[st.closeBtn, { color: tertiaryText }]}>x</Text>
            </TouchableOpacity>
          </View>

          <View style={st.content}>
            <View
              style={[
                st.heroCard,
                {
                  backgroundColor: elevatedCard,
                  borderColor: cc.cardBorder,
                  shadowColor: cc.shadow || '#000000',
                },
              ]}
            >
              <Text style={[st.eyebrow, { color: tertiaryText }]}>
                {t('cloud.design_eyebrow')}
              </Text>
              <Text style={[st.heroTitle, { color: primaryText }]}>
                {t('cloud.design_title')}
              </Text>
              <Text style={[st.heroDesc, { color: secondaryText }]}>
                {t('cloud.design_desc')}
              </Text>
              <View style={st.trustRow}>
                {[
                  { label: t('cloud.design_https'), value: 'HTTPS' },
                  { label: t('cloud.design_pin'), value: 'SHA-256' },
                  { label: t('cloud.design_e2e'), value: 'E2E' },
                ].map(card => (
                  <View
                    key={card.label}
                    style={[
                      st.trustCard,
                      { backgroundColor: accentBg, borderColor: cc.cardBorder },
                    ]}
                  >
                    <Text style={[st.trustValue, { color: cc.sage }]}>
                      {card.value}
                    </Text>
                    <Text style={[st.trustLabel, { color: secondaryText }]}>
                      {card.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
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

            <View style={tokenRowStyle}>
              <Text style={[st.label, { color: cc.muted }]}>
                {t('cloud.token_label')}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setAuthType(authType === 'Bearer' ? 'Basic' : 'Bearer')
                }
              >
                <Text style={[st.toggleText, { color: cc.sage }]}>
                  {authType} / switch
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
              {t('cloud.pin_label')}
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
                style={loadingStyle}
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
                  style={[st.btn, downloadButtonStyle]}
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
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: { fontSize: 19, fontWeight: '900', marginTop: 5 },
  heroDesc: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  trustRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  trustCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 9,
  },
  trustValue: { fontSize: 12, fontWeight: '900' },
  trustLabel: { fontSize: 10, fontWeight: '700', lineHeight: 14, marginTop: 3 },
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
