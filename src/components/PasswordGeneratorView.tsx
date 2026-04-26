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
      <Text style={[styles.headerTitle, { color: theme.navy }]}>
        {t('generator.title')}
      </Text>
      <Text style={[styles.headerSubtitle, { color: theme.sage }]}>
        {t('generator.subtitle')}
      </Text>

      <View
        style={[
          styles.passwordBox,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[styles.passwordText, { color: theme.navy }]} selectable>
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
            {t(`generator.strength.${strength.score > 3 ? 'strong' : 'weak'}`)}
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
                  backgroundColor: theme.card,
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
              { color: copied ? theme.green : theme.navy },
            ]}
          >
            {copied ? t('fields.copied') : t('generator.copy')}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.optionsBox,
          { backgroundColor: theme.card, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={[styles.optionLabel, { color: theme.navy }]}>
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
    marginBottom: 20,
    opacity: 0.8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  optionsBox: {
    borderRadius: 18,
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
  },
  passwordText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 30,
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
