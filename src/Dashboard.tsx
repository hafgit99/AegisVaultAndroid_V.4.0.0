import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  FlatList,
  DeviceEventEmitter,
} from 'react-native';
import {
  SecurityModule,
  VaultItem,
  VaultSettings,
  SharedVaultSpace,
} from './SecurityModule';
import { BackupModal } from './components/BackupModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { LegalModal } from './components/LegalModal';
import { DonationModal } from './components/DonationModal';
import { TrashModal } from './components/TrashModal';
import { SecurityCenterModal } from './components/SecurityCenterModal';
import { SharedVaultsModal } from './components/SharedVaultsModal';
import { RoadmapCenterModal } from './components/RoadmapCenterModal';
import { ValidationWorkspaceModal } from './components/ValidationWorkspaceModal';
import { PairingWorkspaceModal } from './components/PairingWorkspaceModal';
import { PasswordGeneratorView } from './components/PasswordGeneratorView';
import { SettingsView } from './components/SettingsView';
import { AddModal } from './components/AddModal';
import { DetailModal } from './components/DetailModal';
import { SearchService } from './SearchService';
import { SecureAppSettings, SETTINGS_CHANGED_EVENT } from './SecureAppSettings';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutofillService } from './AutofillService';
import { IntegrityModule, IntegritySignals } from './IntegrityModule';
import { LockScreen } from './components/LockScreen';
import { BottomNav, Tab } from './components/BottomNav';
import { useAutoLock } from './hooks/useAutoLock';

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
  cyan: '#06b6d4',
  white: '#fff',
  muted: 'rgba(16,24,40,0.45)',
  divider: 'rgba(16,24,40,0.08)',
  inputBg: 'rgba(255,255,255,0.95)',
};
const CD = {
  bg: '#0b1220',
  navy: '#e2e8f0',
  sage: '#34d399',
  sageLight: 'rgba(52,211,153,0.14)',
  sageMid: 'rgba(52,211,153,0.28)',
  card: 'rgba(15,23,42,0.92)',
  cardBorder: 'rgba(148,163,184,0.22)',
  red: '#f87171',
  redBg: 'rgba(248,113,113,0.12)',
  green: '#22c55e',
  cyan: '#22d3ee',
  white: '#0f172a',
  muted: 'rgba(226,232,240,0.62)',
  divider: 'rgba(148,163,184,0.2)',
  inputBg: 'rgba(30,41,59,0.9)',
};
const getCatIcon = (c: string) =>
  ({
    all: '\uD83D\uDCCB',
    login: '\uD83D\uDD11',
    passkey: '\uD83D\uDD10',
    card: '\uD83D\uDCB3',
    identity: '\uD83E\uDEAA',
    note: '\uD83D\uDCDD',
    wifi: '\uD83D\uDCF6',
  }[c] || '\uD83D\uDD11');
const getCatColor = (c: string) =>
  ({
    login: 'rgba(114,136,111,0.15)',
    passkey: 'rgba(15,118,110,0.15)',
    card: 'rgba(6,182,212,0.15)',
    identity: 'rgba(245,158,11,0.15)',
    note: 'rgba(139,92,246,0.15)',
    wifi: 'rgba(59,130,246,0.15)',
  }[c] || C.sageLight);
const getCats = (t: any) => [
  { id: 'all', label: t('vault.categories.all'), icon: '\uD83D\uDCCB' },
  { id: 'login', label: t('vault.categories.login'), icon: '\uD83D\uDD11' },
  { id: 'passkey', label: t('vault.categories.passkey'), icon: '\uD83D\uDD10' },
  { id: 'card', label: t('vault.categories.card'), icon: '\uD83D\uDCB3' },
  { id: 'identity', label: t('vault.categories.identity'), icon: '\uD83E\uDEAA' },
  { id: 'note', label: t('vault.categories.note'), icon: '\uD83D\uDCDD' },
  { id: 'wifi', label: t('vault.categories.wifi'), icon: '\uD83D\uDCF6' },
];
export type { Tab };

export const Dashboard = () => {

  const insets = useSafeAreaInsets();
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>('vault');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState('all');
  const [settings, setSettings] = useState<VaultSettings>(SecureAppSettings.toVaultSettings());
  const palette = settings.darkMode ? CD : C;

  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showSecurityCenter, setShowSecurityCenter] = useState(false);

  const [editItem, setEditItem] = useState<VaultItem | null>(null);
  const [count, setCount] = useState(0);
  const [showBackup, setShowBackup] = useState(false);
  const [showCloud, setShowCloud] = useState(false);

  const [showSharedVaults, setShowSharedVaults] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showRoadmapCenter, setShowRoadmapCenter] = useState(false);
  const [showValidationWorkspace, setShowValidationWorkspace] = useState(false);
  const [showPairingWorkspace, setShowPairingWorkspace] = useState(false);

  const [sharedSpaces, setSharedSpaces] = useState<SharedVaultSpace[]>([]);
  const [legalType, setLegalType] = useState<'terms' | 'privacy' | null>(null);
  const [integrity, setIntegrity] = useState<IntegritySignals | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  const { resetTimer, lockVault } = useAutoLock({
    unlocked,
    autoLockSeconds: settings.autoLockSeconds,
    onLock: (_reason) => setUnlocked(false),
  });

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SETTINGS_CHANGED_EVENT, () => {
      setSettings(SecureAppSettings.toVaultSettings());
    });
    return () => sub.remove();
  }, []);

  const load = useCallback(async () => {
    const allCategoryItems = await SecurityModule.getItems('', selCat);
    const filtered = SearchService.searchDecrypted(allCategoryItems, search);
    setItems(filtered);
    setCount(await SecurityModule.getItemCount());
  }, [search, selCat]);
  const loadSettings = useCallback(
    async () => setSettings(await SecureAppSettings.toVaultSettings()),
    [],
  );
  const loadSharedSpaces = useCallback(
    async () => setSharedSpaces(await SecurityModule.getSharedVaultSpaces()),
    [],
  );

  useEffect(() => {
    if (unlocked) {
      load();
      loadSettings();
      loadSharedSpaces();
    }
  }, [unlocked, load, loadSettings, loadSharedSpaces]);

  useEffect(() => {
    if (!unlocked) {
      return;
    }

    AutofillService.setUnlocked(true);

    const interval = setInterval(() => {
      AutofillService.setUnlocked(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [unlocked]);

  useEffect(() => {
    (async () => {
      setIntegrityLoading(true);
      const signals = await IntegrityModule.getIntegritySignals();
      setIntegrity(signals);
      setIntegrityLoading(false);
    })();
  }, []);

  const lock = useCallback(() => {
    lockVault('manual');
    SecurityModule.lockVault();
  }, [lockVault]);

  if (!unlocked)
    return (
      <LockScreen
        palette={palette}
        darkMode={settings.darkMode}
        onUnlocked={() => setUnlocked(true)}
      />
    );

  return (
    <View
      style={[s.root, { backgroundColor: palette.bg }]}
      onTouchStart={resetTimer}
    >
      {tab === 'vault' && (
        <VaultView
          theme={palette}
          items={items}
          search={search}
          setSearch={setSearch}
          selCat={selCat}
          setSelCat={setSelCat}
          onRefresh={load}
          count={count}
          onAdd={() => {
            setEditItem(null);
            setShowAdd(true);
          }}
          onDetail={(i: VaultItem) => {
            setEditItem(i);
            setShowDetail(true);
          }}
          onLock={lock}
          onDonation={() => setShowDonation(true)}
          onTrash={() => setShowTrash(true)}
          onSecurityReport={() => setShowSecurityCenter(true)}
          insets={insets}
        />
      )}
      {tab === 'generator' && (
        <PasswordGeneratorView
          theme={palette}
          settings={settings}
          insets={insets}
        />
      )}
      {tab === 'settings' && (
        <SettingsView
          styles={s}
          theme={palette}
          integrity={integrity}
          integrityLoading={integrityLoading}
          settings={settings}
          onLock={lock}
          onBackup={() => setShowBackup(true)}
          onCloud={() => setShowCloud(true)}
          onSecurityReport={() => setShowSecurityCenter(true)}
          onSharedVaults={() => setShowSharedVaults(true)}
          onRoadmap={() => setShowRoadmapCenter(true)}
          onValidationWorkspace={() => setShowValidationWorkspace(true)}
          onPairingWorkspace={() => setShowPairingWorkspace(true)}
          openLegal={(type: 'terms' | 'privacy') => setLegalType(type)}
          onDonation={() => setShowDonation(true)}
          onTrash={() => setShowTrash(true)}
          insets={insets}
          onRefresh={load}
        />
      )}

      <AddModal
        styles={s}
        getCats={getCats}
        visible={showAdd}
        item={editItem}
        onClose={() => setShowAdd(false)}
        settings={settings}
        theme={palette}
        sharedSpaces={sharedSpaces}
        onSave={async (item: any, pending: any[]) => {
          let id = editItem?.id ?? null;
          if (id) await SecurityModule.updateItem(id, item);
          else id = await SecurityModule.addItem(item);
          if (id && pending.length) {
            for (const f of pending) {
              if (f.base64) {
                await SecurityModule.addAttachmentFromBase64(
                  id,
                  f.name,
                  f.type,
                  f.base64,
                  f.size,
                );
              } else {
                await SecurityModule.addAttachment(id, f.name, f.type, f.uri);
              }
            }
          }
          setShowAdd(false);
          load();
          loadSharedSpaces();
        }}
      />

      <DetailModal
          styles={s}
          colors={C}
          getCatIcon={getCatIcon}
          visible={showDetail}
          item={editItem}
          theme={palette}
          settings={settings}
          sharedSpaces={sharedSpaces}
          onRefresh={load}
          onClose={() => setShowDetail(false)}
        onEdit={() => {
          setShowDetail(false);
          setShowAdd(true);
        }}
        onDelete={async () => {
          if (editItem?.id) {
            await SecurityModule.deleteItem(editItem.id);
            setShowDetail(false);
            load();
          }
        }}
        onFav={async () => {
          if (editItem?.id) {
            await SecurityModule.toggleFavorite(editItem.id, editItem.favorite);
            setShowDetail(false);
            load();
          }
        }}
        clipClear={settings.clipboardClearSeconds}
      />

      <SharedVaultsModal
        visible={showSharedVaults}
        onClose={() => setShowSharedVaults(false)}
        onUpdated={() => {
          load();
          loadSharedSpaces();
        }}
        theme={palette}
      />
      {showBackup && (
        <BackupModal
          visible={showBackup}
          onClose={() => setShowBackup(false)}
          onImportDone={load}
          theme={palette}
        />
      )}
      {showCloud && (
        <CloudSyncModal
          visible={showCloud}
          onClose={() => setShowCloud(false)}
          onRefresh={load}
          theme={palette}
        />
      )}
      {showDonation && (
        <DonationModal
          visible={showDonation}
          onClose={() => setShowDonation(false)}
          theme={palette}
        />
      )}
      {showTrash && (
        <TrashModal
          visible={showTrash}
          onClose={() => setShowTrash(false)}
          onRefreshParent={load}
          theme={palette}
        />
      )}
      {unlocked && (
        <LegalModal
          visible={!!legalType}
          type={legalType}
          onClose={() => setLegalType(null)}
          theme={palette}
        />
      )}
      {showSecurityCenter && (
        <SecurityCenterModal
          visible={showSecurityCenter}
          onClose={() => setShowSecurityCenter(false)}
          items={items}
          theme={palette}
          insets={insets}
          db={SecurityModule.db}
          onNavigateToItem={(id: number) => {
            const found = items.find(item => item.id === id);
            if (found) {
              setEditItem(found);
              setShowDetail(true);
              setShowSecurityCenter(false);
            }
          }}
        />
      )}
      {showRoadmapCenter && (
        <RoadmapCenterModal
          visible={showRoadmapCenter}
          onClose={() => setShowRoadmapCenter(false)}
          items={items}
          theme={palette}
          insets={insets}
          autofillSupported={Platform.OS === 'android' && Number(Platform.Version) >= 26}
          onAction={(target: string) => {
            setShowRoadmapCenter(false);
            if (target === 'security_center') {
              setShowSecurityCenter(true);
              return;
            }
            if (target === 'shared_spaces') {
              setShowSharedVaults(true);
              return;
            }
            if (target === 'validation_workspace') {
              setShowValidationWorkspace(true);
              return;
            }
            if (target === 'pairing_workspace') {
              setShowPairingWorkspace(true);
              return;
            }
            AutofillService.openSettings();
          }}
        />
      )}
      {showValidationWorkspace && (
        <ValidationWorkspaceModal
          visible={showValidationWorkspace}
          onClose={() => setShowValidationWorkspace(false)}
          theme={palette}
          insets={insets}
        />
      )}
      {showPairingWorkspace && (
        <PairingWorkspaceModal
          visible={showPairingWorkspace}
          onClose={() => setShowPairingWorkspace(false)}
          theme={palette}
          insets={insets}
        />
      )}

      <BottomNav
        tab={tab}
        onTabChange={setTab}
        palette={palette}
        insets={insets}
      />
    </View>
  );
};

const VaultView = ({
  theme,
  items,
  search,
  setSearch,
  selCat,
  setSelCat,
  onRefresh,
  count,
  onAdd,
  onDetail,
  onLock,
  onDonation,
  onTrash,
  onSecurityReport,
  insets,
}: any) => {
  const { t } = useTranslation();

  const renderItem = useCallback(({ item: i }: { item: VaultItem }) => (
    <TouchableOpacity
      key={i.id}
      style={[
        s.item,
        { backgroundColor: theme.card, borderColor: theme.cardBorder },
      ]}
      onPress={() => onDetail(i)}
      activeOpacity={0.7}
    >
      <View
        style={[s.avatar, { backgroundColor: getCatColor(i.category) }]}
      >
        <Text style={{ fontSize: 20 }}>{'\u2764\uFE0F'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Text
            style={[s.itemT, { color: theme.navy }]}
            numberOfLines={1}
          >
            {i.title}
          </Text>
          {i.favorite === 1 && <Text style={{ fontSize: 12 }}>{'\u2B50'}</Text>}
          {SecurityModule.parseSharedAssignment(i) ? (
            <Text
              style={{ fontSize: 11, color: theme.sage, fontWeight: '700' }}
            >
              {t('shared.list_badge')}
            </Text>
          ) : null}
        </View>
        <Text
          style={[s.itemS, { color: theme.muted }]}
          numberOfLines={1}
        >
          {i.username ||
            i.url ||
            getCats(t).find(x => x.id === i.category)?.label}
        </Text>
      </View>
      <Text
        style={{ fontSize: 22, color: theme.muted, fontWeight: '300' }}
      >
        {'\u203A'}
      </Text>
    </TouchableOpacity>
  ), [theme, onDetail, t]);

  const ListHeader = useMemo(() => (
    <>
      <View style={s.hdr}>
        <View>
          <Text style={[s.hdrT, { color: theme.navy }]}>
            {t('lock_screen.title')}
          </Text>
          <Text style={[s.hdrS, { color: theme.sage }]}>
            {count} {t('vault.items_count')} {'\u2022'} AES-256
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onDonation}
            style={[
              s.lockIc,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{'\u2764\uFE0F'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSecurityReport}
            style={[
              s.lockIc,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{'\uD83D\uDEE1\uFE0F'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onTrash}
            style={[
              s.lockIc,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{'\uD83D\uDDD1\uFE0F'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLock}
            style={[
              s.lockIc,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{'\uD83D\uDD12'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[
          s.srch,
          { backgroundColor: theme.inputBg, borderColor: theme.cardBorder },
        ]}
      >
        <Text style={{ fontSize: 16, marginRight: 8 }}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          style={s.srchIn}
          placeholder={t('vault.search')}
          placeholderTextColor={theme.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          onSubmitEditing={onRefresh}
          accessibilityLabel={t('vault.search')}
          accessibilityRole="search"
        />
        {search ? (
          <TouchableOpacity
            onPress={() => {
              setSearch('');
            }}
          >
            <Text style={{ fontSize: 16, color: theme.muted, padding: 4 }}>{'\u2715'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 16, flexGrow: 0 }}
      >
        {getCats(t).map(c => (
          <TouchableOpacity
            key={c.id}
            style={[
              s.cat,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
              selCat === c.id && {
                backgroundColor: theme.sage,
                borderColor: theme.sage,
              },
            ]}
            onPress={() => setSelCat(c.id)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 14, marginRight: 5 }}>{c.icon}</Text>
            <Text
              style={[
                s.catLbl,
                { color: theme.navy },
                selCat === c.id && { color: '#fff' },
              ]}
            >
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  ), [theme, count, t, onDonation, onSecurityReport, onTrash, onLock, search, setSearch, onRefresh, selCat, setSelCat]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD10'}</Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '700',
                color: theme.navy,
                marginBottom: 6,
              }}
            >
              {t('vault.search')}
            </Text>
          </View>
        }
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 100 + (insets?.bottom || 0),
        }}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
      <TouchableOpacity
        style={[
          s.fab,
          { bottom: 90 + (insets?.bottom || 0), backgroundColor: theme.sage },
        ]}
        onPress={onAdd}
        activeOpacity={0.8}
        accessibilityLabel={t('vault.add_new')}
        accessibilityRole="button"
      >
        <Text style={s.fabT}>+</Text>
      </TouchableOpacity>
    </View>
  );
};


const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loginBox: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  title: { fontSize: 30, fontWeight: '800', color: C.navy, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.muted, marginBottom: 36 },
  bioBtn: {
    backgroundColor: C.card,
    borderColor: C.sageMid,
    borderWidth: 1,
    paddingVertical: 17,
    paddingHorizontal: 32,
    borderRadius: 22,
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(114,136,111,0.1)',
  },
  bioBtnText: { color: C.navy, fontWeight: '700', fontSize: 15 },
  info: {
    marginTop: 36,
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.35,
    color: C.navy,
    textAlign: 'center',
  },
  hdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  hdrT: { fontSize: 26, fontWeight: '800', color: C.navy },
  hdrS: { fontSize: 13, color: C.sage, fontWeight: '600', marginTop: 3 },
  lockIc: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  srch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  srchIn: {
    flex: 1,
    fontSize: 14,
    color: C.navy,
    paddingVertical: 12,
    fontWeight: '500',
  },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: C.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  catAct: { backgroundColor: C.sage, borderColor: C.sage },
  catLbl: { fontSize: 12, fontWeight: '600', color: C.navy },
  catLblAct: { color: C.white },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemT: { fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 },
  itemS: { fontSize: 12, color: C.muted, marginTop: 3 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: C.sage,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabT: { fontSize: 28, color: C.white, fontWeight: '300', marginTop: -2 },
  nav: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingBottom: 20,
    paddingTop: 10,
  },
  navItem: { flex: 1, alignItems: 'center' },
  navIc: { fontSize: 22, opacity: 0.5 },
  navAct: { opacity: 1 },
  navLbl: { fontSize: 10, color: C.muted, marginTop: 3, fontWeight: '600' },
  navLblAct: { color: C.sage },
  genBox: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    marginTop: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  genPw: {
    fontSize: 17,
    fontWeight: '700',
    color: C.navy,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
    lineHeight: 24,
  },
  genBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.divider,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  optBox: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  sliderR: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sliderB: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.sageLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderBT: { fontSize: 20, color: C.sage, fontWeight: '700' },
  sliderTr: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.divider,
    overflow: 'hidden',
  },
  sliderFl: { height: '100%', borderRadius: 3, backgroundColor: C.sage },
  sec: {
    fontSize: 14,
    fontWeight: '700',
    color: C.navy,
    marginTop: 24,
    marginBottom: 10,
  },
  sCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  sLbl: { fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 18 },
  chipR: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  oChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  oChipA: { backgroundColor: C.sage, borderColor: C.sage },
  oChipT: { fontSize: 12, fontWeight: '600', color: C.navy },
  oChipTA: { color: C.white },
  lockBtn: {
    marginTop: 24,
    backgroundColor: C.redBg,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
  },
  lockBtnT: { color: C.red, fontWeight: '700', fontSize: 15 },
  mdOv: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  mdC: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '92%',
    borderWidth: 1,
  },
  mdH: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  mdT: { fontSize: 20, fontWeight: '800', color: C.navy },
  mdX: { fontSize: 22, color: C.muted, padding: 4 },
  saveBtn: {
    backgroundColor: C.sage,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  actBtn: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actBtnT: { fontWeight: '700', fontSize: 14 },
});
