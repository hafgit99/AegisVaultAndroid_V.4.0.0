/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Attachment,
  SecurityModule,
  SharedVaultSpace,
  VaultItem,
  VaultSettings,
} from '../SecurityModule';
import { AttachmentSection } from './AttachmentSection';
import { CategoryForm } from './CategoryForms';
import { SelectChips, ToggleRow } from './FormFields';

interface AddModalProps {
  visible: boolean;
  item: VaultItem | null;
  onClose: () => void;
  onSave: (item: Partial<VaultItem>, pendingFiles: any[]) => void;
  settings: VaultSettings;
  theme: any;
  sharedSpaces: SharedVaultSpace[];
  styles: any;
  getCats: (t: any) => Array<{ id: string; label: string; icon?: string }>;
}

export const AddModal = ({
  styles: s,
  getCats,
  ...props
}: AddModalProps) => {
  const {
    visible,
    item,
    onClose,
    onSave,
    settings,
    theme,
    sharedSpaces,
  } = props;

  const { t } = useTranslation();
  const [form, setForm] = useState<any>({});
  const [showPw, setShowPw] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      let data = {};
      try {
        data = item?.data ? JSON.parse(item.data) : {};
      } catch {}
      setForm({
        title: item?.title || '',
        username: item?.username || '',
        password: item?.password || '',
        url: item?.url || '',
        notes: item?.notes || '',
        category: item?.category || 'login',
        favorite: item?.favorite || 0,
        data,
      });
      setShowPw(false);
      setPending([]);
      if (item?.id) SecurityModule.getAttachments(item.id).then(setAttachments);
      else setAttachments([]);
    }
  }, [visible, item]);

  const refreshAtt = async () => {
    if (item?.id) setAttachments(await SecurityModule.getAttachments(item.id));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={s.mdOv}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.mdC, { backgroundColor: theme.card }]}>
          <View style={s.mdH}>
            <Text style={[s.mdT, { color: theme.navy }]}>
              {item ? t('vault.edit') : t('vault.new_record')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[s.mdX, { color: theme.muted }]}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <SelectChips
              label={t('fields.category')}
              options={getCats(t).filter((c: any) => c.id !== 'all')}
              value={form.category}
              onChange={(v: string) =>
                setForm({
                  ...form,
                  category: v,
                  data: form.data?.shared ? { shared: form.data.shared } : {},
                })
              }
              theme={theme}
            />
            <View style={{ marginTop: 4, marginBottom: 6 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: theme.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 5,
                }}
              >
                {t('fields.title')}
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.inputBg,
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: theme.navy,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  fontWeight: '500',
                }}
                value={form.title}
                onChangeText={(v: string) => setForm({ ...form, title: v })}
                placeholder="..."
                placeholderTextColor={theme.muted}
              />
            </View>
            <CategoryForm
              category={form.category}
              form={form}
              setForm={setForm}
              showPw={showPw}
              setShowPw={setShowPw}
              pwLen={settings.passwordLength}
              t={t}
              theme={theme}
            />
            <View
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: theme.navy,
                  marginBottom: 8,
                }}
              >
                {t('fields.shared_space')}
              </Text>
              {sharedSpaces?.length ? (
                <>
                  <SelectChips
                    options={[
                      { id: '', label: t('shared.unassigned') },
                      ...sharedSpaces.map((space: SharedVaultSpace) => ({
                        id: space.id,
                        label: space.name,
                      })),
                    ]}
                    value={form.data?.shared?.spaceId || ''}
                    onChange={(spaceId: string) =>
                      setForm({
                        ...form,
                        data: {
                          ...form.data,
                          shared: spaceId
                            ? {
                                role: 'viewer',
                                ...form.data?.shared,
                                spaceId,
                              }
                            : undefined,
                        },
                      })
                    }
                    theme={theme}
                  />
                  {form.data?.shared?.spaceId ? (
                    <>
                      <SelectChips
                        label={t('fields.shared_role')}
                        options={[
                          { id: 'viewer', label: t('shared.roles.viewer') },
                          { id: 'editor', label: t('shared.roles.editor') },
                        ]}
                        value={form.data?.shared?.role || 'viewer'}
                        onChange={(role: string) =>
                          setForm({
                            ...form,
                            data: {
                              ...form.data,
                              shared: { ...form.data?.shared, role },
                            },
                          })
                        }
                        theme={theme}
                      />
                      <ToggleRow
                        label={t('shared.sensitive')}
                        value={Boolean(form.data?.shared?.isSensitive)}
                        onToggle={(value: boolean) =>
                          setForm({
                            ...form,
                            data: {
                              ...form.data,
                              shared: {
                                ...form.data?.shared,
                                isSensitive: value,
                              },
                            },
                          })
                        }
                        theme={theme}
                      />
                      <ToggleRow
                        label={t('shared.emergency_access')}
                        value={Boolean(form.data?.shared?.emergencyAccess)}
                        onToggle={(value: boolean) =>
                          setForm({
                            ...form,
                            data: {
                              ...form.data,
                              shared: {
                                ...form.data?.shared,
                                emergencyAccess: value,
                              },
                            },
                          })
                        }
                        theme={theme}
                      />
                      <View style={{ marginTop: 10 }}>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: theme.muted,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginBottom: 5,
                          }}
                        >
                          {t('fields.shared_notes')}
                        </Text>
                        <TextInput
                          style={{
                            backgroundColor: theme.card,
                            borderRadius: 14,
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            fontSize: 14,
                            color: theme.navy,
                            borderWidth: 1,
                            borderColor: theme.cardBorder,
                            fontWeight: '500',
                            minHeight: 72,
                            textAlignVertical: 'top',
                          }}
                          multiline
                          autoCorrect={false}
                          autoCapitalize="none"
                          value={form.data?.shared?.notes || ''}
                          onChangeText={(notes: string) =>
                            setForm({
                              ...form,
                              data: {
                                ...form.data,
                                shared: { ...form.data?.shared, notes },
                              },
                            })
                          }
                          placeholder={t('shared.notes_placeholder')}
                          placeholderTextColor={theme.muted}
                          accessibilityLabel={t('fields.shared_notes')}
                        />
                      </View>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
                  {t('shared.no_spaces_hint')}
                </Text>
              )}
            </View>
            <AttachmentSection
              itemId={item?.id || null}
              attachments={attachments}
              onRefresh={refreshAtt}
              pendingFiles={pending}
              setPendingFiles={setPending}
            />
          </ScrollView>
          <TouchableOpacity
            style={[
              s.saveBtn,
              { backgroundColor: theme.sage },
              !form.title?.trim() && { opacity: 0.4 },
            ]}
            onPress={() => {
              if (!form.title?.trim()) return;
              if (form.category === 'passkey') {
                const validation = SecurityModule.validatePasskeyItem({
                  ...form,
                  data: form.data,
                });
                if (!validation.valid) {
                  Alert.alert(
                    t('passkey.validation_title'),
                    validation.errors.join('\n'),
                  );
                  return;
                }
                onSave(
                  {
                    ...form,
                    data: JSON.stringify(validation.normalized),
                  },
                  pending,
                );
                return;
              }
              onSave(
                { ...form, data: JSON.stringify(form.data || {}) },
                pending,
              );
            }}
            disabled={!form.title?.trim()}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
              {item ? t('vault.update') : t('vault.save')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
