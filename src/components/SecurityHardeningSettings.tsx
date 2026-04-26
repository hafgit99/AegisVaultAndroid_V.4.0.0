import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AegisTheme } from '../types/ui';
import { ToggleRow } from './FormFields';

type DeviceTrustPolicy = 'strict' | 'moderate' | 'permissive';
type DegradedDeviceAction = 'block' | 'warn' | 'allow';

interface Props {
  theme: AegisTheme;
  policy?: {
    deviceTrustPolicy?: DeviceTrustPolicy;
    rootDetectionEnabled?: boolean;
    rootBlocksVault?: boolean;
    degradedDeviceAction?: DegradedDeviceAction;
  };
  onUpdate: (
    key:
      | 'deviceTrustPolicy'
      | 'rootDetectionEnabled'
      | 'rootBlocksVault'
      | 'degradedDeviceAction',
    value: DeviceTrustPolicy | DegradedDeviceAction | boolean,
  ) => void;
}

export const SecurityHardeningSettings = ({
  theme,
  policy,
  onUpdate,
}: Props) => {
  const { t } = useTranslation();
  const selectedPolicy = policy?.deviceTrustPolicy || 'strict';
  const selectedAction = policy?.degradedDeviceAction || 'block';
  const applyPolicyPreset = (item: DeviceTrustPolicy) => {
    onUpdate('deviceTrustPolicy', item);
    if (item === 'strict') {
      onUpdate('rootDetectionEnabled', true);
      onUpdate('rootBlocksVault', true);
      onUpdate('degradedDeviceAction', 'block');
      return;
    }
    if (item === 'moderate') {
      onUpdate('rootDetectionEnabled', true);
      onUpdate('rootBlocksVault', false);
      onUpdate('degradedDeviceAction', 'warn');
      return;
    }
    onUpdate('rootDetectionEnabled', false);
    onUpdate('rootBlocksVault', false);
    onUpdate('degradedDeviceAction', 'allow');
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <Text style={[styles.label, styles.titleLabel, { color: theme.navy }]}>
        {t('settings.security_hardening.title')}
      </Text>
      <Text style={[styles.label, { color: theme.muted }]}>
        {t('settings.security_hardening.desc')}
      </Text>

      <Text style={[styles.label, styles.topLabel, { color: theme.navy }]}>
        {t('settings.security_hardening.policy')}
      </Text>
      <View style={styles.chipRow}>
        {(['strict', 'moderate', 'permissive'] as const).map(item => (
          <TouchableOpacity
            key={item}
            style={[
              styles.chip,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.cardBorder,
              },
              selectedPolicy === item && {
                backgroundColor: theme.sage,
                borderColor: theme.sage,
              },
            ]}
            onPress={() => applyPolicyPreset(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedPolicy === item }}
            accessibilityLabel={t(`settings.security_hardening.${item}`)}
          >
            <Text
              style={[
                styles.chipText,
                { color: theme.navy },
                selectedPolicy === item && styles.selectedChipText,
              ]}
            >
              {t(`settings.security_hardening.${item}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ToggleRow
        label={t('settings.security_hardening.root_detection')}
        value={Boolean(policy?.rootDetectionEnabled)}
        onToggle={(value: boolean) => onUpdate('rootDetectionEnabled', value)}
        theme={theme}
      />
      <ToggleRow
        label={t('settings.security_hardening.root_blocks_vault')}
        value={Boolean(policy?.rootBlocksVault)}
        onToggle={(value: boolean) => onUpdate('rootBlocksVault', value)}
        theme={theme}
      />

      <Text style={[styles.label, styles.topLabel, { color: theme.navy }]}>
        {t('settings.security_hardening.degraded_action')}
      </Text>
      <View style={styles.chipRow}>
        {(['block', 'warn', 'allow'] as const).map(item => (
          <TouchableOpacity
            key={item}
            style={[
              styles.chip,
              {
                backgroundColor: theme.inputBg,
                borderColor: theme.cardBorder,
              },
              selectedAction === item && {
                backgroundColor: theme.sage,
                borderColor: theme.sage,
              },
            ]}
            onPress={() => onUpdate('degradedDeviceAction', item)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                { color: theme.navy },
                selectedAction === item && styles.selectedChipText,
              ]}
            >
              {t(`settings.security_hardening.action_${item}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  selectedChipText: {
    color: '#fff',
  },
  titleLabel: {
    fontWeight: '800',
  },
  topLabel: {
    marginTop: 8,
  },
});
