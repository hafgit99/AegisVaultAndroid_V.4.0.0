import React from 'react';
import { View, ScrollView } from 'react-native';
import { Field, PasswordField, SelectChips } from './FormFields';
import { SecurityModule } from '../SecurityModule';

const SECURITY_TYPES = [
  { id: 'WPA2', label: 'WPA2' }, { id: 'WPA3', label: 'WPA3' },
  { id: 'WEP', label: 'WEP' }, { id: 'open', label: 'Açık' },
];
const getCardBrands = (t: any) => [
  { id: 'visa', label: 'Visa', icon: '💳' }, { id: 'mastercard', label: 'MC', icon: '💳' },
  { id: 'amex', label: 'Amex', icon: '💳' }, { id: 'other', label: 'Other', icon: '💳' },
];
const getGenders = (t: any) => [
  { id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }, { id: 'other', label: 'Other' },
];

// ── Login Form ──
export const LoginForm = ({ form, setForm, showPw, setShowPw, pwLen, t }: any) => {
  const strength = SecurityModule.getPasswordStrength(form.password);
  return (
    <View>
      <Field label={t('fields.username')} value={form.username} onChange={(v: string) => setForm({ ...form, username: v })} placeholder="email@example.com" />
      <PasswordField label={t('fields.password')} value={form.password} onChange={(v: string) => setForm({ ...form, password: v })}
        onGenerate={() => setForm({ ...form, password: SecurityModule.generatePassword(pwLen) })}
        showPw={showPw} setShowPw={setShowPw} strength={strength} />
      <Field label={t('fields.url')} value={form.url} onChange={(v: string) => setForm({ ...form, url: v })} placeholder="https://..." keyboardType="url" />
      <Field label={t('fields.totp_secret')} value={form.data?.totp_secret}
        onChange={(v: string) => setForm({ ...form, data: { ...form.data, totp_secret: v } })} placeholder="Base32 encoded secret" />
      <Field label={t('vault.notes')} value={form.notes} onChange={(v: string) => setForm({ ...form, notes: v })} placeholder="..." multiline lines={3} />
    </View>
  );
};

// ── Card Form ──
export const CardForm = ({ form, setForm, showPw, setShowPw, t }: any) => (
  <View>
    <Field label={t('fields.cardholder')} value={form.data?.cardholder} onChange={(v: string) => setForm({ ...form, data: { ...form.data, cardholder: v } })} placeholder="..." />
    <Field label={t('fields.card_number')} value={form.data?.card_number}
      onChange={(v: string) => {
        const clean = v.replace(/\D/g, '').slice(0, 16);
        const formatted = clean.replace(/(.{4})/g, '$1 ').trim();
        setForm({ ...form, data: { ...form.data, card_number: formatted } });
      }} placeholder="1234 5678 9012 3456" keyboardType="numeric" />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Field label={t('fields.expiry')} value={form.data?.expiry}
          onChange={(v: string) => {
            let clean = v.replace(/\D/g, '').slice(0, 4);
            if (clean.length > 2) clean = clean.slice(0, 2) + '/' + clean.slice(2);
            setForm({ ...form, data: { ...form.data, expiry: clean } });
          }} placeholder="MM/YY" keyboardType="numeric" />
      </View>
      <View style={{ flex: 1 }}>
        <Field label={t('fields.cvv')} value={form.data?.cvv} onChange={(v: string) => setForm({ ...form, data: { ...form.data, cvv: v.replace(/\D/g, '').slice(0, 4) } })}
          placeholder="***" keyboardType="numeric" secure={!showPw} />
      </View>
    </View>
    <Field label={t('fields.pin')} value={form.data?.pin} onChange={(v: string) => setForm({ ...form, data: { ...form.data, pin: v.replace(/\D/g, '').slice(0, 6) } })}
      placeholder="ATM PIN" keyboardType="numeric" secure={!showPw} />
    <SelectChips label={t('fields.card_brand')} options={getCardBrands(t)} value={form.data?.brand || 'visa'}
      onChange={(v: string) => setForm({ ...form, data: { ...form.data, brand: v } })} />
    <Field label={t('vault.notes')} value={form.notes} onChange={(v: string) => setForm({ ...form, notes: v })} placeholder="..." multiline lines={3} />
  </View>
);

// ── Identity Form ──
export const IdentityForm = ({ form, setForm, t }: any) => (
  <View>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Field label={t('fields.first_name')} value={form.data?.first_name} onChange={(v: string) => setForm({ ...form, data: { ...form.data, first_name: v } })} placeholder="..." />
      </View>
      <View style={{ flex: 1 }}>
        <Field label={t('fields.last_name')} value={form.data?.last_name} onChange={(v: string) => setForm({ ...form, data: { ...form.data, last_name: v } })} placeholder="..." />
      </View>
    </View>
    <Field label={t('fields.national_id')} value={form.data?.national_id}
      onChange={(v: string) => setForm({ ...form, data: { ...form.data, national_id: v.replace(/\D/g, '').slice(0, 11) } })}
      placeholder="11111111111" keyboardType="numeric" />
    <Field label={t('fields.birthday')} value={form.data?.birthday} onChange={(v: string) => setForm({ ...form, data: { ...form.data, birthday: v } })} placeholder="DD/MM/YYYY" />
    <SelectChips label={t('fields.gender')} options={getGenders(t)} value={form.data?.gender || ''}
      onChange={(v: string) => setForm({ ...form, data: { ...form.data, gender: v } })} />
    <Field label={t('fields.phone')} value={form.data?.phone} onChange={(v: string) => setForm({ ...form, data: { ...form.data, phone: v } })} placeholder="+X XXX XXX XXXX" keyboardType="phone-pad" />
    <Field label={t('fields.email')} value={form.data?.email} onChange={(v: string) => setForm({ ...form, data: { ...form.data, email: v } })} placeholder="email@example.com" keyboardType="email-address" />
    <Field label={t('fields.company')} value={form.data?.company} onChange={(v: string) => setForm({ ...form, data: { ...form.data, company: v } })} placeholder="..." />
    <Field label={t('fields.address')} value={form.data?.address} onChange={(v: string) => setForm({ ...form, data: { ...form.data, address: v } })} placeholder="..." multiline lines={2} />
    <Field label={t('vault.notes')} value={form.notes} onChange={(v: string) => setForm({ ...form, notes: v })} placeholder="..." multiline lines={3} />
  </View>
);

// ── Note Form ──
export const NoteForm = ({ form, setForm, t }: any) => (
  <View>
    <Field label={t('fields.note_content')} value={form.data?.content} onChange={(v: string) => setForm({ ...form, data: { ...form.data, content: v } })}
      placeholder="..." multiline lines={8} />
  </View>
);

// ── WiFi Form ──
export const WifiForm = ({ form, setForm, showPw, setShowPw, t }: any) => {
  const strength = SecurityModule.getPasswordStrength(form.data?.wifi_password);
  return (
    <View>
      <Field label={t('fields.ssid')} value={form.data?.ssid} onChange={(v: string) => setForm({ ...form, data: { ...form.data, ssid: v } })} placeholder="..." />
      <PasswordField label={t('fields.wifi_password')} value={form.data?.wifi_password} onChange={(v: string) => setForm({ ...form, data: { ...form.data, wifi_password: v } })}
        showPw={showPw} setShowPw={setShowPw} strength={strength} onGenerate={null} />
      <SelectChips label={t('fields.security')} options={SECURITY_TYPES} value={form.data?.security || 'WPA2'}
        onChange={(v: string) => setForm({ ...form, data: { ...form.data, security: v } })} />
      <Field label={t('vault.notes')} value={form.notes} onChange={(v: string) => setForm({ ...form, notes: v })} placeholder="..." multiline lines={2} />
    </View>
  );
};

// ── Form Router ──
export const CategoryForm = ({ category, form, setForm, showPw, setShowPw, pwLen, t }: any) => {
  switch (category) {
    case 'card': return <CardForm form={form} setForm={setForm} showPw={showPw} setShowPw={setShowPw} t={t} />;
    case 'identity': return <IdentityForm form={form} setForm={setForm} t={t} />;
    case 'note': return <NoteForm form={form} setForm={setForm} t={t} />;
    case 'wifi': return <WifiForm form={form} setForm={setForm} showPw={showPw} setShowPw={setShowPw} t={t} />;
    default: return <LoginForm form={form} setForm={setForm} showPw={showPw} setShowPw={setShowPw} pwLen={pwLen} t={t} />;
  }
};
