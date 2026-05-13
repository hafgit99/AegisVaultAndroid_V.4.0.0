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
  bgAccent?: string;
  cardElevated?: string;
  shadow?: string;
  textPrimary?: string;
  textSecondary?: string;
  textTertiary?: string;
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

const createInviteCode = () =>
  Math.random().toString(36).slice(2, 6).toUpperCase() +
  '-' +
  Math.random().toString(36).slice(2, 6).toUpperCase();

export const SharedVaultsModal = ({
  visible,
  onClose,
  onUpdated,
  theme,
}: SharedVaultsModalProps) => {
  const { t } = useTranslation();
  const primaryText = theme.textPrimary || theme.navy;
  const secondaryText = theme.textSecondary || theme.muted;
  const tertiaryText = theme.textTertiary || theme.muted;
  const elevatedCard = theme.cardElevated || theme.card;
  const accentBg = theme.bgAccent || theme.sageLight;
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
    const now = new Date().toISOString();
    const nextStatus =
      (draftMember.status || 'active') as SharedVaultMember['status'];
    const member: SharedVaultMember = {
      id: draftMember.id || `member_${Date.now()}`,
      name: (draftMember.name || '').trim(),
      email: (draftMember.email || '').trim(),
      role: (draftMember.role || 'viewer') as SharedVaultMember['role'],
      status: nextStatus,
      inviteCode: nextStatus === 'pending' ? createInviteCode() : undefined,
      invitedAt: nextStatus === 'pending' ? now : undefined,
      acceptedAt: nextStatus === 'active' ? now : undefined,
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

  const updateDraftMember = (
    memberId: string,
    updater: (member: SharedVaultMember) => SharedVaultMember,
  ) => {
    setDraftSpace({
      ...draftSpace,
      members: (draftSpace.members || []).map(member =>
        member.id === memberId ? updater(member) : member,
      ),
    });
  };

  const acceptInvite = (memberId: string) => {
    const now = new Date().toISOString();
    updateDraftMember(memberId, member => ({
      ...member,
      status: 'active',
      acceptedAt: now,
      lastVerifiedAt: now,
    }));
  };

  const revokeInvite = (memberId: string) => {
    removeMember(memberId);
  };

  const setMembershipRole = (
    memberId: string,
    role: SharedVaultMember['role'],
  ) => {
    updateDraftMember(memberId, member => ({ ...member, role }));
  };

  const setMembershipStatus = (
    memberId: string,
    status: SharedVaultMember['status'],
  ) => {
    const now = new Date().toISOString();
    updateDraftMember(memberId, member => ({
      ...member,
      status,
      acceptedAt: status === 'active' ? member.acceptedAt || now : member.acceptedAt,
      lastVerifiedAt: status === 'active' ? now : member.lastVerifiedAt,
    }));
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

  const membershipSummary = {
    total: (draftSpace.members || []).length,
    active: (draftSpace.members || []).filter(member => member.status === 'active')
      .length,
    pending: (draftSpace.members || []).filter(member => member.status === 'pending')
      .length,
    emergency: (draftSpace.members || []).filter(
      member => member.status === 'emergency_only',
    ).length,
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
              <Text style={{ fontSize: 20, fontWeight: '800', color: primaryText }}>
                {t('settings.shared_vaults.title')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: secondaryText,
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                {t('shared.modal_subtitle')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={{ fontSize: 22, color: tertiaryText, padding: 4 }}>
                x
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View
              style={{
                backgroundColor: elevatedCard,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                padding: 16,
                marginBottom: 12,
                shadowColor: theme.shadow || '#000000',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.08,
                shadowRadius: 18,
                elevation: 3,
              }}
            >
              <Text
                style={{
                  color: tertiaryText,
                  fontSize: 11,
                  fontWeight: '900',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                }}
              >
                {t('shared.design_eyebrow')}
              </Text>
              <Text
                style={{
                  color: primaryText,
                  fontSize: 20,
                  fontWeight: '900',
                  marginTop: 5,
                }}
              >
                {t('shared.design_title')}
              </Text>
              <Text
                style={{
                  color: secondaryText,
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 6,
                }}
              >
                {t('shared.design_desc')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                {[
                  { label: t('shared.design_spaces'), value: spaces.length },
                  { label: t('shared.design_members'), value: membershipSummary.total },
                  { label: t('shared.design_pending'), value: membershipSummary.pending },
                ].map(card => (
                  <View
                    key={card.label}
                    style={{
                      flex: 1,
                      backgroundColor: accentBg,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: theme.sage, fontSize: 17, fontWeight: '900' }}>
                      {card.value}
                    </Text>
                    <Text style={{ color: secondaryText, fontSize: 10, fontWeight: '700', marginTop: 4 }}>
                      {card.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
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

              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                {[
                  { key: 'total', value: membershipSummary.total },
                  { key: 'active', value: membershipSummary.active },
                  { key: 'pending', value: membershipSummary.pending },
                  { key: 'emergency', value: membershipSummary.emergency },
                ].map(metric => (
                  <View
                    key={metric.key}
                    style={{
                      minWidth: 88,
                      backgroundColor: theme.inputBg,
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 11,
                        marginBottom: 4,
                      }}
                    >
                      {t(`shared.lifecycle.metrics.${metric.key}`)}
                    </Text>
                    <Text
                      style={{
                        color: theme.navy,
                        fontSize: 16,
                        fontWeight: '800',
                      }}
                    >
                      {metric.value}
                    </Text>
                  </View>
                ))}
              </View>

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
                      {member.inviteCode ? (
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>
                          {t('shared.invite_code', { code: member.inviteCode })}
                        </Text>
                      ) : null}
                      {member.invitedAt ? (
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                          {t('shared.invited_at', {
                            date: new Date(member.invitedAt).toLocaleDateString(),
                          })}
                        </Text>
                      ) : null}
                      {member.acceptedAt ? (
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                          {t('shared.accepted_at', {
                            date: new Date(member.acceptedAt).toLocaleDateString(),
                          })}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => removeMember(member.id)}>
                      <Text style={{ color: theme.red || '#dc2626', fontWeight: '700' }}>
                        {t('shared.remove')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    {member.status === 'pending' ? (
                      <>
                        <TouchableOpacity onPress={() => acceptInvite(member.id)}>
                          <Text style={{ color: theme.sage, fontWeight: '700', fontSize: 12 }}>
                            {t('shared.lifecycle.accept_invite')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => revokeInvite(member.id)}>
                          <Text
                            style={{
                              color: theme.red || '#dc2626',
                              fontWeight: '700',
                              fontSize: 12,
                            }}
                          >
                            {t('shared.lifecycle.revoke_invite')}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {member.status !== 'pending' ? (
                      <>
                        <TouchableOpacity
                          onPress={() =>
                            setMembershipRole(
                              member.id,
                              member.role === 'viewer' ? 'editor' : 'viewer',
                            )
                          }
                        >
                          <Text style={{ color: theme.sage, fontWeight: '700', fontSize: 12 }}>
                            {member.role === 'viewer'
                              ? t('shared.lifecycle.promote_editor')
                              : t('shared.lifecycle.set_viewer')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            setMembershipStatus(
                              member.id,
                              member.status === 'emergency_only'
                                ? 'active'
                                : 'emergency_only',
                            )
                          }
                        >
                          <Text style={{ color: theme.navy, fontWeight: '700', fontSize: 12 }}>
                            {member.status === 'emergency_only'
                              ? t('shared.lifecycle.restore_active')
                              : t('shared.lifecycle.emergency_mode')}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
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
