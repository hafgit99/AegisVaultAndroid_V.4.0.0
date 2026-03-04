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
import { useTheme } from '../ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onImportDone: () => void;
}

export const BackupModal = ({ visible, onClose, onImportDone }: Props) => {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
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
      Alert.alert(t('backup.msg_exp_ok'), t('backup.msg_saved', { path }));
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
      Alert.alert(t('backup.msg_enc_exp_ok'), t('backup.msg_saved', { path }));
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
        <View style={[st.container, { backgroundColor: C.bg }]}>
          {/* Header */}
          <View style={st.header}>
            <Text style={[st.headerTitle, { color: C.navy }]}>{t('backup.title')}</Text>
            <TouchableOpacity onPress={onClose}><Text style={[st.closeBtn, { color: C.muted }]}>✕</Text></TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={[st.tabRow, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
            <TouchableOpacity
              style={[st.tab, tab === 'export' && { backgroundColor: C.sage }]}
              onPress={() => { setTab('export'); setResult(null); }}
            >
              <Text style={[st.tabText, { color: C.navy }, tab === 'export' && { color: C.white }]}>{t('backup.tab_export')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.tab, tab === 'import' && { backgroundColor: C.sage }]}
              onPress={() => { setTab('import'); setResult(null); }}
            >
              <Text style={[st.tabText, { color: C.navy }, tab === 'import' && { color: C.white }]}>{t('backup.tab_import')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {loading && (
              <View style={st.loadingBox}>
                <ActivityIndicator size="large" color={C.sage} />
                <Text style={[st.loadingText, { color: C.muted }]}>{t('backup.loading')}</Text>
              </View>
            )}

            {!loading && result && (
              <View style={[st.resultBox, { backgroundColor: C.card, borderColor: result.imported > 0 ? C.green : C.amber }]}>
                <Text style={[st.resultTitle, { color: C.navy }]}>
                  {result.imported > 0 ? t('backup.res_success') : t('backup.res_warn')}
                </Text>
                <View style={st.resultRow}>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: C.sage }]}>{result.total}</Text>
                    <Text style={[st.resultLabel, { color: C.muted }]}>{t('backup.res_total')}</Text>
                  </View>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: C.green }]}>{result.imported}</Text>
                    <Text style={[st.resultLabel, { color: C.muted }]}>{t('backup.res_imported')}</Text>
                  </View>
                  <View style={st.resultStat}>
                    <Text style={[st.resultNum, { color: C.red }]}>{result.skipped}</Text>
                    <Text style={[st.resultLabel, { color: C.muted }]}>{t('backup.res_skipped')}</Text>
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
                <TouchableOpacity style={[st.resultCloseBtn, { backgroundColor: C.sageLight }]} onPress={() => setResult(null)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.sage }}>{t('backup.btn_ok')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !result && tab === 'export' && (
              <>
                <Text style={[st.sectionNote, { color: C.muted }]}>{t('backup.exp_note')}</Text>

                {/* Warning */}
                <View style={[st.warningBox, { backgroundColor: C.amberBg }]}>
                  <Text style={{ fontSize: 13 }}>⚠️</Text>
                  <Text style={[st.warningText, { color: C.amber }]}>{t('backup.warn_text')}</Text>
                </View>

                {getExportFormats(t).map(fmt => (
                  <TouchableOpacity
                    key={fmt.id}
                    style={[st.formatCard, { backgroundColor: C.card, borderColor: C.cardBorder }, fmt.id === 'aegis_encrypted' && { borderColor: `${C.sage}40`, backgroundColor: `${C.sage}0F` }]}
                    onPress={() => handleExport(fmt)}
                    activeOpacity={0.7}
                  >
                    <View style={[st.formatIconBox, { backgroundColor: C.sageLight }]}>
                      <Text style={{ fontSize: 24 }}>{fmt.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.formatTitle, { color: C.navy }]}>{fmt.label}</Text>
                      <Text style={[st.formatDesc, { color: C.muted }]}>{fmt.description}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                {exportPath && (
                  <View style={[st.pathBox, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 4 }}>{t('backup.last_export')}</Text>
                    <Text style={{ fontSize: 12, color: C.sage, fontWeight: '600' }} numberOfLines={2}>{exportPath}</Text>
                  </View>
                )}
              </>
            )}

            {!loading && !result && tab === 'import' && (
              <>
                <Text style={[st.sectionNote, { color: C.muted }]}>{t('backup.imp_note')}</Text>

                {/* Recommended Sources */}
                <Text style={[st.groupTitle, { color: C.navy }]}>{t('backup.grp_pop')}</Text>
                {getImportSources(t).filter(s => ['bitwarden','1password','lastpass','keepass','chrome'].includes(s.id)).map(src => (
                  <TouchableOpacity
                    key={src.id}
                    style={[st.sourceCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
                    onPress={() => handleImport(src.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.sourceIcon}>{src.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.sourceTitle, { color: C.navy }]}>{src.label}</Text>
                      <Text style={[st.sourceExt, { color: C.muted }]}>{src.extensions.join(', ')}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                <Text style={[st.groupTitle, { color: C.navy }]}>{t('backup.grp_oth')}</Text>
                {getImportSources(t).filter(s => ['dashlane','enpass','firefox','aegis_auth','aegis_vault'].includes(s.id)).map(src => (
                  <TouchableOpacity
                    key={src.id}
                    style={[st.sourceCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
                    onPress={() => handleImport(src.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.sourceIcon}>{src.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.sourceTitle, { color: C.navy }]}>{src.label}</Text>
                      <Text style={[st.sourceExt, { color: C.muted }]}>{src.extensions.join(', ')}</Text>
                    </View>
                    <Text style={{ fontSize: 18, color: C.muted }}>›</Text>
                  </TouchableOpacity>
                ))}

                <Text style={[st.groupTitle, { color: C.navy }]}>{t('backup.grp_gen')}</Text>
                {getImportSources(t).filter(s => ['generic_csv','generic_json'].includes(s.id)).map(src => (
                  <TouchableOpacity
                    key={src.id}
                    style={[st.sourceCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}
                    onPress={() => handleImport(src.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={st.sourceIcon}>{src.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.sourceTitle, { color: C.navy }]}>{src.label}</Text>
                      <Text style={[st.sourceExt, { color: C.muted }]}>{t('backup.auto_detect')}</Text>
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
          <View style={[st.pwContainer, { backgroundColor: C.bg }]}>
            <Text style={[st.pwTitle, { color: C.navy }]}>{t('backup.enc_exp_title')}</Text>
            <Text style={[st.pwDesc, { color: C.muted }]}>{t('backup.enc_exp_desc')}</Text>

            <View style={st.pwInputRow}>
              <TextInput
                style={[st.pwInput, { backgroundColor: C.inputBg, color: C.navy, borderColor: C.cardBorder }]}
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
              style={[st.pwInput, { backgroundColor: C.inputBg, color: C.navy, borderColor: C.cardBorder }]}
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
          <View style={[st.pwContainer, { backgroundColor: C.bg }]}>
            <Text style={[st.pwTitle, { color: C.navy }]}>{t('backup.dec_imp_title')}</Text>
            <Text style={[st.pwDesc, { color: C.muted }]}>{t('backup.dec_imp_desc')}</Text>

            <View style={st.pwInputRow}>
              <TextInput
                style={[st.pwInput, { backgroundColor: C.inputBg, color: C.navy, borderColor: C.cardBorder }]}
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
  container: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  closeBtn: { fontSize: 22, padding: 4 },

  tabRow: { flexDirection: 'row', borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '700' },

  sectionNote: { fontSize: 13, lineHeight: 19, marginBottom: 16 },

  warningBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)', gap: 10 },
  warningText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  formatCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1 },
  formatIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  formatTitle: { fontSize: 15, fontWeight: '700' },
  formatDesc: { fontSize: 12, marginTop: 3 },

  pathBox: { borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1 },

  groupTitle: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 10 },

  sourceCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1 },
  sourceIcon: { fontSize: 22, marginRight: 14, width: 32, textAlign: 'center' },
  sourceTitle: { fontSize: 14, fontWeight: '700' },
  sourceExt: { fontSize: 11, marginTop: 2 },

  loadingBox: { alignItems: 'center', paddingVertical: 48 },
  loadingText: { fontSize: 14, fontWeight: '600', marginTop: 12 },

  resultBox: { borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 2 },
  resultTitle: { fontSize: 17, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-around' },
  resultStat: { alignItems: 'center' },
  resultNum: { fontSize: 28, fontWeight: '800' },
  resultLabel: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  resultCloseBtn: { marginTop: 16, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },

  pwOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  pwContainer: { borderRadius: 24, padding: 24 },
  pwTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  pwDesc: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  pwInputRow: { flexDirection: 'row', alignItems: 'center' },
  pwInput: { flex: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, borderWidth: 1, fontWeight: '500', marginBottom: 10 },
  pwEye: { padding: 10, marginBottom: 10, marginLeft: 4 },
  pwBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
