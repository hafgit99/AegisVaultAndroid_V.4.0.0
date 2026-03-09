import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';

const C = {
  navy: '#101828',
  sage: '#72886f',
  sageLight: 'rgba(114,136,111,0.12)',
  muted: 'rgba(16,24,40,0.45)',
  inputBg: 'rgba(255,255,255,0.7)',
  cardBorder: 'rgba(255,255,255,0.55)',
  divider: 'rgba(16,24,40,0.06)',
};

const resolveTheme = (theme?: any) => ({
  navy: theme?.navy ?? C.navy,
  sage: theme?.sage ?? C.sage,
  sageLight: theme?.sageLight ?? C.sageLight,
  muted: theme?.muted ?? C.muted,
  inputBg: theme?.inputBg ?? C.inputBg,
  cardBorder: theme?.cardBorder ?? C.cardBorder,
  divider: theme?.divider ?? C.divider,
});

export const Field = ({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  multiline,
  lines,
  theme,
}: any) => {
  const cc = resolveTheme(theme);
  return (
    <View style={st.fieldWrap}>
      <Text style={[st.label, { color: cc.muted }]}>{label}</Text>
      <TextInput
        style={[
          st.input,
          multiline && { minHeight: (lines || 3) * 22 },
          {
            backgroundColor: cc.inputBg,
            borderColor: cc.cardBorder,
            color: cc.navy,
          },
        ]}
        value={value || ''}
        onChangeText={onChange}
        placeholder={placeholder || ''}
        placeholderTextColor={cc.muted}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
        multiline={multiline}
        numberOfLines={lines}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
};

export const PasswordField = ({
  value,
  onChange,
  onGenerate,
  showPw,
  setShowPw,
  strength,
  theme,
}: any) => {
  const cc = resolveTheme(theme);
  return (
    <View style={st.fieldWrap}>
      <Text style={[st.label, { color: cc.muted }]}>Şifre</Text>
      <View style={st.pwRow}>
        <TextInput
          style={[
            st.input,
            {
              flex: 1,
              marginBottom: 0,
              backgroundColor: cc.inputBg,
              borderColor: cc.cardBorder,
              color: cc.navy,
            },
          ]}
          value={value || ''}
          onChangeText={onChange}
          secureTextEntry={!showPw}
          placeholder="Şifre"
          placeholderTextColor={cc.muted}
          autoCapitalize="none"
        />
        <TouchableOpacity
          onPress={() => setShowPw(!showPw)}
          style={[
            st.iconBtn,
            { backgroundColor: cc.inputBg, borderColor: cc.cardBorder },
          ]}
        >
          <Text>{showPw ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
        {onGenerate && (
          <TouchableOpacity
            onPress={onGenerate}
            style={[
              st.iconBtn,
              { backgroundColor: cc.sageLight, borderColor: cc.cardBorder },
            ]}
          >
            <Text>⚡</Text>
          </TouchableOpacity>
        )}
      </View>
      {value && strength ? (
        <View style={st.strRow}>
          <View style={[st.strBar, { backgroundColor: cc.divider }]}>
            <View
              style={[
                st.strFill,
                {
                  width: `${(strength.score / 7) * 100}%`,
                  backgroundColor: strength.color,
                },
              ]}
            />
          </View>
          <Text style={[st.strLabel, { color: strength.color }]}>
            {strength.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export const SelectChips = ({
  label,
  options,
  value,
  onChange,
  theme,
}: any) => {
  const cc = resolveTheme(theme);
  return (
    <View style={st.fieldWrap}>
      {label && <Text style={[st.label, { color: cc.muted }]}>{label}</Text>}
      <View style={st.chipRow}>
        {options.map((o: any) => (
          <TouchableOpacity
            key={o.id}
            style={[
              st.chip,
              { backgroundColor: cc.inputBg, borderColor: cc.cardBorder },
              value === o.id && {
                backgroundColor: cc.sage,
                borderColor: cc.sage,
              },
            ]}
            onPress={() => onChange(o.id)}
            activeOpacity={0.7}
          >
            {o.icon && (
              <Text style={{ fontSize: 13, marginRight: 4 }}>{o.icon}</Text>
            )}
            <Text
              style={[
                st.chipText,
                { color: cc.navy },
                value === o.id && st.chipTextActive,
              ]}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export const ToggleRow = ({ label, value, onToggle, theme }: any) => {
  const cc = resolveTheme(theme);
  return (
    <View style={[st.toggleRow, { borderBottomColor: cc.divider }]}>
      <Text style={[st.toggleLabel, { color: cc.navy }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: cc.divider, true: cc.sageLight }}
        thumbColor={value ? cc.sage : '#ddd'}
      />
    </View>
  );
};

const st = StyleSheet.create({
  fieldWrap: { marginBottom: 12 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: C.navy,
    borderWidth: 1,
    borderColor: C.cardBorder,
    fontWeight: '500',
  },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 44,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  strRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  strBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.divider,
    overflow: 'hidden',
  },
  strFill: { height: '100%', borderRadius: 2 },
  strLabel: { fontSize: 11, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: C.sage, borderColor: C.sage },
  chipText: { fontSize: 12, fontWeight: '600', color: C.navy },
  chipTextActive: { color: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  toggleLabel: { fontSize: 14, color: C.navy, fontWeight: '500' },
});
