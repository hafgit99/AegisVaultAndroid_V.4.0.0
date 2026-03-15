import React, { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Field, PasswordField, SelectChips } from './FormFields';
import { SecurityModule } from '../SecurityModule';
import { PasskeyModule } from '../PasskeyModule';

const SECURITY_TYPES = [
  { id: 'WPA2', label: 'WPA2' },
  { id: 'WPA3', label: 'WPA3' },
  { id: 'WEP', label: 'WEP' },
  { id: 'open', label: 'Açık' },
];
const getCardBrands = (_t: any) => [
  { id: 'visa', label: 'Visa', icon: '💳' },
  { id: 'mastercard', label: 'MC', icon: '💳' },
  { id: 'amex', label: 'Amex', icon: '💳' },
  { id: 'other', label: 'Other', icon: '💳' },
];
const getGenders = (_t: any) => [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
];

const PASSKEY_TRANSPORTS = [
  { id: 'internal', label: 'Internal (Platform)' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'usb', label: 'USB' },
  { id: 'nfc', label: 'NFC' },
  { id: 'ble', label: 'BLE' },
];

// ── Login Form ──
export const LoginForm = ({
  form,
  setForm,
  showPw,
  setShowPw,
  pwLen,
  t,
  theme,
}: any) => {
  const strength = SecurityModule.getPasswordStrength(form.password);
  return (
    <View>
      <Field
        label={t('fields.username')}
        value={form.username}
        onChange={(v: string) => setForm({ ...form, username: v })}
        placeholder="email@example.com"
        theme={theme}
      />
      <PasswordField
        label={t('fields.password')}
        value={form.password}
        onChange={(v: string) => setForm({ ...form, password: v })}
        onGenerate={() =>
          setForm({ ...form, password: SecurityModule.generatePassword(pwLen) })
        }
        showPw={showPw}
        setShowPw={setShowPw}
        strength={strength}
        theme={theme}
      />
      <Field
        label={t('fields.url')}
        value={form.url}
        onChange={(v: string) => setForm({ ...form, url: v })}
        placeholder="https://..."
        keyboardType="url"
        theme={theme}
      />
      <Field
        label={t('fields.totp_secret')}
        value={form.data?.totp_secret}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, totp_secret: v } })
        }
        placeholder="Base32 encoded secret"
        theme={theme}
      />
      <Field
        label={t('vault.notes')}
        value={form.notes}
        onChange={(v: string) => setForm({ ...form, notes: v })}
        placeholder="..."
        multiline
        lines={3}
        theme={theme}
      />
    </View>
  );
};

// ── Card Form ──
export const CardForm = ({
  form,
  setForm,
  showPw,
  setShowPw: _setShowPw,
  t,
  theme,
}: any) => (
  <View>
    <Field
      label={t('fields.cardholder')}
      value={form.data?.cardholder}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, cardholder: v } })
      }
      placeholder="..."
      theme={theme}
    />
    <Field
      label={t('fields.card_number')}
      value={form.data?.card_number}
      onChange={(v: string) => {
        const clean = v.replace(/\D/g, '').slice(0, 16);
        const formatted = clean.replace(/(.{4})/g, '$1 ').trim();
        setForm({ ...form, data: { ...form.data, card_number: formatted } });
      }}
      placeholder="1234 5678 9012 3456"
      keyboardType="numeric"
      theme={theme}
    />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.expiry')}
          value={form.data?.expiry}
          onChange={(v: string) => {
            let clean = v.replace(/\D/g, '').slice(0, 4);
            if (clean.length > 2)
              clean = clean.slice(0, 2) + '/' + clean.slice(2);
            setForm({ ...form, data: { ...form.data, expiry: clean } });
          }}
          placeholder="MM/YY"
          keyboardType="numeric"
          theme={theme}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.cvv')}
          value={form.data?.cvv}
          onChange={(v: string) =>
            setForm({
              ...form,
              data: { ...form.data, cvv: v.replace(/\D/g, '').slice(0, 4) },
            })
          }
          placeholder="***"
          keyboardType="numeric"
          secure={!showPw}
          theme={theme}
        />
      </View>
    </View>
    <Field
      label={t('fields.pin')}
      value={form.data?.pin}
      onChange={(v: string) =>
        setForm({
          ...form,
          data: { ...form.data, pin: v.replace(/\D/g, '').slice(0, 6) },
        })
      }
      placeholder="ATM PIN"
      keyboardType="numeric"
      secure={!showPw}
      theme={theme}
    />
    <SelectChips
      label={t('fields.card_brand')}
      options={getCardBrands(t)}
      value={form.data?.brand || 'visa'}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, brand: v } })
      }
      theme={theme}
    />
    <Field
      label={t('vault.notes')}
      value={form.notes}
      onChange={(v: string) => setForm({ ...form, notes: v })}
      placeholder="..."
      multiline
      lines={3}
      theme={theme}
    />
  </View>
);

// ── Identity Form ──
export const IdentityForm = ({ form, setForm, t, theme }: any) => (
  <View>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.first_name')}
          value={form.data?.first_name}
          onChange={(v: string) =>
            setForm({ ...form, data: { ...form.data, first_name: v } })
          }
          placeholder="..."
          theme={theme}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Field
          label={t('fields.last_name')}
          value={form.data?.last_name}
          onChange={(v: string) =>
            setForm({ ...form, data: { ...form.data, last_name: v } })
          }
          placeholder="..."
          theme={theme}
        />
      </View>
    </View>
    <Field
      label={t('fields.national_id')}
      value={form.data?.national_id}
      onChange={(v: string) =>
        setForm({
          ...form,
          data: {
            ...form.data,
            national_id: v.replace(/\D/g, '').slice(0, 11),
          },
        })
      }
      placeholder="11111111111"
      keyboardType="numeric"
      theme={theme}
    />
    <Field
      label={t('fields.birthday')}
      value={form.data?.birthday}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, birthday: v } })
      }
      placeholder="DD/MM/YYYY"
      theme={theme}
    />
    <SelectChips
      label={t('fields.gender')}
      options={getGenders(t)}
      value={form.data?.gender || ''}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, gender: v } })
      }
      theme={theme}
    />
    <Field
      label={t('fields.phone')}
      value={form.data?.phone}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, phone: v } })
      }
      placeholder="+X XXX XXX XXXX"
      keyboardType="phone-pad"
      theme={theme}
    />
    <Field
      label={t('fields.email')}
      value={form.data?.email}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, email: v } })
      }
      placeholder="email@example.com"
      keyboardType="email-address"
      theme={theme}
    />
    <Field
      label={t('fields.company')}
      value={form.data?.company}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, company: v } })
      }
      placeholder="..."
      theme={theme}
    />
    <Field
      label={t('fields.address')}
      value={form.data?.address}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, address: v } })
      }
      placeholder="..."
      multiline
      lines={2}
      theme={theme}
    />
    <Field
      label={t('vault.notes')}
      value={form.notes}
      onChange={(v: string) => setForm({ ...form, notes: v })}
      placeholder="..."
      multiline
      lines={3}
      theme={theme}
    />
  </View>
);

// ── Note Form ──
export const NoteForm = ({ form, setForm, t, theme }: any) => (
  <View>
    <Field
      label={t('fields.note_content')}
      value={form.data?.content}
      onChange={(v: string) =>
        setForm({ ...form, data: { ...form.data, content: v } })
      }
      placeholder="..."
      multiline
      lines={8}
      theme={theme}
    />
  </View>
);

// ── WiFi Form ──
export const WifiForm = ({
  form,
  setForm,
  showPw,
  setShowPw,
  t,
  theme,
}: any) => {
  const strength = SecurityModule.getPasswordStrength(form.data?.wifi_password);
  return (
    <View>
      <Field
        label={t('fields.ssid')}
        value={form.data?.ssid}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, ssid: v } })
        }
        placeholder="..."
        theme={theme}
      />
      <PasswordField
        label={t('fields.wifi_password')}
        value={form.data?.wifi_password}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, wifi_password: v } })
        }
        showPw={showPw}
        setShowPw={setShowPw}
        strength={strength}
        onGenerate={null}
        theme={theme}
      />
      <SelectChips
        label={t('fields.security')}
        options={SECURITY_TYPES}
        value={form.data?.security || 'WPA2'}
        onChange={(v: string) =>
          setForm({ ...form, data: { ...form.data, security: v } })
        }
        theme={theme}
      />
      <Field
        label={t('vault.notes')}
        value={form.notes}
        onChange={(v: string) => setForm({ ...form, notes: v })}
        placeholder="..."
        multiline
        lines={2}
        theme={theme}
      />
    </View>
  );
};

// ── Passkey Form ──
export const PasskeyForm = ({ form, setForm, t, theme }: any) => {
  const [importJson, setImportJson] = useState('');
  const [working, setWorking] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState<boolean | null>(null);
  const cc = {
    navy: theme?.navy || '#101828',
    sage: theme?.sage || '#72886f',
    sageLight: theme?.sageLight || 'rgba(114,136,111,0.12)',
    muted: theme?.muted || 'rgba(16,24,40,0.45)',
    inputBg: theme?.inputBg || 'rgba(255,255,255,0.7)',
    cardBorder: theme?.cardBorder || 'rgba(255,255,255,0.55)',
  };

  useEffect(() => {
    let mounted = true;

    PasskeyModule.isAvailable()
      .then((available) => {
        if (mounted) {
          setNativeAvailable(available);
        }
      })
      .catch(() => {
        if (mounted) {
          setNativeAvailable(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updatePasskey = (patch: any) =>
    setForm({ ...form, data: { ...form.data, ...patch } });

  const autofillRpId = () => {
    const rpId = SecurityModule.normalizePasskeyRpId(form.url, form.data?.rp_id);
    updatePasskey({
      rp_id: rpId,
      display_name:
        form.data?.display_name || form.username || rpId || 'Device passkey',
    });
  };

  const generateIds = () => {
    const generated = SecurityModule.generatePasskeyData({
      username: form.username,
      url: form.url,
      rpId: form.data?.rp_id,
      displayName: form.data?.display_name,
    });
    updatePasskey(generated);
  };

  const importPayload = () => {
    const parsed = SecurityModule.parsePasskeyPayload(importJson, {
      url: form.url,
      rpId: form.data?.rp_id,
      username: form.username,
    });
    if (!parsed.valid) {
      Alert.alert(t('passkey.import_title'), parsed.errors.join('\n'));
      return;
    }
    setForm({
      ...form,
      data: { ...form.data, ...parsed.normalized },
      url: form.url || !parsed.normalized.rp_id
        ? form.url
        : `https://${parsed.normalized.rp_id}`,
    });
    setImportJson('');
    Alert.alert(t('backup.success'), t('passkey.import_success'));
  };

  const ensureNativeAvailable = () => {
    if (nativeAvailable) {
      return true;
    }

    Alert.alert(
      t('passkey.native_unavailable_title'),
      t('passkey.native_unavailable_message'),
    );
    return false;
  };

  const createOnDevice = async () => {
    if (!ensureNativeAvailable()) {
      return;
    }
    if (!form.username || !(form.url || form.data?.rp_id)) {
      Alert.alert(
        t('passkey.native_create_title'),
        t('passkey.create_prereq'),
      );
      return;
    }

    try {
      setWorking(true);
      const requestJson = PasskeyModule.buildRegistrationRequest({
        title: form.title,
        username: form.username,
        url: form.url,
        rpId: form.data?.rp_id,
        displayName: form.data?.display_name,
        userHandle: form.data?.user_handle,
      });
      const result = await PasskeyModule.createPasskey(requestJson);
      const parsed = SecurityModule.parsePasskeyPayload(
        result.registrationResponseJson,
        {
          url: form.url,
          rpId: form.data?.rp_id,
          username: form.username,
        },
      );
      if (!parsed.normalized.credential_id) {
        Alert.alert(
          t('passkey.native_create_title'),
          t('passkey.native_create_failed'),
        );
        return;
      }

      const validation = SecurityModule.validatePasskeyItem({
        ...form,
        category: 'passkey',
        data: {
          ...form.data,
          ...parsed.normalized,
        },
      });
      if (!validation.valid) {
        Alert.alert(
          t('passkey.validation_title'),
          validation.errors.join('\n'),
        );
        return;
      }
      setForm({
        ...form,
        data: {
          ...form.data,
          ...validation.normalized,
          registration_response_json: result.registrationResponseJson,
        },
      });
      Alert.alert(t('backup.success'), t('passkey.native_create_success'));
    } catch (error: any) {
      Alert.alert(
        t('passkey.native_create_title'),
        error?.message || t('passkey.native_create_failed'),
      );
    } finally {
      setWorking(false);
    }
  };

  const authenticateOnDevice = async () => {
    if (!ensureNativeAvailable()) {
      return;
    }
    if (!form.data?.credential_id) {
      Alert.alert(t('passkey.native_auth_title'), t('passkey.auth_prereq'));
      return;
    }

    try {
      setWorking(true);
      const requestJson = PasskeyModule.buildAuthenticationRequest({
        url: form.url,
        rpId: form.data?.rp_id,
        credentialId: form.data?.credential_id,
        transport: form.data?.transport,
      });
      const result = await PasskeyModule.authenticatePasskey(requestJson);
      updatePasskey({
        authentication_response_json: result.authenticationResponseJson,
      });
      Alert.alert(t('backup.success'), t('passkey.native_auth_success'));
    } catch (error: any) {
      Alert.alert(
        t('passkey.native_auth_title'),
        error?.message || t('passkey.native_auth_failed'),
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <View>
      <Field
        label={t('fields.username')}
        value={form.username}
        onChange={(v: string) => setForm({ ...form, username: v })}
        placeholder="user@example.com"
        keyboardType="email-address"
        theme={theme}
      />
      <Field
        label={t('fields.url')}
        value={form.url}
        onChange={(v: string) => setForm({ ...form, url: v })}
        placeholder="https://example.com"
        keyboardType="url"
        theme={theme}
      />

      <View
        style={{
          backgroundColor: cc.sageLight,
          borderWidth: 1,
          borderColor: cc.cardBorder,
          borderRadius: 14,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: cc.navy,
            fontSize: 12,
            fontWeight: '700',
            marginBottom: 4,
          }}
        >
          {nativeAvailable === false
            ? t('passkey.native_unavailable')
            : t('passkey.native_ready')}
        </Text>
        <Text style={{ color: cc.muted, fontSize: 12, lineHeight: 18 }}>
          {t('passkey.native_hint')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={autofillRpId}
          style={{
            flex: 1,
            backgroundColor: cc.sageLight,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: cc.sage, fontSize: 12, fontWeight: '700' }}>
            {t('passkey.fill_rp_id')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={generateIds}
          style={{
            flex: 1,
            backgroundColor: cc.sageLight,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: cc.sage, fontSize: 12, fontWeight: '700' }}>
            {t('passkey.generate_ids')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TouchableOpacity
          onPress={createOnDevice}
          disabled={working}
          style={{
            flex: 1,
            backgroundColor: cc.sage,
            borderWidth: 1,
            borderColor: cc.sage,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: working ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {working ? t('passkey.native_working') : t('passkey.native_create')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={authenticateOnDevice}
          disabled={working || !form.data?.credential_id}
          style={{
            flex: 1,
            backgroundColor: cc.inputBg,
            borderWidth: 1,
            borderColor: cc.cardBorder,
            borderRadius: 12,
            paddingVertical: 10,
            alignItems: 'center',
            opacity: working || !form.data?.credential_id ? 0.6 : 1,
          }}
        >
          <Text style={{ color: cc.navy, fontSize: 12, fontWeight: '700' }}>
            {working ? t('passkey.native_working') : t('passkey.native_auth')}
          </Text>
        </TouchableOpacity>
      </View>

      <Field
        label={t('fields.passkey_rp_id')}
        value={form.data?.rp_id}
        onChange={(v: string) => updatePasskey({ rp_id: v })}
        placeholder="example.com"
        theme={theme}
      />
      <Field
        label={t('fields.passkey_credential_id')}
        value={form.data?.credential_id}
        onChange={(v: string) =>
          updatePasskey({ credential_id: SecurityModule.sanitizeBase64Url(v) })
        }
        placeholder="Base64URL credential id"
        theme={theme}
      />
      <Field
        label={t('fields.passkey_user_handle')}
        value={form.data?.user_handle}
        onChange={(v: string) =>
          updatePasskey({ user_handle: SecurityModule.sanitizeBase64Url(v) })
        }
        placeholder="Base64URL user handle"
        theme={theme}
      />
      <Field
        label={t('fields.passkey_display_name')}
        value={form.data?.display_name}
        onChange={(v: string) => updatePasskey({ display_name: v })}
        placeholder="Device passkey"
        theme={theme}
      />
      <SelectChips
        label={t('fields.passkey_transport')}
        options={PASSKEY_TRANSPORTS}
        value={form.data?.transport || 'internal'}
        onChange={(v: string) => updatePasskey({ transport: v })}
        theme={theme}
      />
      <Field
        label={t('passkey.import_json')}
        value={importJson}
        onChange={setImportJson}
        placeholder={t('passkey.import_placeholder')}
        multiline
        lines={5}
        theme={theme}
      />
      <TouchableOpacity
        onPress={importPayload}
        style={{
          backgroundColor: cc.inputBg,
          borderWidth: 1,
          borderColor: cc.cardBorder,
          borderRadius: 12,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: cc.navy, fontSize: 12, fontWeight: '700' }}>
          {t('passkey.import_apply')}
        </Text>
      </TouchableOpacity>
      <Field
        label={t('vault.notes')}
        value={form.notes}
        onChange={(v: string) => setForm({ ...form, notes: v })}
        placeholder="..."
        multiline
        lines={3}
        theme={theme}
      />
    </View>
  );
};

// ── Form Router ──
export const CategoryForm = ({
  category,
  form,
  setForm,
  showPw,
  setShowPw,
  pwLen,
  t,
  theme,
}: any) => {
  switch (category) {
    case 'card':
      return (
        <CardForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          t={t}
          theme={theme}
        />
      );
    case 'identity':
      return <IdentityForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'note':
      return <NoteForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'wifi':
      return (
        <WifiForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          t={t}
          theme={theme}
        />
      );
    case 'passkey':
      return <PasskeyForm form={form} setForm={setForm} t={t} theme={theme} />;
    default:
      return (
        <LoginForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          pwLen={pwLen}
          t={t}
          theme={theme}
        />
      );
  }
};
