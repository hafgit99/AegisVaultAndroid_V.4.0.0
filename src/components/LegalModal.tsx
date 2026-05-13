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
  const primaryText = cc.textPrimary || cc.navy;
  const secondaryText = cc.textSecondary || cc.muted;
  const elevatedCard = cc.cardElevated || cc.card;

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
          <View style={st.titleBlock}>
            <Text style={[st.eyebrow, { color: secondaryText }]}>
              {t('legal.design_eyebrow')}
            </Text>
            <Text style={[st.title, { color: primaryText }]}>{title}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Text style={[st.closeIcon, { color: secondaryText }]}>x</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
          <View
            style={[
              st.documentCard,
              {
                backgroundColor: elevatedCard,
                borderColor: cc.cardBorder || cc.border || C.border,
              },
            ]}
          >
            <Text style={[st.bodyText, { color: primaryText }]}>{textContent}</Text>
          </View>
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
  titleBlock: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: { fontSize: 20, fontWeight: '800', color: C.navy },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 24, color: C.muted },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  documentCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  bodyText: { fontSize: 14, lineHeight: 22, color: C.navy },
});
