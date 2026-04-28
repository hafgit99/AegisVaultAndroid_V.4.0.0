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
} from 'react-native';
import { pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { SecurityModule } from '../SecurityModule';
import {
  BackupModule,
  MIN_BACKUP_PASSWORD_LENGTH,
  getExportFormats,
  getImportSources,
  ImportSource,
  ImportResult,
  ExportFormat,
} from '../BackupModule';
import {
  BackupResultPanel,
  ExportFormatCard,
  ImportSourceCard,
  BackupPasswordModal,
} from './backup/BackupModalParts';

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
  const [showPlainExportOptions, setShowPlainExportOptions] = useState(false);
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

  const closeEncryptModal = () => {
    setShowEncryptModal(false);
    setEncryptPassword('');
    setEncryptConfirm('');
    setShowEncryptPw(false);
    setShowEncryptConfirmPw(false);
  };

  const closeDecryptModal = () => {
    setShowDecryptModal(false);
    setDecryptPassword('');
    setShowDecryptPw(false);
  };

  const encryptValidationMessages = [
    encryptPassword.length > 0 &&
    encryptPassword.length < MIN_BACKUP_PASSWORD_LENGTH
      ? t('backup.err_min_len', { count: MIN_BACKUP_PASSWORD_LENGTH })
      : '',
    encryptConfirm.length > 0 && encryptPassword !== encryptConfirm
      ? t('backup.err_match')
      : '',
  ].filter(Boolean) as string[];

  useEffect(() => {
    if (visible) {
      setResult(null);
      setExportPath(null);
      setShowPlainExportOptions(false);
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
    if (!encryptPassword || encryptPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
      Alert.alert(
        t('backup.msg_err'),
        t('backup.err_min_len', { count: MIN_BACKUP_PASSWORD_LENGTH }),
      );
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
    closeEncryptModal();
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
    closeDecryptModal();
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
              <Text style={[st.closeBtn, { color: cc.muted }]}>x</Text>
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
            contentContainerStyle={st.scrollContent}
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
              <BackupResultPanel
                cc={cc}
                result={result}
                t={t}
                onClose={() => setResult(null)}
              />
            )}

            {!loading && !result && tab === 'export' && (
              <>
                <Text style={[st.sectionNote, { color: cc.muted }]}>
                  {t('backup.exp_note')}
                </Text>

                <TouchableOpacity
                  style={[
                    st.plainToggle,
                    { backgroundColor: cc.inputBg, borderColor: cc.cardBorder },
                  ]}
                  onPress={() => setShowPlainExportOptions(value => !value)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.plainToggleText, { color: cc.navy }]}>
                    {showPlainExportOptions
                      ? t('backup.hide_plain_exports')
                      : t('backup.show_plain_exports')}
                  </Text>
                </TouchableOpacity>

                {showPlainExportOptions && (
                  <>
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
                  <Text style={st.warningIcon}>!</Text>
                  <Text
                    style={[
                      st.warningText,
                      { color: isDark ? '#fcd34d' : cc.amber },
                    ]}
                  >
                    {t('backup.warn_text')}
                  </Text>
                </View>

                  </>
                )}

                {getExportFormats(t)
                  .filter(
                    fmt =>
                      fmt.id === 'aegis_encrypted' || showPlainExportOptions,
                  )
                  .map(fmt => (
                    <ExportFormatCard
                      key={fmt.id}
                      cc={cc}
                      format={fmt}
                      isEncrypted={fmt.id === 'aegis_encrypted'}
                      t={t}
                      onPress={() => handleExport(fmt)}
                    />
                  ))}

                {exportPath && (
                  <View
                    style={[
                      st.pathBox,
                      { backgroundColor: cc.card, borderColor: cc.cardBorder },
                    ]}
                  >
                    <Text style={[st.pathLabel, { color: cc.muted }]}>
                      {t('backup.last_export')}
                    </Text>
                    <Text
                      style={[st.pathValue, { color: cc.sage }]}
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
                    <ImportSourceCard
                      key={src.id}
                      cc={cc}
                      source={src}
                      subtitle={src.extensions.join(', ')}
                      onPress={() => handleImport(src.id)}
                    />
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
                    <ImportSourceCard
                      key={src.id}
                      cc={cc}
                      source={src}
                      subtitle={src.extensions.join(', ')}
                      onPress={() => handleImport(src.id)}
                    />
                  ))}

                <Text style={[st.groupTitle, { color: cc.navy }]}>
                  {t('backup.grp_gen')}
                </Text>
                {getImportSources(t)
                  .filter(s => ['generic_csv', 'generic_json'].includes(s.id))
                  .map(src => (
                    <ImportSourceCard
                      key={src.id}
                      cc={cc}
                      source={src}
                      subtitle={t('backup.auto_detect')}
                      onPress={() => handleImport(src.id)}
                    />
                  ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      <BackupPasswordModal
        cc={cc}
        visible={showEncryptModal}
        title={t('backup.enc_exp_title')}
        description={t('backup.enc_exp_desc')}
        passwordPlaceholder={t('backup.pw_ph')}
        password={encryptPassword}
        showPassword={showEncryptPw}
        confirmPlaceholder={t('backup.pw_conf_ph')}
        confirmPassword={encryptConfirm}
        showConfirmPassword={showEncryptConfirmPw}
        validationMessages={encryptValidationMessages}
        primaryLabel={t('backup.btn_enc_exp')}
        cancelLabel={t('backup.btn_cancel')}
        showPasswordLabel={t('backup.show_password')}
        hidePasswordLabel={t('backup.hide_password')}
        primaryDisabled={
          encryptPassword.length < MIN_BACKUP_PASSWORD_LENGTH ||
          encryptPassword !== encryptConfirm
        }
        onPasswordChange={setEncryptPassword}
        onTogglePassword={() => setShowEncryptPw(value => !value)}
        onConfirmPasswordChange={setEncryptConfirm}
        onToggleConfirmPassword={() =>
          setShowEncryptConfirmPw(value => !value)
        }
        onCancel={closeEncryptModal}
        onPrimary={handleEncryptedExport}
      />
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
              <Text style={st.warningIcon}>!</Text>
              <Text
                style={[
                  st.warningText,
                  { color: isDark ? '#fcd34d' : cc.amber },
                ]}
              >
                {t('backup.plain_export_private_note')}
              </Text>
            </View>

            <View style={st.modalButtonRow}>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: cc.sageLight }]}
                onPress={() => {
                  setShowPlainExportWarning(false);
                  setPendingPlainExport(null);
                }}
              >
                <Text style={[st.modalSecondaryText, { color: cc.navy }]}>
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
                <Text style={st.modalPrimaryText}>
                  {t('backup.btn_plain_continue')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <BackupPasswordModal
        cc={cc}
        visible={showDecryptModal}
        title={t('backup.dec_imp_title')}
        description={t('backup.dec_imp_desc')}
        passwordPlaceholder={t('backup.dec_pw_ph')}
        password={decryptPassword}
        showPassword={showDecryptPw}
        primaryLabel={t('backup.btn_dec_imp')}
        cancelLabel={t('backup.btn_cancel')}
        showPasswordLabel={t('backup.show_password')}
        hidePasswordLabel={t('backup.hide_password')}
        primaryDisabled={!decryptPassword}
        onPasswordChange={setDecryptPassword}
        onTogglePassword={() => setShowDecryptPw(value => !value)}
        onCancel={closeDecryptModal}
        onPrimary={handleDecryptImport}
      />
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
  scrollContent: {
    paddingBottom: 24,
  },
  flexOne: {
    flex: 1,
  },
  chevron: {
    fontSize: 18,
  },

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
  warningIcon: {
    fontSize: 13,
    fontWeight: '800',
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
  plainToggle: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  plainToggleText: {
    fontSize: 13,
    fontWeight: '800',
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
  formatIcon: {
    fontSize: 24,
  },
  formatTitle: { fontSize: 15, fontWeight: '700', color: C.navy },
  formatDesc: { fontSize: 12, color: C.muted, marginTop: 3 },
  recommendedBadge: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'uppercase',
  },

  pathBox: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  pathLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  pathValue: {
    fontSize: 12,
    fontWeight: '700',
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
  resultCloseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultErrors: {
    marginTop: 12,
  },
  resultErrorsTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultErrorText: {
    fontSize: 11,
    marginBottom: 2,
  },
  resultMoreText: {
    fontSize: 11,
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
  pwBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalSecondaryText: {
    fontWeight: '700',
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
});
