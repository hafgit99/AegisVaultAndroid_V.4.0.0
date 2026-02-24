import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Clipboard, Dimensions
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';

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

const C = {
  bg: '#F0EEE9', navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  card: 'rgba(255,255,255,0.45)', cardBorder: 'rgba(255,255,255,0.55)',
  white: '#fff', muted: 'rgba(16,24,40,0.45)', green: '#22c55e',
};

interface DonationModalProps {
  visible: boolean;
  onClose: () => void;
}

export const DonationModal: React.FC<DonationModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
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
        <View style={s.content}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{t('donation.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.subtitle}>{t('donation.subtitle')}</Text>
            <Text style={s.description}>{t('donation.description')}</Text>

            <View style={s.card}>
              <Text style={s.label}>{t('donation.select_coin')}</Text>
              <View style={s.assetContainer}>
                {(Object.keys(CRYPTO_ADDRESSES) as Array<keyof typeof CRYPTO_ADDRESSES>).map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.assetChip, selected === key && s.assetChipActive]}
                    onPress={() => {
                      setSelected(key);
                      setShowQR(false);
                    }}
                  >
                    <Text style={[s.assetText, selected === key && s.assetTextActive]}>
                      {t(`donation.assets.${key}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.addressCard}>
              <View style={s.addressRow}>
                <Text style={s.addressTitle}>{t(`donation.assets.${selected}`)}</Text>
                <TouchableOpacity onPress={() => setShowQR(!showQR)} style={s.qrToggle}>
                  <Text style={s.qrToggleText}>{showQR ? 'Hide QR' : 'Show QR'}</Text>
                </TouchableOpacity>
              </View>

              {showQR && (
                <View style={s.qrContainer}>
                  <View style={s.qrWrapper}>
                    <QRCode
                      value={address}
                      size={180}
                      color={C.navy}
                      backgroundColor="transparent"
                    />
                  </View>
                </View>
              )}

              <View style={s.addressBox}>
                <Text style={s.addressText} selectable>{address}</Text>
              </View>

              <TouchableOpacity 
                style={[s.copyBtn, copied && s.copyBtnSuccess]} 
                onPress={copy}
                activeOpacity={0.7}
              >
                <Text style={s.copyBtnText}>
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
    backgroundColor: C.bg, 
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
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.navy },
  closeX: { fontSize: 24, color: C.muted, padding: 4 },
  subtitle: { fontSize: 16, fontWeight: '700', color: C.sage, marginBottom: 8 },
  description: { fontSize: 13, color: C.navy, opacity: 0.7, lineHeight: 20, marginBottom: 20 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  label: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', marginBottom: 12 },
  assetContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  assetChip: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 10, 
    backgroundColor: 'rgba(255,255,255,0.6)', 
    borderWidth: 1, 
    borderColor: C.cardBorder 
  },
  assetChipActive: { backgroundColor: C.sage, borderColor: C.sage },
  assetText: { fontSize: 12, fontWeight: '600', color: C.navy },
  assetTextActive: { color: C.white },
  addressCard: { 
    backgroundColor: C.card, 
    borderRadius: 20, 
    padding: 20, 
    borderWidth: 1, 
    borderColor: C.cardBorder,
    alignItems: 'center'
  },
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 },
  addressTitle: { fontSize: 14, fontWeight: '700', color: C.navy },
  qrToggle: { backgroundColor: C.sageLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  qrToggleText: { fontSize: 11, fontWeight: '700', color: C.sage },
  qrContainer: { padding: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  qrWrapper: { padding: 12, backgroundColor: C.white, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  addressBox: { 
    width: '100%', 
    backgroundColor: 'rgba(16,24,40,0.04)', 
    padding: 14, 
    borderRadius: 12, 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,24,40,0.06)'
  },
  addressText: { 
    fontSize: 13, 
    color: C.navy, 
    fontFamily: 'monospace', 
    textAlign: 'center',
    fontWeight: '500'
  },
  copyBtn: { 
    width: '100%', 
    backgroundColor: C.sage, 
    paddingVertical: 14, 
    borderRadius: 14, 
    alignItems: 'center' 
  },
  copyBtnSuccess: { backgroundColor: C.green },
  copyBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
});
