import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Switch } from 'react-native';

const C = {
  navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  muted: 'rgba(16,24,40,0.45)', inputBg: 'rgba(255,255,255,0.7)',
  cardBorder: 'rgba(255,255,255,0.55)', divider: 'rgba(16,24,40,0.06)',
};

export const Field = ({ label, value, onChange, placeholder, secure, keyboardType, multiline, lines }: any) => (
  <View style={st.fieldWrap}>
    <Text style={st.label}>{label}</Text>
    <TextInput style={[st.input, multiline && { minHeight: (lines || 3) * 22 }]} value={value || ''}
      onChangeText={onChange} placeholder={placeholder || ''} placeholderTextColor={C.muted}
      secureTextEntry={secure} keyboardType={keyboardType} autoCapitalize="none"
      multiline={multiline} numberOfLines={lines} textAlignVertical={multiline ? 'top' : 'center'} />
  </View>
);

export const PasswordField = ({ value, onChange, onGenerate, showPw, setShowPw, strength }: any) => (
  <View style={st.fieldWrap}>
    <Text style={st.label}>Şifre</Text>
    <View style={st.pwRow}>
      <TextInput style={[st.input, { flex: 1, marginBottom: 0 }]} value={value || ''}
        onChangeText={onChange} secureTextEntry={!showPw} placeholder="Şifre" placeholderTextColor={C.muted} autoCapitalize="none" />
      <TouchableOpacity onPress={() => setShowPw(!showPw)} style={st.iconBtn}>
        <Text>{showPw ? '🙈' : '👁️'}</Text>
      </TouchableOpacity>
      {onGenerate && (
        <TouchableOpacity onPress={onGenerate} style={[st.iconBtn, { backgroundColor: C.sageLight }]}>
          <Text>⚡</Text>
        </TouchableOpacity>
      )}
    </View>
    {value && strength ? (
      <View style={st.strRow}>
        <View style={st.strBar}><View style={[st.strFill, { width: `${(strength.score / 7) * 100}%`, backgroundColor: strength.color }]} /></View>
        <Text style={[st.strLabel, { color: strength.color }]}>{strength.label}</Text>
      </View>
    ) : null}
  </View>
);

export const SelectChips = ({ label, options, value, onChange }: any) => (
  <View style={st.fieldWrap}>
    {label && <Text style={st.label}>{label}</Text>}
    <View style={st.chipRow}>
      {options.map((o: any) => (
        <TouchableOpacity key={o.id} style={[st.chip, value === o.id && st.chipActive]}
          onPress={() => onChange(o.id)} activeOpacity={0.7}>
          {o.icon && <Text style={{ fontSize: 13, marginRight: 4 }}>{o.icon}</Text>}
          <Text style={[st.chipText, value === o.id && st.chipTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

export const ToggleRow = ({ label, value, onToggle }: any) => (
  <View style={st.toggleRow}>
    <Text style={st.toggleLabel}>{label}</Text>
    <Switch value={value} onValueChange={onToggle}
      trackColor={{ false: C.divider, true: 'rgba(114,136,111,0.25)' }} thumbColor={value ? C.sage : '#ddd'} />
  </View>
);

const st = StyleSheet.create({
  fieldWrap: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: C.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: C.navy, borderWidth: 1, borderColor: C.cardBorder, fontWeight: '500' },
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 44, height: 46, borderRadius: 14, backgroundColor: C.inputBg, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: C.cardBorder },
  strRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  strBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.divider, overflow: 'hidden' },
  strFill: { height: '100%', borderRadius: 2 },
  strLabel: { fontSize: 11, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.inputBg,
    borderWidth: 1, borderColor: C.cardBorder, flexDirection: 'row', alignItems: 'center' },
  chipActive: { backgroundColor: C.sage, borderColor: C.sage },
  chipText: { fontSize: 12, fontWeight: '600', color: C.navy },
  chipTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  toggleLabel: { fontSize: 14, color: C.navy, fontWeight: '500' },
});
