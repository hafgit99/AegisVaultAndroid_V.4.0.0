import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LegalTexts } from '../locales/legal';
import { useTheme } from '../ThemeContext';

interface Props {
  visible: boolean;
  type: 'terms' | 'privacy' | null;
  onClose: () => void;
}

export const LegalModal = ({ visible, type, onClose }: Props) => {
  const { i18n, t } = useTranslation();
  const { colors: C } = useTheme();
  
  if (!visible || !type) return null;

  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const textContent = LegalTexts[lang][type];
  const title = type === 'terms' ? t('legal.terms') : t('legal.privacy');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[st.container, { backgroundColor: C.bg }]}>
        <View style={[st.header, { borderBottomColor: C.cardBorder }]}>
          <Text style={[st.title, { color: C.navy }]}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={st.closeBtn}>
            <Text style={[st.closeIcon, { color: C.muted }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent}>
          <Text style={[st.bodyText, { color: C.navy }]}>{textContent}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    padding: 20, borderBottomWidth: 1
  },
  title: { fontSize: 20, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 24 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  bodyText: { fontSize: 14, lineHeight: 22 }
});
