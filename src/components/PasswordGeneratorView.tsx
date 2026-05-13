import React, { useCallback, useEffect, useState } from 'react';
import {
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecurityModule } from '../SecurityModule';
import { AegisTheme } from '../types/ui';
import { ToggleRow } from './FormFields';

interface Props {
  theme: AegisTheme;
  settings: {
    passwordLength: number;
    clipboardClearSeconds: number;
    excludeAmbiguousCharacters?: boolean;
  };
  insets?: { bottom?: number };
}

export const PasswordGeneratorView = ({ theme, settings, insets }: Props) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [length, setLength] = useState(settings.passwordLength);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(
    Boolean(settings.excludeAmbiguousCharacters),
  );
  const [copied, setCopied] = useState(false);
  const themeTokens = theme as AegisTheme & {
    bgAccent?: string;
    cardElevated?: string;
    shadow?: string;
    textPrimary?: string;
    textSecondary?: string;
    textTertiary?: string;
    amber?: string;
    amberBg?: string;
    cyan?: string;
  };
  const primaryText = themeTokens.textPrimary || theme.navy;
  const secondaryText = themeTokens.textSecondary || theme.muted;
  const tertiaryText = themeTokens.textTertiary || theme.muted;
  const elevatedCard = themeTokens.cardElevated || theme.card;
  const accentBg = themeTokens.bgAccent || theme.sageLight;

  const generate = useCallback(() => {
    setPassword(
      SecurityModule.generatePassword(length, {
        uppercase,
        lowercase,
        numbers,
        symbols,
        excludeAmbiguous,
      }),
    );
    setCopied(false);
  }, [length, uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  useEffect(() => {
    generate();
  }, [generate]);

  const strength = SecurityModule.getPasswordStrength(password);
  const strengthKey = strength.score > 5 ? 'excellent' : strength.score > 3 ? 'strong' : 'weak';
  const optionCount = [uppercase, lowercase, numbers, symbols].filter(Boolean).length;
  const generatorStats = [
    {
      label: t('generator.stats.length'),
      value: String(length),
      color: theme.sage,
    },
    {
      label: t('generator.stats.entropy'),
      value: t(`generator.strength.${strengthKey}`),
      color: strength.color,
    },
    {
      label: t('generator.stats.clipboard'),
      value:
        settings.clipboardClearSeconds > 0
          ? `${settings.clipboardClearSeconds}s`
          : t('generator.stats.manual'),
      color: themeTokens.cyan || theme.sage,
    },
  ];

  const copyPassword = () => {
    Clipboard.setString(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (settings.clipboardClearSeconds > 0) {
      setTimeout(
        () => Clipboard.setString(''),
        settings.clipboardClearSeconds * 1000,
      );
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: 100 + (insets?.bottom || 0) },
      ]}
    >
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: elevatedCard,
            borderColor: theme.cardBorder,
            shadowColor: themeTokens.shadow || '#000000',
          },
        ]}
      >
        <Text style={[styles.heroEyebrow, { color: tertiaryText }]}>
          {t('generator.eyebrow')}
        </Text>
        <Text style={[styles.headerTitle, { color: primaryText }]}>
          {t('generator.title')}
        </Text>
        <Text style={[styles.headerSubtitle, { color: secondaryText }]}>
          {t('generator.subtitle')}
        </Text>
        <View style={styles.statRow}>
          {generatorStats.map(stat => (
            <View
              key={stat.label}
              style={[
                styles.statCard,
                { backgroundColor: accentBg, borderColor: theme.cardBorder },
              ]}
            >
              <Text style={[styles.statValue, { color: stat.color }]}>
                {stat.value}
              </Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.passwordBox,
          {
            backgroundColor: elevatedCard,
            borderColor: theme.cardBorder,
            shadowColor: themeTokens.shadow || '#000000',
          },
        ]}
      >
        <View style={styles.passwordHeader}>
          <Text style={[styles.passwordLabel, { color: tertiaryText }]}>
            {t('generator.output_label')}
          </Text>
          <Text style={[styles.optionBadge, { color: theme.sage }]}>
            {t('generator.options_enabled', { count: optionCount })}
          </Text>
        </View>
        <Text style={[styles.passwordText, { color: primaryText }]} selectable>
          {password}
        </Text>
        <View style={styles.strengthRow}>
          <View style={[styles.strengthBar, { backgroundColor: theme.divider }]}>
            <View
              style={[
                styles.strengthFill,
                {
                  width: `${(strength.score / 7) * 100}%`,
                  backgroundColor: strength.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.strengthLabel, { color: strength.color }]}>
            {t(`generator.strength.${strengthKey}`)}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.sage }]}
          onPress={generate}
          activeOpacity={0.7}
        >
          <Text style={styles.primaryActionText}>
            {t('generator.generate')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            copied
              ? styles.copiedActionButton
              : {
                  backgroundColor: elevatedCard,
                  borderColor: theme.cardBorder,
                },
            !copied && styles.outlineActionButton,
          ]}
          onPress={copyPassword}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.secondaryActionText,
              { color: copied ? theme.green : primaryText },
            ]}
          >
            {copied ? t('fields.copied') : t('generator.copy')}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.optionsBox,
          { backgroundColor: elevatedCard, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[styles.optionTitle, { color: primaryText }]}>
          {t('generator.options_title')}
        </Text>
        <Text style={[styles.optionHint, { color: secondaryText }]}>
          {t('generator.options_hint')}
        </Text>
        <Text style={[styles.optionLabel, { color: primaryText }]}>
          {t('generator.length')}: {length}
        </Text>
        <View style={styles.sliderRow}>
          <TouchableOpacity
            onPress={() => setLength(Math.max(6, length - 1))}
            style={[styles.sliderButton, { backgroundColor: theme.sageLight }]}
          >
            <Text style={[styles.sliderButtonText, { color: theme.sage }]}>
              -
            </Text>
          </TouchableOpacity>
          <View style={[styles.sliderTrack, { backgroundColor: theme.divider }]}>
            <View
              style={[
                styles.sliderFill,
                {
                  width: `${((length - 6) / 58) * 100}%`,
                  backgroundColor: theme.sage,
                },
              ]}
            />
          </View>
          <TouchableOpacity
            onPress={() => setLength(Math.min(64, length + 1))}
            style={[styles.sliderButton, { backgroundColor: theme.sageLight }]}
          >
            <Text style={[styles.sliderButtonText, { color: theme.sage }]}>
              +
            </Text>
          </TouchableOpacity>
        </View>
        <ToggleRow
          label={t('generator.uppercase')}
          value={uppercase}
          onToggle={setUppercase}
          theme={theme}
        />
        <ToggleRow
          label={t('generator.lowercase')}
          value={lowercase}
          onToggle={setLowercase}
          theme={theme}
        />
        <ToggleRow
          label={t('generator.numbers')}
          value={numbers}
          onToggle={setNumbers}
          theme={theme}
        />
        <ToggleRow
          label={t('generator.symbols')}
          value={symbols}
          onToggle={setSymbols}
          theme={theme}
        />
        <ToggleRow
          label={t('generator.exclude_ambiguous')}
          value={excludeAmbiguous}
          onToggle={setExcludeAmbiguous}
          theme={theme}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  content: {
    padding: 20,
  },
  copiedActionButton: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: '900',
    marginTop: 5,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  optionHint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },
  optionsBox: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  outlineActionButton: {
    borderWidth: 1,
  },
  passwordBox: {
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    padding: 20,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 2,
  },
  passwordHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  passwordLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  passwordText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 30,
  },
  optionBadge: {
    fontSize: 11,
    fontWeight: '900',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
  },
  root: {
    flex: 1,
  },
  secondaryActionText: {
    fontWeight: '700',
  },
  statCard: {
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  sliderButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sliderButtonText: {
    fontSize: 20,
    fontWeight: '800',
  },
  sliderFill: {
    borderRadius: 999,
    height: 8,
  },
  sliderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  sliderTrack: {
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  strengthBar: {
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  strengthFill: {
    borderRadius: 999,
    height: 8,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  strengthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
});
