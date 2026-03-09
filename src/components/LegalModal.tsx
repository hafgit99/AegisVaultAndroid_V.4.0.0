import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LegalTexts } from '../locales/legal';

const C = {
  navy: '#101828',
  sage: '#72886f',
  muted: 'rgba(16,24,40,0.45)',
  bg: '#F0EEE9',
  card: 'rgba(255,255,255,0.45)',
  border: 'rgba(255,255,255,0.55)',
};

interface Props {
  visible: boolean;
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
  theme?: any;
}

export const LegalModal = ({ visible, type, onClose, theme }: Props) => {
  const { i18n, t } = useTranslation();
  const cc = theme || C;

  if (!visible || !type) return null;

  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const textContent = LegalTexts[lang][type];
  const title = type === 'terms' ? t('legal.terms') : t('legal.privacy');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[st.container, { backgroundColor: cc.bg }]}>
        <View
          style={[
            st.header,
            { borderBottomColor: cc.border || cc.cardBorder || C.border },
          ]}
        >
          <Text style={[st.title, { color: cc.navy }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Text style={[st.closeIcon, { color: cc.muted }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
          <Text style={[st.bodyText, { color: cc.navy }]}>{textContent}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.navy },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 24, color: C.muted },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  bodyText: { fontSize: 14, lineHeight: 22, color: C.navy },
});
