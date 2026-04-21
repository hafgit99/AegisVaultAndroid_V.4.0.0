import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Camera, CameraType } from 'react-native-camera-kit';
import { parseOtpauthURI } from '../TOTPModule';

interface QRScannerProps {
  visible: boolean;
  theme: any;
  onClose: () => void;
  onScanSuccess: (data: any) => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  visible,
  theme,
  onClose,
  onScanSuccess,
}) => {
  const { t } = useTranslation();
  const [isScanning, setIsScanning] = useState(true);

  const handleBarCodeRead = (event: any) => {
    if (!isScanning) return;
    
    const uri = event.nativeEvent?.codeStringValue || event.data;
    if (!uri) return;

    setIsScanning(false);
    const parsed = parseOtpauthURI(uri);

    if (parsed) {
      onScanSuccess(parsed);
      onClose();
    } else {
      Alert.alert(
          t('qr_scanner.invalid'),
          t('qr_scanner.invalid_desc'),
          [{ text: t('vault.save'), onPress: () => setIsScanning(true) }]
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[styles.container, { backgroundColor: theme.navy || '#000' }]}>
        <View style={[styles.header, { backgroundColor: theme.card || '#1a1a1a', borderBottomColor: theme.cardBorder }, styles.headerBorder]}>
          <Text style={[styles.title, { color: theme.white }]}>{t('qr_scanner.title')}</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Kapat" accessibilityRole="button">
            <Text style={[styles.closeBtn, { color: theme.white }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.scannerContainer}>
          {isScanning ? (
            <Camera
              style={styles.camera}
              cameraType={CameraType.Back}
              scanBarcode={true}
              onReadCode={handleBarCodeRead}
              showFrame={true}
              laserColor={theme.primary || 'red'}
              frameColor={theme.divider || 'white'}
            />
          ) : (
             <View style={styles.scannerPlaceholder}>
                <Text style={styles.whiteText}>{t('qr_scanner.processing') || '...'}</Text>
             </View>
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.manualBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={onClose}
            accessibilityLabel={t('qr_scanner.manual')}
            accessibilityRole="button"
          >
            <Text style={[styles.manualBtnText, { color: theme.white }]}>{t('qr_scanner.manual')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  scannerContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  scannerPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  footer: {
    padding: 30,
    alignItems: 'center',
  },
  manualBtn: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  manualBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  headerBorder: {
    borderBottomWidth: 1,
  },
  whiteText: {
    color: 'white',
  },
});
