/**
 * BottomNav — Aegis Vault Android
 * Extracted from Dashboard.tsx. Tab bar: Vault / Generator / Settings.
 * Supports: dark mode palette, TR/EN bilingual via i18n.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { EdgeInsets } from 'react-native-safe-area-context';

export type Tab = 'vault' | 'generator' | 'settings';

interface BottomNavProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  palette: {
    card: string;
    divider: string;
    muted: string;
    sage: string;
  };
  insets: EdgeInsets;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  tab, onTabChange, palette, insets,
}) => {
  const { t } = useTranslation();

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'vault', label: t('nav.vault'), icon: '\uD83D\uDD12' },
    { id: 'generator', label: t('nav.generator'), icon: '\u26A1' },
    { id: 'settings', label: t('nav.settings'), icon: '\u2699\uFE0F' },
  ];

  return (
    <View
      style={[
        s.nav,
        {
          paddingBottom: Math.max(20, insets.bottom + 10),
          backgroundColor: palette.card,
          borderTopColor: palette.divider,
        },
      ]}
    >
      {tabs.map(({ id, label, icon }) => (
        <TouchableOpacity
          key={id}
          style={s.item}
          onPress={() => onTabChange(id)}
          activeOpacity={0.6}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: tab === id }}
        >
          <Text style={[s.icon, tab === id && s.iconActive]}>{icon}</Text>
          <Text
            style={[
              s.label,
              { color: palette.muted },
              tab === id && s.labelActive,
              tab === id && { color: palette.sage },
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  icon: { fontSize: 22, opacity: 0.55 },
  iconActive: { opacity: 1 },
  label: { fontSize: 11, fontWeight: '500' },
  labelActive: { fontWeight: '700' },
});
