import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { pick } from '@react-native-documents/picker';
import { SecurityModule, Attachment } from '../SecurityModule';
import { useTranslation } from 'react-i18next';

const C = {
  navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  muted: 'rgba(16,24,40,0.45)', card: 'rgba(255,255,255,0.45)',
  cardBorder: 'rgba(255,255,255,0.55)', red: '#ef4444', redBg: 'rgba(239,68,68,0.08)',
  green: '#22c55e', greenBg: 'rgba(34,197,94,0.08)',
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileIcon = (mime: string) => {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '📦';
  if (mime.includes('text') || mime.includes('json') || mime.includes('xml')) return '📃';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('document') || mime.includes('word')) return '📝';
  return '📎';
};

interface Props {
  itemId: number | null;
  attachments: Attachment[];
  onRefresh: () => void;
  pendingFiles: { name: string; type: string; uri: string; size: number; base64?: string }[];
  setPendingFiles: (f: any[]) => void;
}

export const AttachmentSection = ({ itemId, attachments, onRefresh, pendingFiles, setPendingFiles }: Props) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  const pickFile = async () => {
    try {
      SecurityModule.isPickingFileFlag = true;
      const result = await pick({ allowMultiSelection: false });
      SecurityModule.isPickingFileFlag = false;
      if (result && result.length > 0) {
        const file = result[0];
        const pickerSize = file.size || 0;
        if (pickerSize > 50 * 1024 * 1024) {
          Alert.alert(t('att.size_err_t'), t('att.size_err_m'));
          return;
        }
        if (itemId) {
          // Direct save if item already exists
          setLoading(true);
          const ok = await SecurityModule.addAttachment(itemId, file.name || 'file', file.type || '', file.uri);
          setLoading(false);
          if (ok) { onRefresh(); Alert.alert(t('att.succ_t'), t('att.succ_m')); }
          else Alert.alert(t('att.err_t'), t('att.err_add'));
        } else {
          // Pre-read to base64 immediately (content:// URIs expire after picker closes)
          setLoading(true);
          const readResult = await SecurityModule.readFileToBase64(file.uri, file.name || 'file');
          setLoading(false);
          if (readResult) {
            setPendingFiles([...pendingFiles, {
              name: file.name || 'file',
              type: file.type || '',
              uri: file.uri,
              size: readResult.size,
              base64: readResult.base64,
            }]);
          } else {
            Alert.alert(t('att.err_t'), t('att.err_read'));
          }
        }
      }
    } catch (e: any) {
      SecurityModule.isPickingFileFlag = false;
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') console.error('Pick error:', e);
    }
  };

  const handleDownload = async (att: Attachment) => {
    setDownloading(att.id!);
    const path = await SecurityModule.downloadAttachment(att.id!);
    setDownloading(null);
    if (path) Alert.alert(t('att.dl_t'), t('att.dl_m', { path }) as string);
    else Alert.alert(t('att.err_t'), t('att.dl_err'));
  };

  const handleDelete = (att: Attachment) => {
    Alert.alert(t('att.del_t'), t('att.del_m') as string, [
      { text: t('att.cancel'), style: 'cancel' },
      { text: t('att.del_btn'), style: 'destructive', onPress: async () => {
        await SecurityModule.deleteAttachment(att.id!);
        onRefresh();
      }},
    ]);
  };

  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <Text style={st.sectionLabel}>📎 {t('att.hdr').toUpperCase()}</Text>
        <Text style={st.limit}>Maks. 50 MB</Text>
      </View>

      {/* Existing attachments */}
      {attachments.map(att => (
        <View key={att.id} style={st.fileCard}>
          <Text style={st.fileIcon}>{getFileIcon(att.mime_type)}</Text>
          <View style={st.fileInfo}>
            <Text style={st.fileName} numberOfLines={1}>{att.filename}</Text>
            <Text style={st.fileMeta}>{formatSize(att.size)}</Text>
          </View>
          <TouchableOpacity onPress={() => handleDownload(att)} style={st.dlBtn} disabled={downloading === att.id}>
            {downloading === att.id ? <ActivityIndicator size="small" color={C.sage} /> : <Text style={st.dlText}>⬇️</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(att)} style={st.delBtn}>
            <Text style={st.delText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Pending files (for new items not yet saved) */}
      {pendingFiles.map((f, i) => (
        <View key={`p-${i}`} style={[st.fileCard, { borderColor: C.greenBg }]}>
          <Text style={st.fileIcon}>{getFileIcon(f.type)}</Text>
          <View style={st.fileInfo}>
            <Text style={st.fileName} numberOfLines={1}>{f.name}</Text>
            <Text style={[st.fileMeta, { color: C.green }]}>• {formatSize(f.size)}</Text>
          </View>
          <TouchableOpacity onPress={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))} style={st.delBtn}>
            <Text style={st.delText}>✖</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Add button */}
      <TouchableOpacity style={st.addBtn} onPress={pickFile} activeOpacity={0.7} disabled={loading}>
        {loading ? <ActivityIndicator size="small" color={C.sage} /> : (
          <Text style={st.addText}>+ {t('att.btn_add')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const st = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  limit: { fontSize: 10, color: C.muted },
  fileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14,
    padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  fileIcon: { fontSize: 24, marginRight: 12 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '600', color: C.navy },
  fileMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  dlBtn: { padding: 8 },
  dlText: { fontSize: 18 },
  delBtn: { padding: 8 },
  delText: { fontSize: 14, color: C.red },
  addBtn: { borderWidth: 1.5, borderColor: C.sage, borderStyle: 'dashed', borderRadius: 14,
    padding: 14, alignItems: 'center', marginTop: 4 },
  addText: { fontSize: 13, fontWeight: '700', color: C.sage },
});
