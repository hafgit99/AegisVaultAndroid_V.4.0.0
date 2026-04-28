import React, { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PrimitiveProps {
  styles: any;
  theme: any;
}

interface SettingsSectionTitleProps extends PrimitiveProps {
  children: ReactNode;
}

export const SettingsSectionTitle = ({
  children,
  styles,
  theme,
}: SettingsSectionTitleProps) => (
  <Text style={[styles.sec, { color: theme.navy }]}>{children}</Text>
);

interface SettingsCardProps extends PrimitiveProps {
  children: ReactNode;
  backgroundColor?: string;
  borderColor?: string;
}

export const SettingsCard = ({
  children,
  styles,
  theme,
  backgroundColor,
  borderColor,
}: SettingsCardProps) => (
  <View
    style={[
      styles.sCard,
      {
        backgroundColor: backgroundColor || theme.card,
        borderColor: borderColor || theme.cardBorder,
      },
    ]}
  >
    {children}
  </View>
);

interface SettingsActionCardProps extends PrimitiveProps {
  title: string;
  description?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  right?: ReactNode;
  backgroundColor?: string;
  borderColor?: string;
  titleColor?: string;
  descriptionColor?: string;
}

export const SettingsActionCard = ({
  title,
  description,
  onPress,
  accessibilityLabel,
  right,
  styles,
  theme,
  backgroundColor,
  borderColor,
  titleColor,
  descriptionColor,
}: SettingsActionCardProps) => (
  <TouchableOpacity
    style={[
      styles.sCard,
      {
        backgroundColor: backgroundColor || theme.card,
        borderColor: borderColor || theme.cardBorder,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel || title}
  >
    <View
      style={primitiveStyles.actionRow}
    >
      <View style={primitiveStyles.actionTextColumn}>
        <Text
          style={[
            primitiveStyles.actionTitle,
            {
            color: titleColor || theme.navy,
            },
          ]}
        >
          {title}
        </Text>
        {!!description && (
          <Text
            style={[
              primitiveStyles.actionDescription,
              {
              color: descriptionColor || theme.muted,
              },
            ]}
          >
            {description}
          </Text>
        )}
      </View>
      {right || (
        <Text
          style={[
            primitiveStyles.chevron,
            {
            color: theme.muted,
            },
          ]}
        >
          {'\u203A'}
        </Text>
      )}
    </View>
  </TouchableOpacity>
);

const primitiveStyles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionTextColumn: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionDescription: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 12,
  },
});
