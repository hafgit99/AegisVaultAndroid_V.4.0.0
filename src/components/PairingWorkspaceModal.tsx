/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState } from 'react';
import {
  DeviceEventEmitter,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { BrowserPairingService } from '../BrowserPairingService';
import { SETTINGS_CHANGED_EVENT } from '../SecureAppSettings';
import { Field, SelectChips } from './FormFields';
import { SecurityModule } from '../SecurityModule';

export const PairingWorkspaceModal = ({
  visible,
  onClose,
  theme,
  insets,
}: any) => {
  const { t } = useTranslation();
  const primaryText = theme.textPrimary || theme.navy;
  const secondaryText = theme.textSecondary || theme.muted;
  const tertiaryText = theme.textTertiary || theme.muted;
  const elevatedCard = theme.cardElevated || theme.card;
  const accentBg = theme.bgAccent || theme.sageLight;
  const [records, setRecords] = useState(() => BrowserPairingService.list());
  const [label, setLabel] = useState('');
  const [origin, setOrigin] = useState('');
  const [platform, setPlatform] = useState<'browser_extension' | 'desktop_app'>(
    'browser_extension',
  );

  const refresh = () => setRecords(BrowserPairingService.list());

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SETTINGS_CHANGED_EVENT, refresh);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (visible) {
      refresh();
    }
  }, [visible]);

  const summary = BrowserPairingService.getSummary();

  const createPairing = async () => {
    if (!label.trim()) {
      return;
    }
    await BrowserPairingService.createPairing(
      {
        label,
        origin,
        platform,
      },
      SecurityModule.db,
    );
    setLabel('');
    setOrigin('');
    refresh();
  };

  const markPaired = async (id: string) => {
    await BrowserPairingService.markPaired(id, SecurityModule.db);
    refresh();
  };

  const revoke = async (id: string) => {
    await BrowserPairingService.revokePairing(id, SecurityModule.db);
    refresh();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top || 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <Text style={{ fontSize: 24, color: primaryText }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: primaryText }}>
              {t('pairing_workspace.title')}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 18, marginTop: 2, color: secondaryText }}>
              {t('pairing_workspace.subtitle')}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: Math.max(32, (insets.bottom || 0) + 20),
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor: theme.cardBorder,
              borderRadius: 24,
              padding: 16,
              backgroundColor: elevatedCard,
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
              {t('pairing_workspace.design_eyebrow')}
            </Text>
            <Text style={{ color: primaryText, fontSize: 20, fontWeight: '900', marginTop: 5 }}>
              {t('pairing_workspace.design_title')}
            </Text>
            <Text style={{ color: secondaryText, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
              {t('pairing_workspace.design_desc')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              {[
                { label: t('pairing_workspace.metrics.paired'), value: summary.paired },
                { label: t('pairing_workspace.metrics.desktop'), value: summary.desktopApp },
                { label: t('pairing_workspace.metrics.browser'), value: summary.browserExtension },
              ].map(card => (
                <View
                  key={card.label}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: theme.cardBorder,
                    borderRadius: 16,
                    backgroundColor: accentBg,
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
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { key: 'paired', value: summary.paired },
              { key: 'pending', value: summary.pending },
              { key: 'expired', value: summary.expiredPending },
              { key: 'stale', value: summary.stalePaired },
              { key: 'browser', value: summary.browserExtension },
              { key: 'desktop', value: summary.desktopApp },
            ].map(metric => (
              <View
                key={metric.key}
                style={{
                  flex: 1,
                  minWidth: 120,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  borderRadius: 16,
                  padding: 14,
                  backgroundColor: theme.card,
                }}
              >
                <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 6 }}>
                  {t(`pairing_workspace.metrics.${metric.key}`)}
                </Text>
                <Text style={{ color: theme.navy, fontSize: 24, fontWeight: '800' }}>
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: theme.cardBorder,
              borderRadius: 18,
              padding: 14,
              backgroundColor: theme.card,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: theme.navy, fontSize: 15, fontWeight: '800' }}>
              {t('pairing_workspace.create_title')}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
              {t('pairing_workspace.create_subtitle')}
            </Text>

            <Field
              label={t('pairing_workspace.label')}
              value={label}
              onChange={setLabel}
              placeholder={t('pairing_workspace.label_placeholder')}
              theme={theme}
            />
            <Field
              label={t('pairing_workspace.origin')}
              value={origin}
              onChange={setOrigin}
              placeholder={t('pairing_workspace.origin_placeholder')}
              theme={theme}
            />
            <SelectChips
              label={t('pairing_workspace.platform')}
              options={[
                {
                  id: 'browser_extension',
                  label: t('pairing_workspace.platforms.browser_extension'),
                },
                {
                  id: 'desktop_app',
                  label: t('pairing_workspace.platforms.desktop_app'),
                },
              ]}
              value={platform}
              onChange={(value: string) =>
                setPlatform(value as 'browser_extension' | 'desktop_app')
              }
              theme={theme}
            />
            <TouchableOpacity
              onPress={createPairing}
              disabled={!label.trim()}
              style={{
                marginTop: 8,
                backgroundColor: theme.sage,
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
                opacity: label.trim() ? 1 : 0.5,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                {t('pairing_workspace.create_button')}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: theme.cardBorder,
              borderRadius: 18,
              padding: 14,
              backgroundColor: theme.card,
            }}
          >
            <Text style={{ color: theme.navy, fontSize: 15, fontWeight: '800' }}>
              {t('pairing_workspace.list_title')}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
              {t('pairing_workspace.list_subtitle')}
            </Text>

            {records.length === 0 ? (
              <View
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  borderRadius: 14,
                  padding: 14,
                  backgroundColor: theme.inputBg,
                }}
              >
                <Text style={{ color: theme.navy, fontSize: 13, fontWeight: '700' }}>
                  {t('pairing_workspace.empty')}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                {records.map(record => {
                  const session = BrowserPairingService.getSessionState(record);
                  const handshake = BrowserPairingService.buildDesktopV5Handshake(record);
                  const stateKey = session.expired
                    ? 'expired'
                    : session.stale
                    ? 'stale'
                    : record.status;

                  return (
                  <View
                    key={record.id}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.cardBorder,
                      borderRadius: 14,
                      padding: 12,
                      backgroundColor: theme.inputBg,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.navy, fontSize: 13, fontWeight: '700' }}>
                          {record.label}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>
                          {t(`pairing_workspace.platforms.${record.platform}`)} /{' '}
                          {t(`pairing_workspace.status.${stateKey}`)}
                        </Text>
                        {record.origin ? (
                          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                            {record.origin}
                          </Text>
                        ) : null}
                        <Text style={{ color: theme.navy, fontSize: 12, marginTop: 8, fontWeight: '700' }}>
                          {t('pairing_workspace.pairing_code', {
                            code: record.pairingCode,
                          })}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>
                          {t('pairing_workspace.expires_at', {
                            date: new Date(session.expiresAt).toLocaleString(),
                          })}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 4 }}>
                          {t('pairing_workspace.capabilities', {
                            count: handshake.capabilities.length,
                          })}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                      {record.status === 'pending' && !session.expired ? (
                        <TouchableOpacity onPress={() => markPaired(record.id)}>
                          <Text style={{ color: theme.sage, fontWeight: '700', fontSize: 12 }}>
                            {t('pairing_workspace.actions.confirm')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {record.status !== 'revoked' ? (
                        <TouchableOpacity onPress={() => revoke(record.id)}>
                          <Text style={{ color: theme.red || '#dc2626', fontWeight: '700', fontSize: 12 }}>
                            {t('pairing_workspace.actions.revoke')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};
