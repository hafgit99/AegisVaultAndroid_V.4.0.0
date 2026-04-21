/**
 * DeviceTrustSettings Component - Root/Tamper Detection Policy Configuration
 * Bilingual UI for device risk management (Türkçe + English)
 * 
 * Cihaz Güveni Ayarları Bileşeni - Root/Tamper Algılama Politikası Yapılandırması
 * Cihaz riski yönetimi için iki dilli arayüz (Türkçe + İngilizce)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Button,
  useWindowDimensions
} from 'react-native';
import { SecurityModule } from '../SecurityModule';
import { IntegrityModule } from '../IntegrityModule';
import { SecureAppSettings } from '../SecureAppSettings';

interface DeviceTrustState {
  deviceTrustPolicy: 'strict' | 'moderate' | 'permissive';
  rootDetectionEnabled: boolean;
  rootBlocksVault: boolean;
  degradedDeviceAction: 'block' | 'warn' | 'allow';
  allowEmulator: boolean;
  requireBiometric: boolean;
}

interface DeviceRiskAssessment {
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  score: number;
  isRooted: boolean;
  isEmulator: boolean;
  adbEnabled: boolean;
  selinuxStatus: 'enforcing' | 'permissive' | 'disabled' | 'unknown';
  playIntegrityScore?: number;
}

interface DeviceTrustSettingsProps {
  onSave?: (settings: DeviceTrustState) => void;
  language?: 'en' | 'tr';
  isDarkMode?: boolean;
}

const translations = {
  en: {
    title: 'Device Trust Settings',
    riskScore: 'Device Risk Score',
    trustPolicy: 'Trust Policy',
    strict: 'Strict - Reject rooted devices',
    moderate: 'Moderate - Warn on rooted devices',
    permissive: 'Permissive - Allow all devices',
    rootDetection: 'Root Detection',
    rootDetectionDesc: 'Check if device has root access',
    rootAction: 'Root Device Action',
    blockVault: 'Block vault access',
    warnUser: 'Warn user',
    deviceStatus: 'Device Status',
    rooted: 'Rooted',
    emulator: 'Emulator',
    adbEnabled: 'ADB Enabled',
    seLinux: 'SELinux Status',
    playIntegrity: 'Play Integrity Score',
    save: 'Save Settings',
    saving: 'Saving...',
    saved: 'Settings saved successfully',
    error: 'Error',
    errorMessage: 'Failed to save settings'
  },
  tr: {
    title: 'Cihaz Güveni Ayarları',
    riskScore: 'Cihaz Risk Skoru',
    trustPolicy: 'Güven Politikası',
    strict: 'Katı - Rooted cihazları reddet',
    moderate: 'Orta - Rooted cihazlarında uyar',
    permissive: 'Esnek - Tüm cihazlara izin ver',
    rootDetection: 'Root Algılaması',
    rootDetectionDesc: 'Cihazın root erişimi olup olmadığını kontrol et',
    rootAction: 'Root Cihaz İşlemi',
    blockVault: 'Vault erişimini engelle',
    warnUser: 'Kullanıcıyı uyar',
    deviceStatus: 'Cihaz Durumu',
    rooted: 'Rooted',
    emulator: 'Emülatör',
    adbEnabled: 'ADB Etkindir',
    seLinux: 'SELinux Durumu',
    playIntegrity: 'Play Integrity Puanı',
    save: 'Ayarları Kaydet',
    saving: 'Kaydediliyor...',
    saved: 'Ayarlar başarıyla kaydedildi',
    error: 'Hata',
    errorMessage: 'Ayarları kaydetme başarısız'
  }
};

const lightTheme = {
  bg: '#FFFFFF',
  text: '#000000',
  subtext: '#666666',
  border: '#DDDDDD',
  riskHigh: '#FF4444',
  riskMed: '#FFAA00',
  riskLow: '#44AA44'
};

const darkTheme = {
  bg: '#1E1E1E',
  text: '#FFFFFF',
  subtext: '#AAAAAA',
  border: '#444444',
  riskHigh: '#FF6666',
  riskMed: '#FFBB33',
  riskLow: '#66BB66'
};

export const DeviceTrustSettings: React.FC<DeviceTrustSettingsProps> = ({
  onSave,
  language = 'en',
  isDarkMode = false
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 600;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<DeviceTrustState>({
    deviceTrustPolicy: 'moderate',
    rootDetectionEnabled: true,
    rootBlocksVault: false,
    degradedDeviceAction: 'warn',
    allowEmulator: false,
    requireBiometric: true
  });

  const [deviceRisk, setDeviceRisk] = useState<DeviceRiskAssessment>({
    riskLevel: 'unknown',
    score: 0,
    isRooted: false,
    isEmulator: false,
    adbEnabled: false,
    selinuxStatus: 'unknown'
  });

  const t = translations[language as keyof typeof translations];
  const colors = isDarkMode ? darkTheme : lightTheme;

  // ═══════════════════════════════════════════════════════════════
  // Effects & Initialization
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    initializeSettings();
    assessDeviceRisk();
  }, []);

  const initializeSettings = async () => {
    try {
      setLoading(true);
      const signals = await IntegrityModule.getIntegritySignals();
      setDeviceRisk({
        riskLevel: signals.riskLevel || 'unknown',
        score: signals.score || 0,
        isRooted: signals.rooted || false,
        isEmulator: signals.emulator || false,
        adbEnabled: signals.adbEnabled || false,
        selinuxStatus: 'unknown'
      });
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const assessDeviceRisk = async () => {
    try {
      const signals = await IntegrityModule.getIntegritySignals();
      setDeviceRisk({
        riskLevel: signals.riskLevel || 'unknown',
        score: signals.score || 0,
        isRooted: signals.rooted || false,
        isEmulator: signals.emulator || false,
        adbEnabled: signals.adbEnabled || false,
        selinuxStatus: 'unknown'
      });
    } catch (error) {
      console.error('Error assessing device risk:', error);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      
      // PERSISTENCE: Save to SecureAppSettings (SQLCipher) via SecureAppSettings module
      await SecureAppSettings.update({
        deviceTrustPolicy: settings.deviceTrustPolicy,
        rootDetectionEnabled: settings.rootDetectionEnabled,
        rootBlocksVault: settings.rootBlocksVault,
        degradedDeviceAction: settings.degradedDeviceAction,
      }, SecurityModule.db);

      onSave?.(settings);
      Alert.alert(t.saved);
    } catch (error) {
      console.error('[DeviceTrust] Save failed:', error);
      Alert.alert(t.error, t.errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return colors.riskHigh;
    if (score >= 40) return colors.riskMed;
    return colors.riskLow;
  };

  const getRiskLabel = (score: number) => {
    if (score >= 70) return 'CRITICAL';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  };

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Title */}
      <Text style={[styles.title, { color: colors.text }]}>{t.title}</Text>

      {/* Risk Score Section */}
      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.riskScore}</Text>
        
        <View style={[styles.riskScoreContainer, { backgroundColor: getRiskColor(deviceRisk.score) }]}>
          <Text style={styles.riskScoreText}>{deviceRisk.score}</Text>
          <Text style={styles.riskScoreLabel}>{getRiskLabel(deviceRisk.score)}</Text>
        </View>

        <Text style={[styles.riskDescription, { color: colors.subtext }]}>
          {deviceRisk.riskLevel === 'critical' && 'Your device has critical security issues'}
          {deviceRisk.riskLevel === 'high' && 'Your device has security concerns'}
          {deviceRisk.riskLevel === 'medium' && 'Your device has some security risks'}
          {deviceRisk.riskLevel === 'low' && 'Your device appears secure'}
          {deviceRisk.riskLevel === 'unknown' && 'Unable to assess device security'}
        </Text>
      </View>

      {/* Trust Policy Section */}
      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.trustPolicy}</Text>

        {['strict', 'moderate', 'permissive'].map(policy => (
          <TouchableOpacity
            key={policy}
            style={[
              styles.option,
              { borderColor: colors.border },
              settings.deviceTrustPolicy === policy && styles.optionSelected
            ]}
            onPress={() => {
              setSettings({ ...settings, deviceTrustPolicy: policy as any });
            }}
          >
            <View style={styles.optionRadio}>
              <View style={[
                styles.radioDot,
                settings.deviceTrustPolicy === policy && styles.radioDotSelected
              ]} />
            </View>
            <Text style={[styles.optionText, { color: colors.text }]}>
              {policy === 'strict' && t.strict}
              {policy === 'moderate' && t.moderate}
              {policy === 'permissive' && t.permissive}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Root Detection Section */}
      <View style={[styles.section, { borderColor: colors.border }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabel}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>{t.rootDetection}</Text>
            <Text style={[styles.settingDesc, { color: colors.subtext }]}>{t.rootDetectionDesc}</Text>
          </View>
          <Switch
            value={settings.rootDetectionEnabled}
            onValueChange={(value) => {
              setSettings({ ...settings, rootDetectionEnabled: value });
            }}
          />
        </View>

        {/* Root Action - only show if enabled */}
        {settings.rootDetectionEnabled && (
          <View style={styles.subSetting}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>{t.rootAction}</Text>
            {['block', 'warn'].map(action => (
              <TouchableOpacity
                key={action}
                style={[styles.subOption, { borderColor: colors.border }]}
                onPress={() => {
                  setSettings({ 
                    ...settings, 
                    rootBlocksVault: action === 'block'
                  });
                }}
              >
                <View style={styles.subOptionRadio}>
                  <View style={[
                    styles.subRadioDot,
                    (action === 'block' ? settings.rootBlocksVault : !settings.rootBlocksVault) && styles.subRadioDotSelected
                  ]} />
                </View>
                <Text style={[styles.subOptionText, { color: colors.text }]}>
                  {action === 'block' ? t.blockVault : t.warnUser}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Device Status Section */}
      <View style={[styles.section, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.deviceStatus}</Text>

        <StatusRow label={t.rooted} value={deviceRisk.isRooted ? 'Yes' : 'No'} textColor={colors.text} />
        <StatusRow label={t.emulator} value={deviceRisk.isEmulator ? 'Yes' : 'No'} textColor={colors.text} />
        <StatusRow label={t.adbEnabled} value={deviceRisk.adbEnabled ? 'Yes' : 'No'} textColor={colors.text} />
        <StatusRow label={t.seLinux} value={deviceRisk.selinuxStatus} textColor={colors.text} />
        {deviceRisk.playIntegrityScore !== undefined && (
          <StatusRow label={t.playIntegrity} value={`${deviceRisk.playIntegrityScore}/100`} textColor={colors.text} />
        )}
      </View>

      {/* Save Button */}
      <View style={styles.buttonContainer}>
        <Button
          title={saving ? t.saving : t.save}
          onPress={handleSaveSettings}
          disabled={saving}
          color={colors.text}
        />
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
};

// ═══════════════════════════════════════════════════════════════
// Helper Component: Status Row
// ═══════════════════════════════════════════════════════════════

const StatusRow: React.FC<{ label: string; value: string | boolean; textColor: string }> = ({
  label,
  value,
  textColor
}) => (
  <View style={styles.statusRow}>
    <Text style={[styles.statusLabel, { color: textColor }]}>{label}:</Text>
    <Text style={[styles.statusValue, { color: textColor }]}>
      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : value}
    </Text>
  </View>
);

const RiskAssessmentCard: React.FC<{
  risk: DeviceRiskAssessment;
  colors: any;
  t: any;
}> = ({ risk, colors, t }) => {
  const getRiskColor = () => {
    switch (risk.riskLevel) {
      case 'critical':
        return '#d32f2f';
      case 'high':
        return '#f57c00';
      case 'medium':
        return '#fbc02d';
      case 'low':
        return '#388e3c';
      default:
        return colors.textSecondary;
    }
  };

  if (risk.riskLevel === 'unknown') {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
      <View style={styles.riskHeader}>
        <Text style={[styles.riskLabel, { color: getRiskColor() }]}>
          {t[`risk_${risk.riskLevel}`] || risk.riskLevel}
        </Text>
        <View style={[styles.riskScore, { borderColor: getRiskColor() }]}>
          <Text style={[styles.riskScoreText, { color: getRiskColor() }]}>
            {risk.score}
          </Text>
        </View>
      </View>

      <View style={styles.riskDetails}>
        {risk.isRooted && (
          <RiskItem icon="⚠️" label={t.rooted_detected} />
        )}
        {risk.isEmulator && (
          <RiskItem icon="💻" label={t.emulator_detected} />
        )}
        {risk.adbEnabled && (
          <RiskItem icon="🔌" label={t.adb_enabled} />
        )}
        {risk.selinuxStatus !== 'enforcing' && (
          <RiskItem icon="🛡️" label={`SELinux: ${risk.selinuxStatus}`} />
        )}
      </View>
    </View>
  );
};

const RiskItem: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <View style={styles.riskItem}>
    <Text style={styles.icon}>{icon}</Text>
    <Text style={styles.riskItemText}>{label}</Text>
  </View>
);

const Section: React.FC<{
  title: string;
  colors: any;
  t: any;
  children: React.ReactNode;
}> = ({ title, colors, children, t }) => (
  <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    <View style={[styles.sectionContent, { backgroundColor: colors.cardBackground }]}>
      {children}
    </View>
  </View>
);

const PolicyOption: React.FC<{
  label: string;
  value: string;
  isSelected: boolean;
  description: string;
  icon: string;
  colors: any;
  onPress: () => void;
}> = ({ label, isSelected, description, icon, colors, onPress }) => (
  <TouchableOpacity
    style={[
      styles.option,
      {
        backgroundColor: isSelected ? colors.primaryLight : colors.cardBackground,
        borderColor: isSelected ? colors.primary : colors.border
      }
    ]}
    onPress={onPress}
  >
    <View style={styles.optionHeader}>
      <Text style={styles.optionIcon}>{icon}</Text>
      <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
    </View>
    <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
      {description}
    </Text>
  </TouchableOpacity>
);

const DegradedActionOption: React.FC<{
  label: string;
  value: string;
  isSelected: boolean;
  description: string;
  colors: any;
  onPress: () => void;
}> = ({ label, isSelected, description, colors, onPress }) => (
  <TouchableOpacity
    style={[
      styles.actionOption,
      { borderBottomColor: colors.border }
    ]}
    onPress={onPress}
  >
    <View style={styles.actionOptionContent}>
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.actionDescription, { color: colors.textSecondary }]}>
        {description}
      </Text>
    </View>
    <View
      style={[
        styles.radioButton,
        {
          borderColor: colors.primary,
          backgroundColor: isSelected ? colors.primary : 'transparent'
        }
      ]}
    />
  </TouchableOpacity>
);

const ToggleRow: React.FC<{
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors: any;
  indent?: boolean;
}> = ({ label, value, onValueChange, colors, indent = false }) => (
  <View
    style={[
      styles.toggleRow,
      {
        backgroundColor: colors.cardBackground,
        borderBottomColor: colors.border,
        paddingLeft: indent ? 40 : 16
      }
    ]}
  >
    <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.border, true: colors.primaryLight }}
      thumbColor={value ? colors.primary : colors.textSecondary}
      ios_backgroundColor={colors.border}
    />
  </View>
);

const InfoBox: React.FC<{ colors: any; t: any }> = ({ colors, t }) => (
  <View style={[styles.infoBox, { backgroundColor: colors.infoBg }]}>
    <Text style={[styles.infoTitle, { color: colors.infoText }]}>{t.info_title}</Text>
    <Text style={[styles.infoText, { color: colors.infoText }]}>
      {t.info_description}
    </Text>
  </View>
);

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32
  },
  header: {
    marginBottom: 24
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 14
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  riskLabel: {
    fontSize: 18,
    fontWeight: '600',
    textTransform: 'uppercase'
  },
  riskScore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center'
  },
  riskScoreText: {
    fontSize: 24,
    fontWeight: 'bold'
  },
  riskDetails: {
    gap: 8
  },
  riskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  icon: {
    fontSize: 20
  },
  riskItemText: {
    fontSize: 14,
    fontWeight: '500'
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8
  },
  sectionContent: {
    borderRadius: 8,
    overflow: 'hidden'
  },
  option: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  optionIcon: {
    fontSize: 18,
    marginRight: 8
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600'
  },
  optionDescription: {
    fontSize: 12,
    marginLeft: 26
  },
  actionOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1
  },
  actionOptionContent: {
    flex: 1
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  actionDescription: {
    fontSize: 12
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginLeft: 12
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500'
  },
  saveButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 16
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600'
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16
  },
  infoBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  infoTitle: {
    fontWeight: '600',
    marginBottom: 8
  },
  infoText: {
    fontSize: 12,
    lineHeight: 16
  },
  riskScoreContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 12,
    marginBottom: 12
  },
  riskScoreLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 4
  },
  riskDescription: {
    fontSize: 14,
    lineHeight: 20
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12
  },
  settingLabel: {
    flex: 1
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  settingDesc: {
    fontSize: 13,
    marginTop: 4
  },
  subSetting: {
    marginTop: 12,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#0066CC'
  },
  subOption: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center'
  },
  subOptionRadio: {
    marginRight: 10
  },
  subRadioDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#999999'
  },
  subRadioDotSelected: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC'
  },
  subOptionText: {
    fontSize: 14
  },
  optionSelected: {
    backgroundColor: 'rgba(0, 100, 200, 0.1)'
  },
  optionRadio: {
    marginRight: 12
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#999999'
  },
  radioDotSelected: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC'
  },
  optionText: {
    fontSize: 16,
    flex: 1
  },
  buttonContainer: {
    marginVertical: 20,
    paddingHorizontal: 16
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)'
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500'
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600'
  }
});

export default DeviceTrustSettings;
