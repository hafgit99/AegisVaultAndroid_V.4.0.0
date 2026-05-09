/* eslint-disable react-native/no-inline-styles, react/no-unstable-nested-components */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Clipboard, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Attachment,
  PasswordHistoryEntry,
  SecurityModule,
  SharedVaultSpace,
  VaultItem,
  VaultSettings,
} from '../SecurityModule';
import { SecureAppSettings } from '../SecureAppSettings';
import { HIBPModule } from '../HIBPModule';
import { AttachmentSection } from './AttachmentSection';
import { TOTPDisplay } from './TOTPDisplay';

interface DetailModalProps {
  visible: boolean;
  item: VaultItem | null;
  onRefresh?: () => Promise<void> | void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFav: () => void;
  clipClear: number;
  settings: VaultSettings;
  theme: any;
  sharedSpaces: SharedVaultSpace[];
  styles: any;
  colors: any;
  getCatIcon: (category: string) => string;
}

export const DetailModal = ({
  styles: s,
  colors: C,
  getCatIcon,
  ...props
}: DetailModalProps) => {
  const {
    visible,
    item,
    onRefresh,
    onClose,
    onEdit,
    onDelete,
    onFav,
    clipClear,
    settings,
    theme,
    sharedSpaces,
  } = props;

  const { t } = useTranslation();
  const cc = { ...C, ...(theme || {}) };
  const isDark = String(cc.bg || '').toLowerCase() === '#0b1220';
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<PasswordHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [breachResult, setBreachResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [breachEnabled, setBreachEnabled] = useState(
    Boolean(settings?.breachCheckEnabled),
  );
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supportsHistory =
    item?.category === 'login' ||
    item?.category === 'wifi' ||
    item?.category === 'card' ||
    item?.category === 'passkey';

  useEffect(() => {
    if (visible && item?.id) {
      SecurityModule.getAttachments(item.id).then(setAttachments);
      if (supportsHistory) {
        setHistoryLoading(true);
        SecurityModule.getPasswordHistory(item.id, 12)
          .then(setHistory)
          .finally(() => setHistoryLoading(false));
      } else {
        setHistory([]);
      }
    }
    setShowPw(false);
    setBreachResult(null);
    setBreachEnabled(Boolean(settings?.breachCheckEnabled));
  }, [visible, item, supportsHistory, settings?.breachCheckEnabled]);

  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) {
        clearTimeout(clipboardTimerRef.current);
        clipboardTimerRef.current = null;
      }
    };
  }, []);

  const requestBreachConsentAndCheck = async (pw: string) => {
    Alert.alert(
      t('breach_extra.privacy_title'),
      t('breach_extra.privacy_message'),
      [
        { text: t('vault.cancel'), style: 'cancel' },
        {
          text: t('breach_extra.enable_and_check'),
          onPress: async () => {
            await SecureAppSettings.update({ breachCheckEnabled: true }, SecurityModule.db);
            setBreachEnabled(true);
            await checkBreach(pw, true);
          },
        },
      ],
    );
  };

  const checkBreach = async (pw: string, forceRefresh: boolean = false) => {
    setChecking(true);
    const result = await HIBPModule.checkPassword(pw, {
      enabled: breachEnabled,
      forceRefresh,
    });
    setBreachResult(result);
    await SecurityModule.logSecurityEvent('breach_check', 'info', {
      status: result.status,
      count: result.count,
      cached: result.cached,
      itemId: item?.id || null,
    });
    setChecking(false);
  };

  if (!item) return null;
  let data: any = {};
  try {
    data = item.data ? JSON.parse(item.data) : {};
  } catch {}
  const sharedAssignment = SecurityModule.parseSharedAssignment(item);
  const sharedSpace = sharedSpaces?.find(
    (space: SharedVaultSpace) => space.id === sharedAssignment?.spaceId,
  );

  const copy = (txt: string, lbl: string) => {
    Clipboard.setString(txt);
    setCopied(lbl);
    setTimeout(() => setCopied(null), 2000);
    if (clipboardTimerRef.current) {
      clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = null;
    }
    if (clipClear > 0) {
      clipboardTimerRef.current = setTimeout(() => {
        Clipboard.setString('');
        clipboardTimerRef.current = null;
      }, clipClear * 1000);
    }
  };

  const DField = ({ label, value, secret, copyKey }: any) => {
    if (!value) return null;
    const display = secret && !showPw ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : value;
    return (
      <View style={{ marginBottom: 14 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: cc.muted,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {label}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: cc.navy,
              flex: 1,
              flexShrink: 1,
              lineHeight: 21,
            }}
          >
            {display}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {secret && (
              <TouchableOpacity onPress={() => setShowPw(!showPw)}>
                <Text style={{ fontSize: 16 }}>{showPw ? '\uD83D\uDE48' : '\uD83D\uDC41\uFE0F'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => copy(value, copyKey)}>
              <Text
                style={{
                  fontSize: 14,
                  color: copied === copyKey ? cc.green : cc.sage,
                }}
              >
                {copied === copyKey ? '\u2713' : '\uD83D\uDCCB'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {secret && (label.includes('Sifre') || label.includes('Password')) && (
          <View style={{ marginTop: 8 }}>
            {checking ? (
              <Text
                style={{ fontSize: 12, color: cc.muted, fontWeight: '600' }}
              >
                {t('breach.checking')}
              </Text>
            ) : !breachEnabled ? (
              <TouchableOpacity
                onPress={() => requestBreachConsentAndCheck(value)}
                style={{
                  backgroundColor: isDark
                    ? 'rgba(245,158,11,0.18)'
                    : 'rgba(245,158,11,0.12)',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: '#d97706', fontWeight: '700' }}
                >
                  {t('breach_extra.enable_prompt')}
                </Text>
              </TouchableOpacity>
            ) : breachResult === null ? (
              <TouchableOpacity
                onPress={() => checkBreach(value)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark
                    ? 'rgba(52,211,153,0.16)'
                    : 'rgba(114,136,111,0.1)',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: cc.sage, fontWeight: '700' }}
                >
                  {t('breach.check')}
                </Text>
              </TouchableOpacity>
            ) : breachResult.status === 'unavailable' ? (
              <View
                style={{
                  backgroundColor: isDark
                    ? 'rgba(148,163,184,0.2)'
                    : 'rgba(100,116,139,0.1)',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  gap: 4,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: cc.navy, fontWeight: '700' }}
                >
                  {t('breach_extra.unavailable')}
                </Text>
                <Text style={{ fontSize: 11, color: cc.muted }}>
                  {t('breach_extra.unavailable_desc')}
                </Text>
              </View>
            ) : breachResult.count > 0 ? (
              <View
                style={{
                  backgroundColor: isDark
                    ? 'rgba(248,113,113,0.2)'
                    : 'rgba(239, 68, 68, 0.1)',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: cc.red, fontWeight: '700' }}
                >
                  {t('breach.compromised', { count: breachResult.count })}
                </Text>
                <Text style={{ fontSize: 11, color: cc.red, marginTop: 4 }}>
                  {t('breach_extra.rotate_now')}
                </Text>
                {breachResult.checkedAt ? (
                  <Text style={{ fontSize: 11, color: cc.muted, marginTop: 4 }}>
                    {t('breach_extra.checked_at', {
                      date: new Date(breachResult.checkedAt).toLocaleString(),
                    })}
                    {breachResult.cached ? ` \u2022 ${t('breach_extra.cached')}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: isDark
                    ? 'rgba(34,197,94,0.2)'
                    : 'rgba(34, 197, 94, 0.1)',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: cc.green, fontWeight: '700' }}
                >
                  {t('breach.safe')}
                </Text>
                {breachResult?.checkedAt ? (
                  <Text style={{ fontSize: 11, color: cc.muted, marginTop: 4 }}>
                    {t('breach_extra.checked_at', {
                      date: new Date(breachResult.checkedAt).toLocaleString(),
                    })}
                    {breachResult.cached ? ` \u2022 ${t('breach_extra.cached')}` : ''}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Scope of getHistoryFieldLabel ensured for historical purposes
  const getHistoryFieldLabel = (field: PasswordHistoryEntry['field']) => {
    const keys: Record<string, string> = {
      password: 'password',
      wifi_password: 'wifi_password',
      pin: 'pin',
      cvv: 'cvv',
      credential_id: 'passkey_credential_id',
    };
    const key = keys[field] || field;
    return t(`fields.${key}`);
  };

  const restoreFromHistory = (entry: PasswordHistoryEntry) => {
    Alert.alert(t('history.restore_title'), t('history.restore_confirm'), [
      { text: t('vault.cancel'), style: 'cancel' },
      {
        text: t('history.restore_btn'),
        style: 'destructive',
        onPress: async () => {
          if (!item.id) return;
          const ok = await SecurityModule.restorePasswordFromHistory(
            item.id,
            entry.id,
          );
          if (!ok) {
            Alert.alert(t('backup.msg_err'), t('history.restore_failed'));
            return;
          }
          await onRefresh?.();
          Alert.alert(t('backup.success'), t('history.restore_success'));
          setHistory(await SecurityModule.getPasswordHistory(item.id, 12));
        },
      },
    ]);
  };

  const renderCatFields = () => {
    switch (item.category) {
      case 'card':
        return (
          <>
            {DField({
              label: t('fields.cardholder'),
              value: data.cardholder,
              copyKey: 'ch',
            })}
            {DField({
              label: t('fields.card_number'),
              value: data.card_number,
              copyKey: 'cn',
            })}
            {DField({
              label: t('fields.expiry'),
              value: data.expiry,
              copyKey: 'ex',
            })}
            {DField({
              label: t('fields.cvv'),
              value: data.cvv,
              secret: true,
              copyKey: 'cv',
            })}
            {DField({
              label: t('fields.pin'),
              value: data.pin,
              secret: true,
              copyKey: 'pn',
            })}
          </>
        );
      case 'identity':
        return (
          <>
            {DField({
              label: t('fields.first_name'),
              value: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
              copyKey: 'nm',
            })}
            {DField({
              label: t('fields.national_id'),
              value: data.national_id,
              secret: true,
              copyKey: 'tc',
            })}
            {DField({
              label: t('fields.birthday'),
              value: data.birthday,
              copyKey: 'bd',
            })}
            {DField({
              label: t('fields.phone'),
              value: data.phone,
              copyKey: 'ph',
            })}
            {DField({
              label: t('fields.email'),
              value: data.email,
              copyKey: 'em',
            })}
            {DField({
              label: t('fields.company'),
              value: data.company,
              copyKey: 'co',
            })}
            {DField({
              label: t('fields.address'),
              value: data.address,
              copyKey: 'ad',
            })}
          </>
        );
      case 'note':
        return DField({
          label: t('fields.note_content'),
          value: data.content,
          copyKey: 'nt',
        });
      case 'wifi':
        return (
          <>
            {DField({
              label: t('fields.ssid'),
              value: data.ssid,
              copyKey: 'ss',
            })}
            {DField({
              label: t('fields.wifi_password'),
              value: data.wifi_password,
              secret: true,
              copyKey: 'wp',
            })}
            {DField({
              label: t('fields.security'),
              value: data.security,
              copyKey: 'sc',
            })}
          </>
        );
      case 'passkey':
        return (
          <>
            {DField({
              label: t('fields.username'),
              value: item.username,
              copyKey: 'pkus',
            })}
            {DField({
              label: t('fields.url'),
              value: item.url,
              copyKey: 'pkurl',
            })}
            {DField({
              label: t('fields.passkey_rp_id'),
              value: data.rp_id,
              copyKey: 'pkrp',
            })}
            {DField({
              label: t('fields.passkey_credential_id'),
              value: data.credential_id,
              secret: true,
              copyKey: 'pkcid',
            })}
            {DField({
              label: t('fields.passkey_user_handle'),
              value: data.user_handle,
              secret: true,
              copyKey: 'pkuh',
            })}
            {DField({
              label: t('fields.passkey_display_name'),
              value: data.display_name,
              copyKey: 'pkdn',
            })}
            {DField({
              label: t('fields.passkey_transport'),
              value: data.transport,
              copyKey: 'pktp',
            })}
            {DField({
              label: t('passkey.mode_label'),
              value:
                data.mode === 'rp_connected'
                  ? t('passkey.mode_rp_connected')
                  : t('passkey.mode_local_helper'),
              copyKey: 'pkmode',
            })}
            {DField({
              label: t('passkey.challenge_source_label'),
              value:
                data.challenge_source === 'server'
                  ? t('passkey.challenge_server')
                  : t('passkey.challenge_local_helper'),
              copyKey: 'pkchallenge',
            })}
            {DField({
              label: t('passkey.server_verified_label'),
              value: data.server_verified
                ? t('passkey.verified_yes')
                : t('passkey.verified_no'),
              copyKey: 'pkverified',
            })}
            {DField({
              label: t('passkey.last_registration_label'),
              value: data.last_registration_at,
              copyKey: 'pkregat',
            })}
            {DField({
              label: t('passkey.last_auth_label'),
              value: data.last_auth_at,
              copyKey: 'pkauthat',
            })}
          </>
        );
      case 'crypto_wallet':
        return (
          <>
            {DField({
              label: t('fields.wallet_network'),
              value: data.network,
              copyKey: 'cwnet',
            })}
            {DField({
              label: t('fields.wallet_address'),
              value: data.address,
              copyKey: 'cwaddr',
            })}
            {DField({
              label: t('fields.wallet_derivation_path'),
              value: data.derivation_path,
              copyKey: 'cwpath',
            })}
            {DField({
              label: t('fields.wallet_balance'),
              value: data.manual_balance,
              copyKey: 'cwbal',
            })}
            {DField({
              label: t('fields.wallet_secret'),
              value: item.password,
              secret: true,
              copyKey: 'cwsec',
            })}
          </>
        );
      case 'document':
        return (
          <>
            {DField({
              label: t('fields.document_type'),
              value: data.document_type,
              copyKey: 'doctype',
            })}
            {DField({
              label: t('fields.document_number'),
              value: data.document_number,
              secret: true,
              copyKey: 'docnum',
            })}
            {DField({
              label: t('fields.document_issuer'),
              value: data.issuer,
              copyKey: 'docissuer',
            })}
            {DField({
              label: t('fields.document_expiry'),
              value: data.expires_at,
              copyKey: 'docexp',
            })}
          </>
        );
      default:
        return (
          <>
            {DField({
              label: t('fields.username'),
              value: item.username,
              copyKey: 'us',
            })}
            {DField({
              label: t('fields.password'),
              value: item.password,
              secret: true,
              copyKey: 'pw',
            })}
            {DField({ label: t('fields.url'), value: item.url, copyKey: 'ur' })}
            {data.totp_secret ? (
              <TOTPDisplay
                secret={data.totp_secret}
                clipboardClearSeconds={clipClear}
              />
            ) : null}
          </>
        );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.mdOv}>
        <View
          style={[
            s.mdC,
            { backgroundColor: cc.bg, borderColor: cc.cardBorder },
          ]}
        >
          <View style={s.mdH}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
            >
              <Text style={{ fontSize: 22 }}>{getCatIcon(item.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.mdT, { color: cc.navy }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {sharedAssignment ? (
                  <Text
                    style={{
                      fontSize: 12,
                      color: cc.sage,
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    {t('shared.badge', {
                      name: sharedSpace?.name || t('shared.deleted_space'),
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={[s.mdX, { color: cc.muted }]}>{'\u2715'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {renderCatFields()}
            {sharedAssignment ? (
              <View style={{ marginBottom: 14 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: cc.muted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {t('shared.section_title')}
                </Text>
                <Text style={{ fontSize: 14, color: cc.navy, lineHeight: 21 }}>
                  {sharedSpace?.name || t('shared.deleted_space')}
                </Text>
                <Text style={{ fontSize: 12, color: cc.muted, marginTop: 4 }}>
                  {t(`shared.roles.${sharedAssignment.role}`)}
                  {sharedAssignment.isSensitive
                    ? ` \u2022 ${t('shared.sensitive_label')}`
                    : ''}
                  {sharedAssignment.emergencyAccess
                    ? ` \u2022 ${t('shared.emergency_enabled')}`
                    : ''}
                </Text>
                {sharedAssignment.notes ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: cc.navy,
                      lineHeight: 20,
                      marginTop: 8,
                    }}
                  >
                    {sharedAssignment.notes}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {item.notes ? (
              <View style={{ marginBottom: 14 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: cc.muted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {t('vault.notes')}
                </Text>
                <Text style={{ fontSize: 14, color: cc.navy, lineHeight: 21 }}>
                  {item.notes}
                </Text>
              </View>
            ) : null}
            {attachments.length > 0 && (
              <AttachmentSection
                itemId={item.id || null}
                attachments={attachments}
                onRefresh={async () =>
                  item.id
                    ? setAttachments(await SecurityModule.getAttachments(item.id))
                    : undefined
                }
                pendingFiles={[]}
                setPendingFiles={() => {}}
              />
            )}
            {supportsHistory && (
              <View style={{ marginTop: 8, marginBottom: 8 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: cc.muted,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  {t('history.title')}
                </Text>
                {historyLoading ? (
                  <Text style={{ fontSize: 12, color: cc.muted }}>
                    {t('history.loading')}
                  </Text>
                ) : history.length === 0 ? (
                  <Text style={{ fontSize: 12, color: cc.muted }}>
                    {t('history.empty')}
                  </Text>
                ) : (
                  history.map(h => (
                    <View
                      key={h.id}
                      style={{
                        borderWidth: 1,
                        borderColor: cc.cardBorder,
                        backgroundColor: cc.card,
                        borderRadius: 12,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: cc.navy,
                          fontWeight: '700',
                        }}
                      >
                        {getHistoryFieldLabel(h.field)}
                      </Text>
                      <Text
                        style={{ fontSize: 11, color: cc.muted, marginTop: 2 }}
                      >
                        {new Date(h.changed_at).toLocaleString()}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            color: cc.navy,
                            fontWeight: '600',
                            flex: 1,
                            marginRight: 10,
                          }}
                        >
                          {showPw ? h.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => restoreFromHistory(h)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: cc.sage,
                            backgroundColor: cc.sageLight,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: cc.sage,
                              fontWeight: '700',
                            }}
                          >
                            {t('history.restore_btn')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              style={[s.actBtn, { backgroundColor: cc.sageLight }]}
              onPress={onFav}
            >
              <Text style={s.actBtnT}>{item.favorite === 1 ? '\u2B50' : '\u2606'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actBtn, { backgroundColor: cc.sageLight, flex: 1 }]}
              onPress={onEdit}
            >
              <Text style={[s.actBtnT, { color: cc.sage }]}>
                {'\u270F\uFE0F'} {t('vault.edit')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actBtn, { backgroundColor: cc.redBg }]}
              onPress={() =>
                Alert.alert(t('vault.delete'), t('vault.delete_confirm'), [
                  { text: t('vault.cancel'), style: 'cancel' },
                  {
                    text: t('vault.delete'),
                    style: 'destructive',
                    onPress: onDelete,
                  },
                ])
              }
            >
              <Text style={[s.actBtnT, { color: cc.red }]}>{'\uD83D\uDDD1\uFE0F'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Styles
