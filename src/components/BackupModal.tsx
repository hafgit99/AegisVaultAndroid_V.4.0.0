import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { SecurityModule } from '../SecurityModule';
import {
  BackupModule,
  getExportFormats,
  getImportSources,
  ImportSource,
  ImportResult,
  ExportFormat,
} from '../BackupModule';

const C = {
  bg: '#F0EEE9',
  navy: '#101828',
  sage: '#72886f',
  sageLight: 'rgba(114,136,111,0.12)',
  sageMid: 'rgba(114,136,111,0.25)',
  card: 'rgba(255,255,255,0.98)',
  cardBorder: 'rgba(16,24,40,0.12)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.08)',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.08)',
  cyan: '#06b6d4',
  white: '#fff',
  muted: 'rgba(16,24,40,0.45)',
  divider: 'rgba(16,24,40,0.08)',
  inputBg: 'rgba(255,255,255,0.95)',
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.08)',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onImportDone: () => void;
  theme?: any;
}

export const BackupModal = ({
  visible,
  onClose,
  onImportDone,
  theme,
}: Props) => {
  const { t } = useTranslation();
  const cc = { ...C, ...(theme || {}) };
  const isDark = String(cc.bg || '').toLowerCase() === '#0b1220';
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [showPlainExportWarning, setShowPlainExportWarning] = useState(false);
  const [pendingPlainExport, setPendingPlainExport] = useState<
    ExportFormat['id'] | null
  >(null);

  // Import states

  // Encrypted export states
  const [showEncryptModal, setShowEncryptModal] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptConfirm, setEncryptConfirm] = useState('');
  const [showEncryptPw, setShowEncryptPw] = useState(false);
  const [showEncryptConfirmPw, setShowEncryptConfirmPw] = useState(false);

  // Encrypted import states
  const [showDecryptModal, setShowDecryptModal] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [showDecryptPw, setShowDecryptPw] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState('');

  const normalizeFilePath = (uri: string): string => {
    const trimmed = (uri || '').trim();
    if (trimmed.startsWith('file://')) {
      return decodeURIComponent(trimmed.replace('file://', ''));
    }
    return trimmed;
  };

  const resolvePickedFilePath = (file: any): string => {
    const candidate = file?.fileCopyUri || file?.uri || '';
    const path = normalizeFilePath(candidate);
    if (!path) throw new Error(t('backup.msg_sel_err'));
    return path;
  };

  useEffect(() => {
    if (visible) {
      setResult(null);
      setExportPath(null);
    }
  }, [visible]);

  // ── Export Handlers ──────────────────────────────────────
  const continuePlaintextExport = async (
    formatId: Exclude<ExportFormat['id'], 'aegis_encrypted'>,
  ) => {
    setShowPlainExportWarning(false);
    setPendingPlainExport(null);
    setLoading(true);
    try {
      SecurityModule.isPickingFileFlag = true;
      const path =
        formatId === 'csv'
          ? await BackupModule.exportToCSV()
          : await BackupModule.exportToJSON();
      SecurityModule.isPickingFileFlag = false;
      setExportPath(path);
      Alert.alert(t('backup.msg_exp_ok'), t('backup.msg_saved', { path }));
    } catch (e: any) {
      SecurityModule.isPickingFileFlag = false;
      Alert.alert(t('backup.msg_err'), e?.message || t('backup.msg_plain_exp_err'));
    }
    setLoading(false);
  };

  const handleExport = async (format: ExportFormat) => {
    if (format.id === 'aegis_encrypted') {
      setShowEncryptModal(true);
      setEncryptPassword('');
      setEncryptConfirm('');
      setShowEncryptPw(false);
      setShowEncryptConfirmPw(false);
      return;
    }
    setPendingPlainExport(format.id);
    setShowPlainExportWarning(true);
  };

  const handleEncryptedExport = async () => {
    if (!encryptPassword || encryptPassword.length < 8) {
      Alert.alert(t('backup.msg_err'), t('backup.err_len8'));
      return;
    }
    if (encryptPassword !== encryptConfirm) {
      Alert.alert(t('backup.msg_err'), t('backup.err_match'));
      return;
    }
    setShowEncryptModal(false);
    setLoading(true);
    try {
      SecurityModule.isPickingFileFlag = true;
      const path = await BackupModule.exportEncrypted(encryptPassword);
      SecurityModule.isPickingFileFlag = false;
      setExportPath(path);
      Alert.alert(t('backup.msg_enc_exp_ok'), t('backup.msg_saved', { path }));
    } catch (e: any) {
      SecurityModule.isPickingFileFlag = false;
      Alert.alert(
        t('backup.msg_err'),
        e?.message || 'Encrypted export failed.',
      );
    }
    setLoading(false);
    setEncryptPassword('');
    setEncryptConfirm('');
    setShowEncryptPw(false);
    setShowEncryptConfirmPw(false);
  };

  // ── Import Handlers ─────────────────────────────────────
  const handleImport = async (source: ImportSource) => {
    try {
      SecurityModule.isPickingFileFlag = true;
      const res = await pick({
        allowMultiSelection: false,
        copyTo: 'cachesDirectory',
      });
      SecurityModule.isPickingFileFlag = false;

      if (!res || res.length === 0) return;

      const file = res[0];
      const filePath = resolvePickedFilePath(file);
      const fileName = file.name || '';

      // Check if encrypted Aegis file
      if (
        source === 'aegis_vault' &&
        (fileName.endsWith('.aegis') || fileName.endsWith('.json'))
      ) {
        try {
          const content = await RNFS.readFile(filePath, 'utf8');
          const json = JSON.parse(content);
          if (json.encrypted) {
            setPendingFilePath(filePath);
            setDecryptPassword('');
            setShowDecryptModal(true);
            return;
          }
        } catch {}
      }

      // Auto-detect source if generic
      let finalSource = source;
      if (source === 'generic_csv' || source === 'generic_json') {
        try {
          const content = await RNFS.readFile(filePath, 'utf8');
          const detected = BackupModule.detectSource(fileName, content);
          if (detected !== 'generic_csv' && detected !== 'generic_json') {
            finalSource = detected;
          }
        } catch {}
      }

      setLoading(true);
      const importResult = await BackupModule.importFromFile(
        filePath,
        finalSource,
      );
      setResult(importResult);
      setLoading(false);

      if (importResult.imported > 0) onImportDone();
    } catch (e: any) {
      SecurityModule.isPickingFileFlag = false;
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert(t('backup.msg_err'), e?.message || t('backup.msg_sel_err'));
      }
      setLoading(false);
    }
  };

  const handleDecryptImport = async () => {
    if (!decryptPassword) {
      Alert.alert(t('backup.msg_err'), t('backup.msg_pw_req'));
      return;
    }
    setShowDecryptModal(false);
    setLoading(true);
    try {
      const importResult = await BackupModule.importEncryptedAegis(
        pendingFilePath,
        decryptPassword,
      );
      setResult(importResult);
      if (importResult.imported > 0) onImportDone();
    } catch (e: any) {
      Alert.alert(t('backup.msg_err'), e?.message || t('backup.msg_dec_err'));
    }
    setLoading(false);
    setDecryptPassword('');
    setShowDecryptPw(false);
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={st.overlay}>
        <View style={[st.container, { backgroundColor: cc.bg }]}>
          {/* Header */}
          <View style={st.header}>
            <Text style={[st.headerTitle, { color: cc.navy }]}>
              {t('backup.title')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[st.closeBtn, { color: cc.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View
            style={[
              st.tabRow,
              { backgroundColor: cc.card, borderColor: cc.cardBorder },
            ]}
          >
            <TouchableOpacity
              style={[st.tab, tab === 'export' && st.tabActive]}
              onPress={() => {
                setTab('export');
                setResult(null);
              }}
            >
              <Text
                style={[
                  st.tabText,
                  { color: cc.navy },
                  tab === 'export' && st.tabTextActive,
                ]}
              >
                {t('backup.tab_export')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.tab, tab === 'import' && st.tabActive]}
              onPress={() => {
                setTab('import');
                setResult(null);
              }}
            >
              <Text
                style={[
                  st.tabText,
                  { color: cc.navy },
                  tab === 'import' && st.tabTextActive,
                ]}
              >
                {t('backup.tab_import')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {loading && (
              <View style={st.loadingBox}>
                <ActivityIndicator size="large" color={cc.sage} />
                <Text style={[st.loadingText, { color: cc.muted }]}>
                  {t('backup.loading')}
                </Text>
              </View>
            )}

            {!loading && result && (
              <View
                style={[
                  st.resultBox,
                  { backgroundColor: cc.card },
                  result.imported > 0
                    ? { borderColor: cc.green }
                    : { borderColor: cc.amber },
                ]}
              >
                <Text style={[st.resultTitle, { color: cc.navy }]}>
                  {result.imported > 0
                    ? t('backup.res_success')
                    : t('backup.res_warn')}
                </Text>
                <View style={st.resultRow}>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: cc.sage }]}>
                      {result.total}
                    </Text>
                    <Text style={[st.resultLabel, { color: cc.muted }]}>
                      {t('backup.res_total')}
                    </Text>
                  </View>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: cc.green }]}>
                      {result.imported}
                    </Text>
                    <Text style={[st.resultLabel, { color: cc.muted }]}>
                      {t('backup.res_imported')}
                    </Text>
                  </View>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: cc.red }]}>
                      {result.skipped}
                    </Text>
                    <Text style={[st.resultLabel, { color: cc.muted }]}>
                      {t('backup.res_skipped')}
                    </Text>
                  </View>
                </View>
                {result.errors.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: cc.muted,
                        marginBottom: 4,
                      }}
                    >
                      {t('backup.res_errors')}
                    </Text>
                    {result.errors.slice(0, 5).map((e, i) => (
                      <Text
                        key={i}
                        style={{ fontSize: 11, color: cc.red, marginBottom: 2 }}
                      >
                        • {e}
                      </Text>
                    ))}
                    {result.errors.length > 5 && (
                      <Text style={{ fontSize: 11, color: cc.muted }}>
                        {t('backup.err_more', {
                          count: result.errors.length - 5,
                        })}
                      </Text>
                    )}
                  </View>
                )}
                <TouchableOpacity
                  style={st.resultCloseBtn}
                  onPress={() => setResult(null)}
                >
                  <Text
                    style={{ fontSize: 13, fontWeight: '700', color: cc.sage }}
                  >
                    {t('backup.btn_ok')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !result && tab === 'export' && (
              <>
                <Text style={[st.sectionNote, { color: cc.muted }]}>
                  {t('backup.exp_note')}
                </Text>

                {/* Warning */}
                <View
                  style={[
                    st.warningBox,
                    {
                      backgroundColor: isDark
                        ? 'rgba(245,158,11,0.18)'
                        : cc.amberBg,
                      borderColor: isDark
                        ? 'rgba(245,158,11,0.35)'
                        : 'rgba(245,158,11,0.15)',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 13 }}>⚠️</Text>
                  <Text
                    style={[
                      st.warningText,
                      { color: isDark ? '#fcd34d' : cc.amber },
                    ]}
                  >
                    {t('backup.warn_text')}
                  </Text>
                </View>

                {getExportFormats(t).map(fmt => (
                  <TouchableOpacity
                    key={fmt.id}
                    style={[
                      st.formatCard,
                      { backgroundColor: cc.card, borderColor: cc.cardBorder },
                      fmt.id === 'aegis_encrypted' && [
                        st.encryptedCard,
                        {
                          borderColor: cc.sageMid,
                          backgroundColor: cc.sageLight,
                        },
                      ],
                    ]}
                    onPress={() => handleExport(fmt)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        st.formatIconBox,
                        { backgroundColor: cc.sageLight },
                      ]}
                    >
                      <Text style={{ fontSize: 24 }}>{fmt.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.formatTitle, { color: cc.navy }]}>
                        {fmt.label}
                      </Text>
                      <Text style={[st.formatDesc, { color: cc.muted }]}>
                        {fmt.description}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 18, color: cc.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                {exportPath && (
                  <View
                    style={[
                      st.pathBox,
                      { backgroundColor: cc.card, borderColor: cc.cardBorder },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: cc.muted,
                        marginBottom: 4,
                      }}
                    >
                      {t('backup.last_export')}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: cc.sage,
                        fontWeight: '700',
                      }}
                      numberOfLines={2}
                    >
                      {exportPath}
                    </Text>
                  </View>
                )}
              </>
            )}

            {!loading && !result && tab === 'import' && (
              <>
                <Text style={[st.sectionNote, { color: cc.muted }]}>
                  {t('backup.imp_note')}
                </Text>

                {/* Recommended Sources */}
                <Text style={[st.groupTitle, { color: cc.navy }]}>
                  {t('backup.grp_pop')}
                </Text>
                {getImportSources(t)
                  .filter(s =>
                    [
                      'bitwarden',
                      '1password',
                      'lastpass',
                      'keepass',
                      'chrome',
                    ].includes(s.id),
                  )
                  .map(src => (
                    <TouchableOpacity
                      key={src.id}
                      style={[
                        st.sourceCard,
                        {
                          backgroundColor: cc.card,
                          borderColor: cc.cardBorder,
                        },
                      ]}
                      onPress={() => handleImport(src.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={st.sourceIcon}>{src.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.sourceTitle, { color: cc.navy }]}>
                          {src.label}
                        </Text>
                        <Text style={[st.sourceExt, { color: cc.muted }]}>
                          {src.extensions.join(', ')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, color: cc.muted }}>›</Text>
                    </TouchableOpacity>
                  ))}

                <Text style={[st.groupTitle, { color: cc.navy }]}>
                  {t('backup.grp_oth')}
                </Text>
                {getImportSources(t)
                  .filter(s =>
                    [
                      'dashlane',
                      'enpass',
                      'firefox',
                      'aegis_auth',
                      'aegis_vault',
                    ].includes(s.id),
                  )
                  .map(src => (
                    <TouchableOpacity
                      key={src.id}
                      style={[
                        st.sourceCard,
                        {
                          backgroundColor: cc.card,
                          borderColor: cc.cardBorder,
                        },
                      ]}
                      onPress={() => handleImport(src.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={st.sourceIcon}>{src.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.sourceTitle, { color: cc.navy }]}>
                          {src.label}
                        </Text>
                        <Text style={[st.sourceExt, { color: cc.muted }]}>
                          {src.extensions.join(', ')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, color: cc.muted }}>›</Text>
                    </TouchableOpacity>
                  ))}

                <Text style={[st.groupTitle, { color: cc.navy }]}>
                  {t('backup.grp_gen')}
                </Text>
                {getImportSources(t)
                  .filter(s => ['generic_csv', 'generic_json'].includes(s.id))
                  .map(src => (
                    <TouchableOpacity
                      key={src.id}
                      style={[
                        st.sourceCard,
                        {
                          backgroundColor: cc.card,
                          borderColor: cc.cardBorder,
                        },
                      ]}
                      onPress={() => handleImport(src.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={st.sourceIcon}>{src.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.sourceTitle, { color: cc.navy }]}>
                          {src.label}
                        </Text>
                        <Text style={[st.sourceExt, { color: cc.muted }]}>
                          {t('backup.auto_detect')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 18, color: cc.muted }}>›</Text>
                    </TouchableOpacity>
                  ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Encrypt Password Modal */}
      <Modal visible={showEncryptModal} animationType="fade" transparent>
        <View style={st.pwOverlay}>
          <View style={[st.pwContainer, { backgroundColor: cc.bg }]}>
            <Text style={[st.pwTitle, { color: cc.navy }]}>
              {t('backup.enc_exp_title')}
            </Text>
            <Text style={[st.pwDesc, { color: cc.muted }]}>
              {t('backup.enc_exp_desc')}
            </Text>

            <View style={st.pwInputRow}>
              <TextInput
                style={[
                  st.pwInput,
                  {
                    backgroundColor: cc.inputBg,
                    borderColor: cc.cardBorder,
                    color: cc.navy,
                  },
                ]}
                placeholder={t('backup.pw_ph')}
                placeholderTextColor={cc.muted}
                secureTextEntry={!showEncryptPw}
                autoCapitalize="none"
                autoCorrect={false}
                value={encryptPassword}
                onChangeText={setEncryptPassword}
              />
              <TouchableOpacity
                onPress={() => setShowEncryptPw(!showEncryptPw)}
                style={st.pwEye}
              >
                <Text style={{ fontSize: 16 }}>
                  {showEncryptPw ? '🙈' : '👁️'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={st.pwInputRow}>
              <TextInput
                style={[
                  st.pwInput,
                  {
                    backgroundColor: cc.inputBg,
                    borderColor: cc.cardBorder,
                    color: cc.navy,
                  },
                ]}
                placeholder={t('backup.pw_conf_ph')}
                placeholderTextColor={cc.muted}
                secureTextEntry={!showEncryptConfirmPw}
                autoCapitalize="none"
                autoCorrect={false}
                value={encryptConfirm}
                onChangeText={setEncryptConfirm}
              />
              <TouchableOpacity
                onPress={() => setShowEncryptConfirmPw(!showEncryptConfirmPw)}
                style={st.pwEye}
              >
                <Text style={{ fontSize: 16 }}>
                  {showEncryptConfirmPw ? '🙈' : '👁️'}
                </Text>
              </TouchableOpacity>
            </View>

            {encryptPassword.length > 0 && encryptPassword.length < 8 && (
              <Text style={{ fontSize: 11, color: cc.red, marginTop: 4 }}>
                {t('backup.err_len8')}
              </Text>
            )}
            {encryptConfirm.length > 0 &&
              encryptPassword !== encryptConfirm && (
                <Text style={{ fontSize: 11, color: cc.red, marginTop: 4 }}>
                  {t('backup.err_match')}
                </Text>
              )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.sageLight }]}
                onPress={() => {
                  setShowEncryptModal(false);
                  setEncryptPassword('');
                  setEncryptConfirm('');
                  setShowEncryptPw(false);
                  setShowEncryptConfirmPw(false);
                }}
              >
                <Text style={{ color: cc.navy, fontWeight: '700' }}>
                  {t('backup.btn_cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.sage, flex: 2 }]}
                onPress={handleEncryptedExport}
                disabled={
                  encryptPassword.length < 8 ||
                  encryptPassword !== encryptConfirm
                }
                activeOpacity={0.7}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {t('backup.btn_enc_exp')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPlainExportWarning} animationType="fade" transparent>
        <View style={st.pwOverlay}>
          <View
            style={[
              st.pwContainer,
              {
                backgroundColor: cc.bg,
                borderWidth: 1,
                borderColor: isDark
                  ? 'rgba(245,158,11,0.35)'
                  : 'rgba(245,158,11,0.2)',
              },
            ]}
          >
            <Text style={[st.pwTitle, { color: cc.navy }]}>
              {t('backup.plain_export_title')}
            </Text>
            <Text style={[st.pwDesc, { color: cc.muted }]}>
              {t('backup.plain_export_desc')}
            </Text>

            <View
              style={[
                st.warningBox,
                {
                  marginBottom: 0,
                  backgroundColor: isDark
                    ? 'rgba(245,158,11,0.18)'
                    : cc.amberBg,
                  borderColor: isDark
                    ? 'rgba(245,158,11,0.35)'
                    : 'rgba(245,158,11,0.15)',
                },
              ]}
            >
              <Text style={{ fontSize: 13 }}>⚠️</Text>
              <Text
                style={[
                  st.warningText,
                  { color: isDark ? '#fcd34d' : cc.amber },
                ]}
              >
                {t('backup.plain_export_private_note')}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.sageLight }]}
                onPress={() => {
                  setShowPlainExportWarning(false);
                  setPendingPlainExport(null);
                }}
              >
                <Text style={{ color: cc.navy, fontWeight: '700' }}>
                  {t('backup.btn_cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.amber, flex: 2 }]}
                onPress={() => {
                  if (pendingPlainExport === 'csv') {
                    continuePlaintextExport('csv');
                  } else if (pendingPlainExport === 'json') {
                    continuePlaintextExport('json');
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {t('backup.btn_plain_continue')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Decrypt Password Modal */}
      <Modal visible={showDecryptModal} animationType="fade" transparent>
        <View style={st.pwOverlay}>
          <View style={[st.pwContainer, { backgroundColor: cc.bg }]}>
            <Text style={[st.pwTitle, { color: cc.navy }]}>
              {t('backup.dec_imp_title')}
            </Text>
            <Text style={[st.pwDesc, { color: cc.muted }]}>
              {t('backup.dec_imp_desc')}
            </Text>

            <View style={st.pwInputRow}>
              <TextInput
                style={[
                  st.pwInput,
                  {
                    backgroundColor: cc.inputBg,
                    borderColor: cc.cardBorder,
                    color: cc.navy,
                  },
                ]}
                placeholder={t('backup.dec_pw_ph')}
                placeholderTextColor={cc.muted}
                secureTextEntry={!showDecryptPw}
                autoCapitalize="none"
                autoCorrect={false}
                value={decryptPassword}
                onChangeText={setDecryptPassword}
              />
              <TouchableOpacity
                onPress={() => setShowDecryptPw(!showDecryptPw)}
                style={st.pwEye}
              >
                <Text style={{ fontSize: 16 }}>
                  {showDecryptPw ? '🙈' : '👁️'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.sageLight }]}
                onPress={() => {
                  setShowDecryptModal(false);
                  setDecryptPassword('');
                  setShowDecryptPw(false);
                }}
              >
                <Text style={{ color: cc.navy, fontWeight: '700' }}>
                  {t('backup.btn_cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.sage, flex: 2 }]}
                onPress={handleDecryptImport}
                disabled={!decryptPassword}
                activeOpacity={0.7}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {t('backup.btn_dec_imp')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.navy },
  closeBtn: { fontSize: 22, color: C.muted, padding: 4 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: C.sage },
  tabText: { fontSize: 13, fontWeight: '700', color: C.navy },
  tabTextActive: { color: C.white },

  sectionNote: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
    marginBottom: 16,
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.amberBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.15)',
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: C.amber,
    fontWeight: '600',
    lineHeight: 17,
  },

  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  encryptedCard: {
    borderColor: C.sageMid,
    backgroundColor: 'rgba(114,136,111,0.06)',
  },
  formatIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  formatTitle: { fontSize: 15, fontWeight: '700', color: C.navy },
  formatDesc: { fontSize: 12, color: C.muted, marginTop: 3 },

  pathBox: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },

  groupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.navy,
    marginTop: 16,
    marginBottom: 10,
  },

  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  sourceIcon: { fontSize: 22, marginRight: 14, width: 32, textAlign: 'center' },
  sourceTitle: { fontSize: 14, fontWeight: '700', color: C.navy },
  sourceExt: { fontSize: 11, color: C.muted, marginTop: 2 },

  loadingBox: { alignItems: 'center', paddingVertical: 48 },
  loadingText: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '600',
    marginTop: 12,
  },

  resultBox: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.navy,
    marginBottom: 16,
    textAlign: 'center',
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-around' },
  resultStat: { alignItems: 'center' },
  resultNum: { fontSize: 28, fontWeight: '800' },
  resultLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginTop: 4,
  },
  resultCloseBtn: {
    marginTop: 16,
    backgroundColor: C.sageLight,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },

  pwOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  pwContainer: { backgroundColor: C.bg, borderRadius: 24, padding: 24 },
  pwTitle: { fontSize: 20, fontWeight: '800', color: C.navy, marginBottom: 8 },
  pwDesc: { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 20 },
  pwInputRow: { flexDirection: 'row', alignItems: 'center' },
  pwInput: {
    flex: 1,
    backgroundColor: C.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: C.navy,
    borderWidth: 1,
    borderColor: C.cardBorder,
    fontWeight: '500',
    marginBottom: 10,
  },
  pwEye: { padding: 10, marginBottom: 10, marginLeft: 4 },
  pwBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
});
