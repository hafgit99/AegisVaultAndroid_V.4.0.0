import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SecurityModule,
  SharedVaultMember,
  SharedVaultSpace,
  SharingOverviewReport,
} from '../SecurityModule';
import { Field, SelectChips, ToggleRow } from './FormFields';
import { useTranslation } from 'react-i18next';

type ThemeShape = {
  bg: string;
  navy: string;
  sage: string;
  sageLight: string;
  card: string;
  cardBorder: string;
  muted: string;
  inputBg: string;
  red?: string;
};

interface SharedVaultsModalProps {
  visible: boolean;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
  theme: ThemeShape;
}

const KIND_OPTIONS = [
  { id: 'family', label: 'Family' },
  { id: 'team', label: 'Team' },
  { id: 'private', label: 'Private' },
];

const ROLE_OPTIONS = [
  { id: 'viewer', label: 'Viewer' },
  { id: 'editor', label: 'Editor' },
  { id: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'emergency_only', label: 'Emergency' },
];

export const SharedVaultsModal = ({
  visible,
  onClose,
  onUpdated,
  theme,
}: SharedVaultsModalProps) => {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<SharedVaultSpace[]>([]);
  const [report, setReport] = useState<SharingOverviewReport | null>(null);
  const [editingSpace, setEditingSpace] = useState<SharedVaultSpace | null>(
    null,
  );
  const [draftSpace, setDraftSpace] = useState<Partial<SharedVaultSpace>>({
    kind: 'family',
    defaultRole: 'viewer',
    allowExport: true,
    requireReview: true,
    members: [],
  });
  const [draftMember, setDraftMember] = useState<Partial<SharedVaultMember>>({
    role: 'viewer',
    status: 'active',
  });

  const load = useCallback(async () => {
    const [nextSpaces, nextReport] = await Promise.all([
      SecurityModule.getSharedVaultSpaces(),
      SecurityModule.getSharingOverview(),
    ]);
    setSpaces(nextSpaces);
    setReport(nextReport);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    setEditingSpace(null);
    setDraftSpace({
      kind: 'family',
      defaultRole: 'viewer',
      allowExport: true,
      requireReview: true,
      members: [],
    });
    setDraftMember({ role: 'viewer', status: 'active' });
  }, [visible, load]);

  const beginEdit = (space?: SharedVaultSpace) => {
    if (space) {
      setEditingSpace(space);
      setDraftSpace(space);
    } else {
      setEditingSpace(null);
      setDraftSpace({
        kind: 'family',
        defaultRole: 'viewer',
        allowExport: true,
        requireReview: true,
        members: [],
      });
    }
    setDraftMember({ role: 'viewer', status: 'active' });
  };

  const addMember = () => {
    if (!(draftMember.name || '').trim() && !(draftMember.email || '').trim()) {
      return;
    }
    const member: SharedVaultMember = {
      id: draftMember.id || `member_${Date.now()}`,
      name: (draftMember.name || '').trim(),
      email: (draftMember.email || '').trim(),
      role: (draftMember.role || 'viewer') as SharedVaultMember['role'],
      status: (draftMember.status || 'active') as SharedVaultMember['status'],
      deviceLabel: (draftMember.deviceLabel || '').trim() || undefined,
      notes: (draftMember.notes || '').trim() || undefined,
      lastVerifiedAt: new Date().toISOString(),
    };
    setDraftSpace({
      ...draftSpace,
      members: [...(draftSpace.members || []), member],
    });
    setDraftMember({ role: draftSpace.defaultRole || 'viewer', status: 'active' });
  };

  const removeMember = (memberId: string) => {
    setDraftSpace({
      ...draftSpace,
      members: (draftSpace.members || []).filter(member => member.id !== memberId),
    });
  };

  const saveSpace = async () => {
    const saved = await SecurityModule.saveSharedVaultSpace({
      ...draftSpace,
      id: editingSpace?.id || draftSpace.id,
      members: draftSpace.members || [],
    });
    if (!saved) return;
    await load();
    await onUpdated?.();
    beginEdit(saved);
  };

  const deleteSpace = async (spaceId: string) => {
    await SecurityModule.deleteSharedVaultSpace(spaceId);
    await load();
    await onUpdated?.();
    if (editingSpace?.id === spaceId) {
      beginEdit();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: theme.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 24,
            maxHeight: '94%',
            borderWidth: 1,
            borderColor: theme.cardBorder,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.navy }}>
                {t('settings.shared_vaults.title')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.muted,
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                {t('shared.modal_subtitle')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={{ fontSize: 22, color: theme.muted, padding: 4 }}>
                x
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {report ? (
              <View
                style={{
                  backgroundColor: theme.card,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  padding: 18,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    color: theme.muted,
                    fontSize: 12,
                    fontWeight: '700',
                    marginBottom: 8,
                  }}
                >
                  {t('shared.overview_title')}
                </Text>
                <Text style={{ fontSize: 34, fontWeight: '800', color: theme.sage }}>
                  {report.score}
                  <Text style={{ fontSize: 15, color: theme.muted }}>/100</Text>
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6 }}>
                  {t('shared.overview_summary', {
                    spaces: report.summary.spaces,
                    items: report.summary.sharedItems,
                    pending: report.summary.pendingMembers,
                  })}
                </Text>
                <View style={{ marginTop: 10 }}>
                  {report.actions.map(action => (
                    <Text
                      key={action}
                      style={{
                        color: theme.navy,
                        fontSize: 12,
                        lineHeight: 18,
                        marginBottom: 6,
                      }}
                    >
                      - {action}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            <View
              style={{
                backgroundColor: theme.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                padding: 18,
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: theme.navy, fontSize: 14, fontWeight: '700' }}>
                  {t('shared.spaces_title')}
                </Text>
                <TouchableOpacity onPress={() => beginEdit()} activeOpacity={0.7}>
                  <Text style={{ color: theme.sage, fontWeight: '700', fontSize: 12 }}>
                    {t('shared.new_space')}
                  </Text>
                </TouchableOpacity>
              </View>

              {spaces.length === 0 ? (
                <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18 }}>
                  {t('shared.no_spaces_hint')}
                </Text>
              ) : (
                spaces.map((space, index) => (
                  <TouchableOpacity
                    key={space.id}
                    onPress={() => beginEdit(space)}
                    activeOpacity={0.7}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: theme.cardBorder,
                      paddingTop: index === 0 ? 0 : 12,
                      marginTop: index === 0 ? 0 : 12,
                    }}
                  >
                    <Text style={{ color: theme.navy, fontSize: 14, fontWeight: '700' }}>
                      {space.name}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                      {t(`shared.kinds.${space.kind}`)} - {space.members.length}{' '}
                      {t('shared.member_count')}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View
              style={{
                backgroundColor: theme.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                padding: 18,
              }}
            >
              <Text style={{ color: theme.navy, fontSize: 14, fontWeight: '700' }}>
                {editingSpace ? t('shared.edit_space') : t('shared.create_space')}
              </Text>

              <Field
                label={t('shared.name')}
                value={draftSpace.name}
                onChange={(name: string) => setDraftSpace({ ...draftSpace, name })}
                placeholder={t('shared.name_placeholder')}
                theme={theme}
              />
              <Field
                label={t('shared.description')}
                value={draftSpace.description}
                onChange={(description: string) =>
                  setDraftSpace({ ...draftSpace, description })
                }
                placeholder={t('shared.description_placeholder')}
                theme={theme}
              />
              <SelectChips
                label={t('shared.kind')}
                options={KIND_OPTIONS.map(option => ({
                  ...option,
                  label: t(`shared.kinds.${option.id}`),
                }))}
                value={draftSpace.kind || 'family'}
                onChange={(kind: string) =>
                  setDraftSpace({ ...draftSpace, kind: kind as SharedVaultSpace['kind'] })
                }
                theme={theme}
              />
              <SelectChips
                label={t('shared.default_role')}
                options={ROLE_OPTIONS.map(option => ({
                  ...option,
                  label: t(`shared.roles.${option.id}`),
                }))}
                value={draftSpace.defaultRole || 'viewer'}
                onChange={(defaultRole: string) =>
                  setDraftSpace({
                    ...draftSpace,
                    defaultRole: defaultRole as SharedVaultSpace['defaultRole'],
                  })
                }
                theme={theme}
              />
              <ToggleRow
                label={t('shared.allow_export')}
                value={draftSpace.allowExport !== false}
                onToggle={(allowExport: boolean) =>
                  setDraftSpace({ ...draftSpace, allowExport })
                }
                theme={theme}
              />
              <ToggleRow
                label={t('shared.require_review')}
                value={Boolean(draftSpace.requireReview)}
                onToggle={(requireReview: boolean) =>
                  setDraftSpace({ ...draftSpace, requireReview })
                }
                theme={theme}
              />

              <Text
                style={{
                  color: theme.navy,
                  fontSize: 13,
                  fontWeight: '700',
                  marginTop: 14,
                  marginBottom: 8,
                }}
              >
                {t('shared.members')}
              </Text>

              {(draftSpace.members || []).map(member => (
                <View
                  key={member.id}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: theme.navy,
                          fontSize: 13,
                          fontWeight: '700',
                        }}
                      >
                        {member.name || member.email}
                      </Text>
                      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
                        {t(`shared.roles.${member.role}`)} -{' '}
                        {t(`shared.status.${member.status}`)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeMember(member.id)}>
                      <Text style={{ color: theme.red || '#dc2626', fontWeight: '700' }}>
                        {t('shared.remove')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <Field
                label={t('shared.member_name')}
                value={draftMember.name}
                onChange={(name: string) => setDraftMember({ ...draftMember, name })}
                placeholder={t('shared.member_name_placeholder')}
                theme={theme}
              />
              <Field
                label={t('shared.member_email')}
                value={draftMember.email}
                onChange={(email: string) => setDraftMember({ ...draftMember, email })}
                placeholder="name@example.com"
                theme={theme}
              />
              <SelectChips
                label={t('shared.member_role')}
                options={ROLE_OPTIONS.map(option => ({
                  ...option,
                  label: t(`shared.roles.${option.id}`),
                }))}
                value={draftMember.role || draftSpace.defaultRole || 'viewer'}
                onChange={(role: string) =>
                  setDraftMember({
                    ...draftMember,
                    role: role as SharedVaultMember['role'],
                  })
                }
                theme={theme}
              />
              <SelectChips
                label={t('shared.member_status')}
                options={STATUS_OPTIONS.map(option => ({
                  ...option,
                  label: t(`shared.status.${option.id}`),
                }))}
                value={draftMember.status || 'active'}
                onChange={(status: string) =>
                  setDraftMember({
                    ...draftMember,
                    status: status as SharedVaultMember['status'],
                  })
                }
                theme={theme}
              />
              <Field
                label={t('shared.device_label')}
                value={draftMember.deviceLabel}
                onChange={(deviceLabel: string) =>
                  setDraftMember({ ...draftMember, deviceLabel })
                }
                placeholder={t('shared.device_label_placeholder')}
                theme={theme}
              />
              <TouchableOpacity
                onPress={addMember}
                style={{
                  backgroundColor: theme.inputBg,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: theme.navy, fontSize: 12, fontWeight: '700' }}>
                  {t('shared.add_member')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveSpace}
                disabled={!(draftSpace.name || '').trim()}
                style={{
                  backgroundColor: theme.sage,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: (draftSpace.name || '').trim() ? 1 : 0.45,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {editingSpace ? t('shared.save_space') : t('shared.create_space')}
                </Text>
              </TouchableOpacity>

              {editingSpace ? (
                <TouchableOpacity
                  onPress={() => deleteSpace(editingSpace.id)}
                  style={{ alignItems: 'center', marginTop: 12 }}
                >
                  <Text style={{ color: theme.red || '#dc2626', fontWeight: '700' }}>
                    {t('shared.delete_space')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};
