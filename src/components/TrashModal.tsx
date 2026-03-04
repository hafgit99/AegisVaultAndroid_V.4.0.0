import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert, Animated
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SecurityModule, VaultItem } from '../SecurityModule';
import { useTheme } from '../ThemeContext';

interface TrashModalProps {
  visible: boolean;
  onClose: () => void;
  onRefreshParent: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ visible, onClose, onRefreshParent }) => {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
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
        <View style={[s.content, { backgroundColor: C.bg }]}>
          <View style={s.header}>
            <View>
              <Text style={[s.headerTitle, { color: C.navy }]}>{t('trash.title')}</Text>
              <Text style={[s.headerSubtitle, { color: C.muted }]}>{t('trash.subtitle')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[s.closeX, { color: C.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {items.length === 0 ? (
              <View style={s.emptyContainer}>
                <Text style={s.emptyIcon}>🗑️</Text>
                <Text style={[s.emptyText, { color: C.muted }]}>{t('trash.empty_msg')}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity style={[s.emptyBtn, { backgroundColor: C.redBg }]} onPress={handleEmptyTrash}>
                  <Text style={[s.emptyBtnText, { color: C.red }]}>🚮 {t('trash.empty_trash')}</Text>
                </TouchableOpacity>
                {items.map((item) => (
                  <View key={item.id} style={[s.itemCard, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
                    <View style={s.itemInfo}>
                      <Text style={[s.itemTitle, { color: C.navy }]} numberOfLines={1}>{item.title}</Text>
                      <Text style={[s.itemSub, { color: C.muted }]} numberOfLines={1}>{item.username || item.url}</Text>
                      {item.deleted_at && (
                        <Text style={[s.dateText, { color: C.muted }]}>{item.deleted_at}</Text>
                      )}
                    </View>
                    <View style={s.itemActions}>
                      <TouchableOpacity 
                        style={[s.actionBtn, { backgroundColor: C.greenBg }]} 
                        onPress={() => item.id && handleRestore(item.id)}
                      >
                        <Text style={[s.restoreBtnText, { color: C.green }]}>↺</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[s.actionBtn, { backgroundColor: C.redBg }]} 
                        onPress={() => item.id && handleDeletePerm(item.id)}
                      >
                        <Text style={[s.deleteBtnText, { color: C.red }]}>✕</Text>
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
  headerTitle: { fontSize: 24, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  closeX: { fontSize: 24, padding: 4 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 64, opacity: 0.2, marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptyBtn: { 
    paddingVertical: 12, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.1)'
  },
  emptyBtnText: { fontWeight: '700', fontSize: 14 },
  itemCard: { 
    borderRadius: 18, 
    padding: 16, 
    marginBottom: 10, 
    borderWidth: 1, 
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  itemSub: { fontSize: 12 },
  dateText: { fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  itemActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  restoreBtnText: { fontSize: 20, fontWeight: 'bold' },
  deleteBtnText: { fontSize: 18, fontWeight: 'bold' },
});
