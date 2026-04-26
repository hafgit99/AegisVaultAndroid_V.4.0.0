/**
 * LockScreen — Aegis Vault Android
 * Extracted from Dashboard.tsx for single-responsibility & testability.
 * Supports: dark mode palette, TR/EN bilingual, integrity warnings, brute-force countdown.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useTranslation } from 'react-i18next';
import { switchLanguage } from '../i18n';
import { SecurityModule } from '../SecurityModule';
import { SecureAppSettings } from '../SecureAppSettings';
import { AutofillService } from '../AutofillService';
import { IntegrityModule, IntegritySignals } from '../IntegrityModule';
import { LegalModal } from './LegalModal';

// ── Palette types (passed from parent, avoids re-importing theme logic) ──
export interface ThemePalette {
  bg: string;
  navy: string;
  sage: string;
  card: string;
  cardBorder: string;
  muted: string;
  divider: string;
}

interface LockScreenProps {
  palette: ThemePalette;
  darkMode: boolean;
  onUnlocked: () => void;
}

const rnBiometrics = new ReactNativeBiometrics({ allowDeviceCredentials: true });

export const LockScreen: React.FC<LockScreenProps> = ({
  palette,
  darkMode,
  onUnlocked,
}) => {
  const { t, i18n } = useTranslation();
  const glow = useRef(new Animated.Value(0.4)).current;

  const [authStatus, setAuthStatus] = useState(t('lock_screen.prompt'));
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [legalType, setLegalType] = useState<'terms' | 'privacy' | null>(null);
  const [integrity, setIntegrity] = useState<IntegritySignals | null>(null);

  // ── Glow animation ──
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: 2000, useNativeDriver: true }),
      ]),
    ).start();
  }, [glow]);

  // ── Integrity check ──
  useEffect(() => {
    IntegrityModule.getIntegritySignals().then(setIntegrity).catch(() => {});
  }, []);

  // ── Initial lockout state ──
  useEffect(() => {
    (async () => {
      AutofillService.setUnlocked(false);
      AutofillService.clearEntries();
      const remaining = await SecurityModule.getRemainingLockout();
      const fails = await SecurityModule.getFailedAttempts();
      if (remaining > 0) {
        setLockoutRemaining(remaining);
        setFailCount(fails);
        setAuthStatus(t('lock_screen.locked_out', { seconds: remaining }));
      }
    })();
  }, [t]);

  // ── Lockout countdown ──
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          setAuthStatus(t('lock_screen.retry'));
          clearInterval(interval);
          return 0;
        }
        setAuthStatus(t('lock_screen.locked_out', { seconds: prev - 1 }));
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining, t]);

  const auth = useCallback(async () => {
    try {
      const remaining = await SecurityModule.getRemainingLockout();
      if (remaining > 0) {
        setLockoutRemaining(remaining);
        setAuthStatus(t('lock_screen.locked_out', { seconds: remaining }));
        return;
      }
      const { available } = await rnBiometrics.isSensorAvailable();
      if (!available) {
        setAuthStatus(t('lock_screen.bio_not_found'));
        return;
      }
      setAuthStatus(t('lock_screen.verifying'));
      const unlockSecret = await SecurityModule.deriveKeyFromBiometric();
      if (!unlockSecret) {
        setAuthStatus(t('lock_screen.cancelled'));
        return;
      }
      if (await SecurityModule.unlockVault(unlockSecret)) {
        setFailCount(0);
        setLockoutRemaining(0);
        await SecureAppSettings.init(SecurityModule.db);
        SecurityModule.cleanupOldTrash();
        onUnlocked();
      } else {
        const fails = await SecurityModule.getFailedAttempts();
        setFailCount(fails);
        const newRemaining = await SecurityModule.getRemainingLockout();
        setLockoutRemaining(newRemaining);
        if (newRemaining > 0) {
          setAuthStatus(t('lock_screen.failed_attempts', { count: fails, seconds: newRemaining }));
        } else {
          setAuthStatus(t('lock_screen.failed', { count: fails }));
        }
      }
    } catch {
      setAuthStatus(t('lock_screen.error'));
    }
  }, [t, onUnlocked]);

  const integrityColor =
    integrity?.riskLevel === 'critical' ? '#ef4444' :
    integrity?.riskLevel === 'high' ? '#f59e0b' : '#eab308';

  const integrityBg =
    integrity?.riskLevel === 'critical' ? 'rgba(239,68,68,0.12)' :
    integrity?.riskLevel === 'high' ? 'rgba(245,158,11,0.14)' : 'rgba(234,179,8,0.12)';
  const isLockedOut = lockoutRemaining > 0;
  const integrityWarningStyle = {
    backgroundColor: integrityBg,
    borderColor: integrityColor.replace(')', ', 0.35)').replace('rgb', 'rgba'),
  };
  const glowStyle = {
    opacity: isLockedOut ? 0 : glow,
    backgroundColor: darkMode
      ? 'rgba(34,211,238,0.12)'
      : 'rgba(114,136,111,0.1)',
  };
  const getLanguageButtonStyle = (lang: 'tr' | 'en') => ({
    backgroundColor: i18n.language === lang ? palette.sage : palette.card,
    borderColor: palette.cardBorder,
  });
  const getLanguageTextStyle = (lang: 'tr' | 'en') => ({
    color: i18n.language === lang ? '#fff' : palette.navy,
  });

  return (
    <View style={[s.container, { backgroundColor: palette.bg }]}>
      <Text style={s.shieldIcon}>{'\uD83D\uDEE1\uFE0F'}</Text>
      <Text style={[s.title, { color: palette.navy }]}>{t('lock_screen.title')}</Text>
      <Text style={[s.subtitle, { color: palette.muted }]}>{authStatus}</Text>

      {/* Brute force warning */}
      {isLockedOut && (
        <View style={[s.warningBox, s.bruteWarningBox]}>
          <Text style={[s.warningTitle, s.dangerText]}>
            {t('lock_screen.brute_force_active')}
          </Text>
          <Text style={[s.warningDesc, s.dangerText]}>
            {t('lock_screen.brute_force_desc', { fails: failCount, seconds: lockoutRemaining })}
          </Text>
        </View>
      )}

      {/* Integrity warning */}
      {!!integrity && integrity.riskLevel !== 'low' && (
        <View style={[s.warningBox, s.integrityWarningBox, integrityWarningStyle]}>
          <Text style={[s.warningTitle, { color: integrityColor }]}>
            {t('lock_screen.integrity_warning_title')}
          </Text>
          <Text style={[s.warningDesc, { color: integrityColor }]}>
            {t('lock_screen.integrity_warning_desc', {
              level: t(`settings.integrity.level_${integrity.riskLevel}`),
              score: integrity.score,
            })}
          </Text>
        </View>
      )}

      {/* Biometric unlock button */}
      <TouchableOpacity
        style={[
          s.bioBtn,
          { backgroundColor: palette.card, borderColor: palette.cardBorder },
          isLockedOut && s.disabledButton,
        ]}
        onPress={auth}
        activeOpacity={0.75}
        disabled={isLockedOut}
        accessibilityLabel={t('lock_screen.bio_btn')}
        accessibilityRole="button"
      >
        <Animated.View style={[s.glow, glowStyle]} />
        <Text style={[s.bioBtnText, { color: palette.navy }]}>
          {t('lock_screen.bio_btn')}
        </Text>
      </TouchableOpacity>

      {/* Language switcher - TR / EN */}
      <View style={s.langRow}>
        {(['tr', 'en'] as const).map(lang => (
          <TouchableOpacity
            key={lang}
            onPress={() => switchLanguage(lang)}
            style={[s.langBtn, getLanguageButtonStyle(lang)]}
            accessibilityLabel={lang === 'tr' ? 'Turkce' : 'English'}
            accessibilityRole="button"
          >
            <Text style={[s.langBtnText, getLanguageTextStyle(lang)]}>
              {lang === 'tr'
                ? '\uD83C\uDDF9\uD83C\uDDF7 T\u00FCrk\u00E7e'
                : '\uD83C\uDDEC\uD83C\uDDE7 English'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.techInfo, { color: palette.navy }]}>
        AES-256-GCM {'\u2022'} Android Keystore {'\u2022'} Argon2id
      </Text>

      {/* Legal links */}
      <View style={s.legalRow}>
        <Text style={[s.legalText, { color: palette.muted }]}>
          {t('legal.disclaimer').split('{{terms}}')[0]}
        </Text>
        <TouchableOpacity onPress={() => setLegalType('terms')} activeOpacity={0.6}>
          <Text style={[s.legalLink, { color: palette.muted }]}>{t('legal.terms')}</Text>
        </TouchableOpacity>
        <Text style={[s.legalText, { color: palette.muted }]}>
          {t('legal.disclaimer').split('{{terms}}')[1]?.split('{{privacy}}')[0] ?? ''}
        </Text>
        <TouchableOpacity onPress={() => setLegalType('privacy')} activeOpacity={0.6}>
          <Text style={[s.legalLink, { color: palette.muted }]}>{t('legal.privacy')}</Text>
        </TouchableOpacity>
        <Text style={[s.legalText, { color: palette.muted }]}>
          {t('legal.disclaimer').split('{{privacy}}')[1] ?? ''}
        </Text>
      </View>

      <LegalModal
        visible={!!legalType}
        type={legalType}
        onClose={() => setLegalType(null)}
      />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  bruteWarningBox: { backgroundColor: 'rgba(239,68,68,0.08)' },
  dangerText: { color: '#ef4444' },
  disabledButton: { opacity: 0.4 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 18, textAlign: 'center' },
  shieldIcon: { fontSize: 42, marginBottom: 10 },
  warningBox: { borderRadius: 14, padding: 14, marginBottom: 16, width: '100%' },
  integrityWarningBox: { borderWidth: 1 },
  warningTitle: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
  warningDesc: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  bioBtn: {
    width: '82%',
    maxWidth: 320,
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 3,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  glow: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
  bioBtnText: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  langRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 18 },
  langBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  langBtnText: { fontWeight: '600', fontSize: 14 },
  techInfo: { fontSize: 11, fontWeight: '600', marginBottom: 12, opacity: 0.7 },
  legalRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingHorizontal: 20,
  },
  legalText: { fontSize: 11, lineHeight: 18 },
  legalLink: { fontSize: 11, fontWeight: '700', textDecorationLine: 'underline', lineHeight: 18 },
});
