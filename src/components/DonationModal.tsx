import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Clipboard, Dimensions
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../ThemeContext';

const { width } = Dimensions.get('window');

const CRYPTO_ADDRESSES = {
  sol: '81H1rKZHjpSsnr6Epumw9XVTfqAnqSHcTKm7D3VsEd74',
  eth: '0x4bd17Cc073D08E3E021Fd315d840554c840843E1',
  usdt_eth: '0x4bd17Cc073D08E3E021Fd315d840554c840843E1',
  xrp: 'rfXzWPGKFMGdaYsqFCiyZHhRXF741Snx8N',
  tron: 'TQBz3q8Ddjap3K8QdFQHtJKBxbvXMCi62E',
  bch: 'qzfd46kp4tguu8pxrs6gnux0qxndhnqk8sa83q08wm',
  ltc: 'LZC3egqj1K9aZ3i42HbsRWK7m1SbUgXmak',
  btc: 'bc1qqsuljwzs32ckkqdrsdus7wgqzuetty3g0x47l7',
  xtz: 'tz1Tij1ujzkEyvA949x1q7EW17s6pUNbEUdV',
};

interface DonationModalProps {
  visible: boolean;
  onClose: () => void;
}

export const DonationModal: React.FC<DonationModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const [selected, setSelected] = useState<keyof typeof CRYPTO_ADDRESSES>('btc');
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const address = CRYPTO_ADDRESSES[selected];

  const copy = () => {
    Clipboard.setString(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={[s.content, { backgroundColor: C.bg }]}>
          <View style={s.header}>
            <Text style={[s.headerTitle, { color: C.navy }]}>{t('donation.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[s.closeX, { color: C.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[s.subtitle, { color: C.sage }]}>{t('donation.subtitle')}</Text>
            <Text style={[s.description, { color: C.navy }]}>{t('donation.description')}</Text>

            <View style={[s.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
              <Text style={[s.label, { color: C.muted }]}>{t('donation.select_coin')}</Text>
              <View style={s.assetContainer}>
                {(Object.keys(CRYPTO_ADDRESSES) as Array<keyof typeof CRYPTO_ADDRESSES>).map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.assetChip, { backgroundColor: C.inputBg, borderColor: C.cardBorder }, selected === key && { backgroundColor: C.sage, borderColor: C.sage }]}
                    onPress={() => {
                      setSelected(key);
                      setShowQR(false);
                    }}
                  >
                    <Text style={[s.assetText, { color: C.navy }, selected === key && { color: C.white }]}>
                      {t(`donation.assets.${key}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[s.addressCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
              <View style={s.addressRow}>
                <Text style={[s.addressTitle, { color: C.navy }]}>{t(`donation.assets.${selected}`)}</Text>
                <TouchableOpacity onPress={() => setShowQR(!showQR)} style={[s.qrToggle, { backgroundColor: C.sageLight }]}>
                  <Text style={[s.qrToggleText, { color: C.sage }]}>{showQR ? 'Hide QR' : 'Show QR'}</Text>
                </TouchableOpacity>
              </View>

              {showQR && (
                <View style={s.qrContainer}>
                  <View style={[s.qrWrapper, { backgroundColor: '#FFFFFF' }]}>
                    <QRCode
                      value={address}
                      size={180}
                      color="#000000"
                      backgroundColor="transparent"
                    />
                  </View>
                </View>
              )}

              <View style={[s.addressBox, { backgroundColor: C.bg, borderColor: C.divider }]}>
                <Text style={[s.addressText, { color: C.navy }]} selectable>{address}</Text>
              </View>

              <TouchableOpacity 
                style={[s.copyBtn, { backgroundColor: C.sage }, copied && { backgroundColor: C.green }]} 
                onPress={copy}
                activeOpacity={0.7}
              >
                <Text style={[s.copyBtnText, { color: C.white }]}>
                  {copied ? `✓ ${t('donation.addr_copied')}` : `📋 ${t('donation.copy_addr')}`}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  content: { 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    padding: 24, 
    maxHeight: '90%' 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  closeX: { fontSize: 24, padding: 4 },
  subtitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 13, opacity: 0.7, lineHeight: 20, marginBottom: 20 },
  card: { borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
  assetContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assetChip: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 10, 
    borderWidth: 1, 
  },
  assetText: { fontSize: 12, fontWeight: '600' },
  addressCard: { 
    borderRadius: 20, 
    padding: 20, 
    borderWidth: 1, 
    alignItems: 'center'
  },
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 },
  addressTitle: { fontSize: 14, fontWeight: '700' },
  qrToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  qrToggleText: { fontSize: 11, fontWeight: '700' },
  qrContainer: { padding: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  qrWrapper: { padding: 12, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  addressBox: { 
    width: '100%', 
    padding: 14, 
    borderRadius: 12, 
    marginBottom: 16,
    borderWidth: 1,
  },
  addressText: { 
    fontSize: 13, 
    fontFamily: 'monospace', 
    textAlign: 'center',
    fontWeight: '500'
  },
  copyBtn: { 
    width: '100%', 
    paddingVertical: 14, 
    borderRadius: 14, 
    alignItems: 'center' 
  },
  copyBtnText: { fontWeight: '700', fontSize: 14 },
});
