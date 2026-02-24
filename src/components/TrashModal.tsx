import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert, Animated
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecurityModule, VaultItem } from '../SecurityModule';

const C = {
  bg: '#F0EEE9', navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  card: 'rgba(255,255,255,0.45)', cardBorder: 'rgba(255,255,255,0.55)',
  white: '#fff', muted: 'rgba(16,24,40,0.45)', red: '#ef4444', redBg: 'rgba(239,68,68,0.08)',
  green: '#22c55e', greenBg: 'rgba(34,197,94,0.08)',
};

interface TrashModalProps {
  visible: boolean;
  onClose: () => void;
  onRefreshParent: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ visible, onClose, onRefreshParent }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<VaultItem[]>([]);

  const load = async () => {
    const deleted = await SecurityModule.getDeletedItems();
    setItems(deleted);
  };

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const handleRestore = async (id: number) => {
    await SecurityModule.restoreItem(id);
    Alert.alert(t('trash.restored'));
    load();
    onRefreshParent();
  };

  const handleDeletePerm = (id: number) => {
    Alert.alert(
      t('vault.delete'),
      t('trash.delete_perm_confirm'),
      [
        { text: t('vault.cancel'), style: 'cancel' },
        { 
          text: t('trash.delete_perm'), 
          style: 'destructive', 
          onPress: async () => {
            await SecurityModule.permanentlyDeleteItem(id);
            load();
          } 
        }
      ]
    );
  };

  const handleEmptyTrash = () => {
    if (items.length === 0) return;
    Alert.alert(
      t('trash.empty_trash'),
      t('trash.empty_confirm'),
      [
        { text: t('vault.cancel'), style: 'cancel' },
        { 
          text: t('trash.empty_trash'), 
          style: 'destructive', 
          onPress: async () => {
            await SecurityModule.emptyTrash();
            load();
          } 
        }
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.overlay}>
        <View style={s.content}>
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>{t('trash.title')}</Text>
              <Text style={s.headerSubtitle}>{t('trash.subtitle')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {items.length === 0 ? (
              <View style={s.emptyContainer}>
                <Text style={s.emptyIcon}>🗑️</Text>
                <Text style={s.emptyText}>{t('trash.empty_msg')}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={s.emptyBtn} onPress={handleEmptyTrash}>
                  <Text style={s.emptyBtnText}>🚮 {t('trash.empty_trash')}</Text>
                </TouchableOpacity>
                {items.map((item) => (
                  <View key={item.id} style={s.itemCard}>
                    <View style={s.itemInfo}>
                      <Text style={s.itemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={s.itemSub} numberOfLines={1}>{item.username || item.url}</Text>
                      {item.deleted_at && (
                        <Text style={s.dateText}>{item.deleted_at}</Text>
                      )}
                    </View>
                    <View style={s.itemActions}>
                      <TouchableOpacity 
                        style={[s.actionBtn, s.restoreBtn]} 
                        onPress={() => item.id && handleRestore(item.id)}
                      >
                        <Text style={s.restoreBtnText}>↺</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[s.actionBtn, s.deleteBtn]} 
                        onPress={() => item.id && handleDeletePerm(item.id)}
                      >
                        <Text style={s.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  content: { 
    backgroundColor: C.bg, 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    padding: 24, 
    maxHeight: '90%',
    minHeight: '50%'
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: C.navy },
  headerSubtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  closeX: { fontSize: 24, color: C.muted, padding: 4 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 64, opacity: 0.2, marginBottom: 16 },
  emptyText: { fontSize: 16, color: C.muted, fontWeight: '600' },
  emptyBtn: { 
    backgroundColor: C.redBg, 
    paddingVertical: 12, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.1)'
  },
  emptyBtnText: { color: C.red, fontWeight: '700', fontSize: 14 },
  itemCard: { 
    backgroundColor: C.card, 
    borderRadius: 18, 
    padding: 16, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: C.cardBorder,
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: C.navy, marginBottom: 2 },
  itemSub: { fontSize: 12, color: C.muted },
  dateText: { fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' },
  itemActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  restoreBtn: { backgroundColor: C.greenBg },
  restoreBtnText: { color: C.green, fontSize: 20, fontWeight: 'bold' },
  deleteBtn: { backgroundColor: C.redBg },
  deleteBtnText: { color: C.red, fontSize: 18, fontWeight: 'bold' },
});
