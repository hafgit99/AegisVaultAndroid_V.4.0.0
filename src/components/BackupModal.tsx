import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { pick } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { SecurityModule } from '../SecurityModule';
import {
  BackupModule, getExportFormats, getImportSources, ImportSource, ImportResult,
  ExportFormat,
} from '../BackupModule';

const C = {
  bg: '#F0EEE9', navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  sageMid: 'rgba(114,136,111,0.25)', card: 'rgba(255,255,255,0.45)',
  cardBorder: 'rgba(255,255,255,0.55)', red: '#ef4444', redBg: 'rgba(239,68,68,0.08)',
  green: '#22c55e', greenBg: 'rgba(34,197,94,0.08)', cyan: '#06b6d4',
  white: '#fff', muted: 'rgba(16,24,40,0.45)', divider: 'rgba(16,24,40,0.06)',
  inputBg: 'rgba(255,255,255,0.7)', amber: '#f59e0b', amberBg: 'rgba(245,158,11,0.08)',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onImportDone: () => void;
}

export const BackupModal = ({ visible, onClose, onImportDone }: Props) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);

  // Import states
  const [selectedSource, setSelectedSource] = useState<ImportSource | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  // Encrypted export states
  const [showEncryptModal, setShowEncryptModal] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptConfirm, setEncryptConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Encrypted import states
  const [showDecryptModal, setShowDecryptModal] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [pendingFilePath, setPendingFilePath] = useState('');

  useEffect(() => {
    if (visible) {
      setResult(null);
      setExportPath(null);
      setSelectedSource(null);
    }
  }, [visible]);

  // ── Export Handlers ──────────────────────────────────────
  const handleExport = async (format: ExportFormat) => {
    if (format.id === 'aegis_encrypted') {
      setShowEncryptModal(true);
      setEncryptPassword('');
      setEncryptConfirm('');
      return;
    }

    setLoading(true);
    try {
      SecurityModule.isPickingFileFlag = true;
      let path: string;
      if (format.id === 'csv') path = await BackupModule.exportToCSV();
      else path = await BackupModule.exportToJSON();
      SecurityModule.isPickingFileFlag = false;
      setExportPath(path);
      Alert.alert(t('backup.msg_exp_ok'), `t('backup.msg_saved', { path })`);
    } catch (e: any) {
      SecurityModule.isPickingFileFlag = false;
      Alert.alert(t('backup.msg_err'), e?.message || 'Export failed.');
    }
    setLoading(false);
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
      Alert.alert(t('backup.msg_enc_exp_ok'), `t('backup.msg_saved', { path })`);
    } catch (e: any) {
      SecurityModule.isPickingFileFlag = false;
      Alert.alert(t('backup.msg_err'), e?.message || 'Encrypted export failed.');
    }
    setLoading(false);
    setEncryptPassword('');
    setEncryptConfirm('');
  };

  // ── Import Handlers ─────────────────────────────────────
  const handleImport = async (source: ImportSource) => {
    setSelectedSource(source);
    try {
      SecurityModule.isPickingFileFlag = true;
      const res = await pick({ allowMultiSelection: false });
      SecurityModule.isPickingFileFlag = false;

      if (!res || res.length === 0) return;

      const file = res[0];
      const filePath = file.uri;
      const fileName = file.name || '';

      // Check if encrypted Aegis file
      if (source === 'aegis_vault' && (fileName.endsWith('.aegis') || fileName.endsWith('.json'))) {
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
      const importResult = await BackupModule.importFromFile(filePath, finalSource);
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
      const importResult = await BackupModule.importEncryptedAegis(pendingFilePath, decryptPassword);
      setResult(importResult);
      if (importResult.imported > 0) onImportDone();
    } catch (e: any) {
      Alert.alert(t('backup.msg_err'), e?.message || t('backup.msg_dec_err'));
    }
    setLoading(false);
    setDecryptPassword('');
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={st.overlay}>
        <View style={st.container}>
          {/* Header */}
          <View style={st.header}>
            <Text style={st.headerTitle}>{t('backup.title')}</Text>
            <TouchableOpacity onPress={onClose}><Text style={st.closeBtn}>✕</Text></TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={st.tabRow}>
            <TouchableOpacity
              style={[st.tab, tab === 'export' && st.tabActive]}
              onPress={() => { setTab('export'); setResult(null); }}
            >
              <Text style={[st.tabText, tab === 'export' && st.tabTextActive]}>{t('backup.tab_export')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.tab, tab === 'import' && st.tabActive]}
              onPress={() => { setTab('import'); setResult(null); }}
            >
              <Text style={[st.tabText, tab === 'import' && st.tabTextActive]}>{t('backup.tab_import')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {loading && (
              <View style={st.loadingBox}>
                <ActivityIndicator size="large" color={C.sage} />
                <Text style={st.loadingText}>{t('backup.loading')}</Text>
              </View>
            )}

            {!loading && result && (
              <View style={[st.resultBox, result.imported > 0 ? { borderColor: C.green } : { borderColor: C.amber }]}>
                <Text style={st.resultTitle}>
                  {result.imported > 0 ? t('backup.res_success') : t('backup.res_warn')}
                </Text>
                <View style={st.resultRow}>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: C.sage }]}>{result.total}</Text>
                    <Text style={st.resultLabel}>{t('backup.res_total')}</Text>
                  </View>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: C.green }]}>{result.imported}</Text>
                    <Text style={st.resultLabel}>{t('backup.res_imported')}</Text>
                  </View>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: C.red }]}>{result.skipped}</Text>
                    <Text style={st.resultLabel}>{t('backup.res_skipped')}</Text>
                  </View>
                </View>
                {result.errors.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 4 }}>{t('backup.res_errors')}</Text>
                    {result.errors.slice(0, 5).map((e, i) => (
                      <Text key={i} style={{ fontSize: 11, color: C.red, marginBottom: 2 }}>• {e}</Text>
                    ))}
                    {result.errors.length > 5 && (
                      <Text style={{ fontSize: 11, color: C.muted }}>{t('backup.err_more', { count: result.errors.length - 5 })}</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity style={st.resultCloseBtn} onPress={() => setResult(null)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.sage }}>{t('backup.btn_ok')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !result && tab === 'export' && (
              <>
                <Text style={st.sectionNote}>{t('backup.exp_note')}</Text>

                {/* Warning */}
                <View style={st.warningBox}>
                  <Text style={{ fontSize: 13 }}>⚠️</Text>
                  <Text style={st.warningText}>{t('backup.warn_text')}</Text>
                </View>

                {getExportFormats(t).map(fmt => (
                  <TouchableOpacity
                    key={fmt.id}
                    style={[st.formatCard, fmt.id === 'aegis_encrypted' && st.encryptedCard]}
                    onPress={() => handleExport(fmt)}
                    activeOpacity={0.7}
                  >
                    <View style={st.formatIconBox}>
                      <Text style={{ fontSize: 24 }}>{fmt.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.formatTitle}>{fmt.label}</Text>
                      <Text style={st.formatDesc}>{fmt.description}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                {exportPath && (
                  <View style={st.pathBox}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 4 }}>{t('backup.last_export')}</Text>
                    <Text style={{ fontSize: 12, color: C.sage, fontWeight: '600' }} numberOfLines={2}>{exportPath}</Text>
                  </View>
                )}
              </>
            )}

            {!loading && !result && tab === 'import' && (
              <>
                <Text style={st.sectionNote}>{t('backup.imp_note')}</Text>

                {/* Recommended Sources */}
                <Text style={st.groupTitle}>{t('backup.grp_pop')}</Text>
                {getImportSources(t).filter(s => ['bitwarden','1password','lastpass','keepass','chrome'].includes(s.id)).map(src => (
                  <TouchableOpacity
                    key={src.id}
                    style={st.sourceCard}
                    onPress={() => handleImport(src.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.sourceIcon}>{src.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.sourceTitle}>{src.label}</Text>
                      <Text style={st.sourceExt}>{src.extensions.join(', ')}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                <Text style={st.groupTitle}>{t('backup.grp_oth')}</Text>
                {getImportSources(t).filter(s => ['dashlane','enpass','firefox','aegis_auth','aegis_vault'].includes(s.id)).map(src => (
                  <TouchableOpacity
                    key={src.id}
                    style={st.sourceCard}
                    onPress={() => handleImport(src.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.sourceIcon}>{src.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.sourceTitle}>{src.label}</Text>
                      <Text style={st.sourceExt}>{src.extensions.join(', ')}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                <Text style={st.groupTitle}>{t('backup.grp_gen')}</Text>
                {getImportSources(t).filter(s => ['generic_csv','generic_json'].includes(s.id)).map(src => (
                  <TouchableOpacity
                    key={src.id}
                    style={st.sourceCard}
                    onPress={() => handleImport(src.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.sourceIcon}>{src.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.sourceTitle}>{src.label}</Text>
                      <Text style={st.sourceExt}>{t('backup.auto_detect')}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
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
          <View style={st.pwContainer}>
            <Text style={st.pwTitle}>{t('backup.enc_exp_title')}</Text>
            <Text style={st.pwDesc}>{t('backup.enc_exp_desc')}</Text>

            <View style={st.pwInputRow}>
              <TextInput
                style={st.pwInput}
                placeholder={t('backup.pw_ph')}
                placeholderTextColor={C.muted}
                secureTextEntry={!showPw}
                value={encryptPassword}
                onChangeText={setEncryptPassword}
              />
              <TouchableOpacity onPress={() => setShowPw(!showPw)} style={st.pwEye}>
                <Text style={{ fontSize: 16 }}>{showPw ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={st.pwInput}
              placeholder={t('backup.pw_conf_ph')}
              placeholderTextColor={C.muted}
              secureTextEntry={!showPw}
              value={encryptConfirm}
              onChangeText={setEncryptConfirm}
            />

            {encryptPassword.length > 0 && encryptPassword.length < 8 && (
              <Text style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{t('backup.err_len8')}</Text>
            )}
            {encryptConfirm.length > 0 && encryptPassword !== encryptConfirm && (
              <Text style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{t('backup.err_match')}</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: C.sageLight }]}
                onPress={() => { setShowEncryptModal(false); setEncryptPassword(''); setEncryptConfirm(''); }}
              >
                <Text style={{ color: C.navy, fontWeight: '700' }}>{t('backup.btn_cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: C.sage, flex: 2 }]}
                onPress={handleEncryptedExport}
                disabled={encryptPassword.length < 8 || encryptPassword !== encryptConfirm}
                activeOpacity={0.7}
              >
                <Text style={{ color: C.white, fontWeight: '700' }}>{t('backup.btn_enc_exp')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Decrypt Password Modal */}
      <Modal visible={showDecryptModal} animationType="fade" transparent>
        <View style={st.pwOverlay}>
          <View style={st.pwContainer}>
            <Text style={st.pwTitle}>{t('backup.dec_imp_title')}</Text>
            <Text style={st.pwDesc}>{t('backup.dec_imp_desc')}</Text>

            <View style={st.pwInputRow}>
              <TextInput
                style={st.pwInput}
                placeholder={t('backup.dec_pw_ph')}
                placeholderTextColor={C.muted}
                secureTextEntry={!showPw}
                value={decryptPassword}
                onChangeText={setDecryptPassword}
              />
              <TouchableOpacity onPress={() => setShowPw(!showPw)} style={st.pwEye}>
                <Text style={{ fontSize: 16 }}>{showPw ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: C.sageLight }]}
                onPress={() => { setShowDecryptModal(false); setDecryptPassword(''); }}
              >
                <Text style={{ color: C.navy, fontWeight: '700' }}>{t('backup.btn_cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.pwBtn, { backgroundColor: C.sage, flex: 2 }]}
                onPress={handleDecryptImport}
                disabled={!decryptPassword}
                activeOpacity={0.7}
              >
                <Text style={{ color: C.white, fontWeight: '700' }}>{t('backup.btn_dec_imp')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  container: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.navy },
  closeBtn: { fontSize: 22, color: C.muted, padding: 4 },

  tabRow: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: C.sage },
  tabText: { fontSize: 13, fontWeight: '700', color: C.navy },
  tabTextActive: { color: C.white },

  sectionNote: { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 16 },

  warningBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.amberBg, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)', gap: 10 },
  warningText: { flex: 1, fontSize: 12, color: C.amber, fontWeight: '600', lineHeight: 17 },

  formatCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.cardBorder },
  encryptedCard: { borderColor: C.sageMid, backgroundColor: 'rgba(114,136,111,0.06)' },
  formatIconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.sageLight, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  formatTitle: { fontSize: 15, fontWeight: '700', color: C.navy },
  formatDesc: { fontSize: 12, color: C.muted, marginTop: 3 },

  pathBox: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1, borderColor: C.cardBorder },

  groupTitle: { fontSize: 14, fontWeight: '700', color: C.navy, marginTop: 16, marginBottom: 10 },

  sourceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  sourceIcon: { fontSize: 22, marginRight: 14, width: 32, textAlign: 'center' },
  sourceTitle: { fontSize: 14, fontWeight: '700', color: C.navy },
  sourceExt: { fontSize: 11, color: C.muted, marginTop: 2 },

  loadingBox: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { fontSize: 14, color: C.muted, fontWeight: '600', marginTop: 12 },

  resultBox: { backgroundColor: C.card, borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 2 },
  resultTitle: { fontSize: 17, fontWeight: '800', color: C.navy, marginBottom: 16, textAlign: 'center' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-around' },
  resultStat: { alignItems: 'center' },
  resultNum: { fontSize: 28, fontWeight: '800' },
  resultLabel: { fontSize: 11, color: C.muted, fontWeight: '600', marginTop: 4 },
  resultCloseBtn: { marginTop: 16, backgroundColor: C.sageLight, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },

  pwOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  pwContainer: { backgroundColor: C.bg, borderRadius: 24, padding: 24 },
  pwTitle: { fontSize: 20, fontWeight: '800', color: C.navy, marginBottom: 8 },
  pwDesc: { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 20 },
  pwInputRow: { flexDirection: 'row', alignItems: 'center' },
  pwInput: { flex: 1, backgroundColor: C.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: C.navy, borderWidth: 1, borderColor: C.cardBorder, fontWeight: '500', marginBottom: 10 },
  pwEye: { padding: 10, marginBottom: 10, marginLeft: 4 },
  pwBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
