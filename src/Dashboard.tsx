import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Modal, Alert, Animated, Clipboard, AppState, AppStateStatus,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import { SecurityModule, VaultItem, VaultSettings, Attachment } from './SecurityModule';
import { SelectChips, ToggleRow } from './components/FormFields';
import { CategoryForm } from './components/CategoryForms';
import { AttachmentSection } from './components/AttachmentSection';
import { BackupModal } from './components/BackupModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { LegalModal } from './components/LegalModal';
import { TOTPDisplay } from './components/TOTPDisplay';
import { DonationModal } from './components/DonationModal';
import { TrashModal } from './components/TrashModal';
import { HIBPModule } from './HIBPModule';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { switchLanguage } from './i18n';
import { AutofillService } from './AutofillService';

const rnBiometrics = new ReactNativeBiometrics();
const C = {
  bg: '#F0EEE9', navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  sageMid: 'rgba(114,136,111,0.25)', card: 'rgba(255,255,255,0.45)',
  cardBorder: 'rgba(255,255,255,0.55)', red: '#ef4444', redBg: 'rgba(239,68,68,0.08)',
  green: '#22c55e', cyan: '#06b6d4', white: '#fff', muted: 'rgba(16,24,40,0.45)',
  divider: 'rgba(16,24,40,0.06)', inputBg: 'rgba(255,255,255,0.7)',
};
const getCatIcon = (c: string) => ({all:'📋',login:'🔑',card:'💳',identity:'🪪',note:'📝',wifi:'📶'})[c] || '🔑';
const getCatColor = (c: string) => ({ login: 'rgba(114,136,111,0.15)', card: 'rgba(6,182,212,0.15)',
  identity: 'rgba(245,158,11,0.15)', note: 'rgba(139,92,246,0.15)', wifi: 'rgba(59,130,246,0.15)' }[c] || C.sageLight);
const getCats = (t: any) => [
  { id: 'all', label: t('vault.categories.all'), icon: '📋' }, { id: 'login', label: t('vault.categories.login'), icon: '🔑' },
  { id: 'card', label: t('vault.categories.card'), icon: '💳' }, { id: 'identity', label: t('vault.categories.identity'), icon: '🪪' },
  { id: 'note', label: t('vault.categories.note'), icon: '📝' }, { id: 'wifi', label: t('vault.categories.wifi'), icon: '📶' },
];
type Tab = 'vault' | 'generator' | 'settings';

// ═══════════════════════════════════════════════════
export const Dashboard = () => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [unlocked, setUnlocked] = useState(false);
  const [authStatus, setAuthStatus] = useState(t('lock_screen.prompt'));
  const [tab, setTab] = useState<Tab>('vault');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState('all');
  const [settings, setSettings] = useState<VaultSettings>({ autoLockSeconds: 60, biometricEnabled: true, clipboardClearSeconds: 30, passwordLength: 20 });
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editItem, setEditItem] = useState<VaultItem | null>(null);
  const [count, setCount] = useState(0);
  const [showBackup, setShowBackup] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [legalType, setLegalType] = useState<'terms' | 'privacy' | null>(null);
  const glow = useRef(new Animated.Value(0.4)).current;

  const [isPickingFile, setIsPickingFile] = useState(false);
  const backgroundTimeRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  const unlockedRef = useRef(unlocked);

  // Keep refs in sync with state for use in AppState listener
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { unlockedRef.current = unlocked; }, [unlocked]);

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.4, duration: 2000, useNativeDriver: true }),
    ])).start();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      // Skip if picking a file (file picker briefly backgrounds the app)
      if (SecurityModule.isPickingFileFlag) return;

      if (!unlockedRef.current) return; // already locked, no action needed

      if (nextState === 'background' || nextState === 'inactive') {
        // App going to background → record timestamp
        backgroundTimeRef.current = Date.now();

        // If auto-lock is disabled (0), don't lock at all on background
        // The vault stays open until manual lock
        if (settingsRef.current.autoLockSeconds === 0) return;

        // Start a background timeout: if the user doesn't return within the
        // configured duration, lock the vault. This handles cases where           
        // setTimeout continues to run briefly after backgrounding.
        SecurityModule.startAutoLockTimer(settingsRef.current.autoLockSeconds, () => {
          SecurityModule.lockVault();
          setUnlocked(false);
          setAuthStatus(t('lock_screen.auto_locked'));
        });

      } else if (nextState === 'active') {
        // App coming back to foreground → check elapsed time
        if (backgroundTimeRef.current !== null) {
          const elapsedSeconds = (Date.now() - backgroundTimeRef.current) / 1000;
          backgroundTimeRef.current = null;

          const lockSeconds = settingsRef.current.autoLockSeconds;

          if (lockSeconds > 0 && elapsedSeconds >= lockSeconds) {
            // Elapsed time exceeded auto-lock duration → lock now
            SecurityModule.lockVault();
            setUnlocked(false);
            setAuthStatus(t('lock_screen.auto_locked'));
          } else {
            // Still within time limit → stay unlocked, reset foreground timer
            if (lockSeconds > 0) {
              SecurityModule.resetAutoLockTimer(lockSeconds, () => {
                SecurityModule.lockVault();
                setUnlocked(false);
                setAuthStatus(t('lock_screen.auto_locked'));
              });
            }
          }
        }
      }
    });
    return () => sub.remove();
  }, []);

  const load = useCallback(async () => {
    setItems(await SecurityModule.getItems(search, selCat));
    setCount(await SecurityModule.getItemCount());
  }, [search, selCat]);
  const loadSettings = useCallback(async () => setSettings(await SecurityModule.getAllSettings()), []);

  useEffect(() => { if (unlocked) { load(); loadSettings(); } }, [unlocked, load, loadSettings]);

  const lock = () => { SecurityModule.lockVault(); setUnlocked(false); setAuthStatus(t('lock_screen.locked')); };
  const autoLockCb = useCallback(() => { SecurityModule.lockVault(); setUnlocked(false); setAuthStatus(t('lock_screen.auto_locked')); }, [t]);
  useEffect(() => {
    if (unlocked && settings.autoLockSeconds > 0) SecurityModule.startAutoLockTimer(settings.autoLockSeconds, autoLockCb);
    return () => SecurityModule.clearAutoLockTimer();
  }, [unlocked, settings.autoLockSeconds]);
  const resetTimer = () => { if (unlocked && settings.autoLockSeconds > 0) SecurityModule.resetAutoLockTimer(settings.autoLockSeconds, autoLockCb); };

  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [failCount, setFailCount] = useState(0);

  const auth = async () => {
    try {
      // Check brute force lockout
      const remaining = await SecurityModule.getRemainingLockout();
      if (remaining > 0) {
        setLockoutRemaining(remaining);
        setAuthStatus(t('lock_screen.locked_out', { seconds: remaining }));
        return;
      }

      const { available, biometryType } = await rnBiometrics.isSensorAvailable();
      if (!available || !biometryType) { setAuthStatus(t('lock_screen.bio_not_found')); return; }
      setAuthStatus(t('lock_screen.verifying'));

      // Deterministic biometric key derivation (Android Keystore + PBKDF2)
      const vaultKey = await SecurityModule.deriveKeyFromBiometric();

      if (!vaultKey) {
        setAuthStatus(t('lock_screen.cancelled'));
        return;
      }

      if (await SecurityModule.unlockVault(vaultKey)) {
        setUnlocked(true);
        setAuthStatus(t('lock_screen.unlocked'));
        setFailCount(0);
        setLockoutRemaining(0);
        // Automatic cleanup of old trash items (>30 days)
        SecurityModule.cleanupOldTrash();
      } else {
        const fails = await SecurityModule.getFailedAttempts();
        setFailCount(fails);
        const newRemaining = await SecurityModule.getRemainingLockout();
        setLockoutRemaining(newRemaining);
        if (newRemaining > 0) {
          setAuthStatus(t('lock_screen.failed_attempts', { count: fails, seconds: newRemaining }));
        } else {
          setAuthStatus(t('lock_screen.failed', { count: fails }));
        }
      }
    } catch { setAuthStatus(t('lock_screen.error')); }
  };

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          setAuthStatus(t('lock_screen.retry'));
          clearInterval(interval);
          return 0;
        }
        setAuthStatus(t('lock_screen.locked_out', { seconds: prev - 1 }));
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  // Check lockout on mount
  useEffect(() => {
    (async () => {
      // Sync native autofill state on startup: if app starts locked, ensure service is locked
      if (!unlockedRef.current) {
        AutofillService.setUnlocked(false);
        AutofillService.clearEntries();
      }

      const remaining = await SecurityModule.getRemainingLockout();
      const fails = await SecurityModule.getFailedAttempts();
      if (remaining > 0) {
        setLockoutRemaining(remaining);
        setFailCount(fails);
        setAuthStatus(t('lock_screen.locked_out', { seconds: remaining }));
      }
    })();
  }, [t]);

  // Lock screen
  if (!unlocked) return (
    <View style={s.loginBox}>
      <Text style={{ fontSize: 52, marginBottom: 12 }}>🛡️</Text>
      <Text style={s.title}>{t('lock_screen.title')}</Text>
      <Text style={s.subtitle}>{authStatus}</Text>
      {lockoutRemaining > 0 && (
        <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 13, textAlign: 'center' }}>
            {t('lock_screen.brute_force_active')}
          </Text>
          <Text style={{ color: '#ef4444', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
            {t('lock_screen.brute_force_desc', { fails: failCount, seconds: lockoutRemaining })}
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={[s.bioBtn, lockoutRemaining > 0 && { opacity: 0.4 }]}
        onPress={auth}
        activeOpacity={0.75}
        disabled={lockoutRemaining > 0}
      >
        <Animated.View style={[s.glow, { opacity: lockoutRemaining > 0 ? 0 : glow }]} />
        <Text style={s.bioBtnText}>{t('lock_screen.bio_btn')}</Text>
      </TouchableOpacity>
      
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 40 }}>
        <TouchableOpacity onPress={() => switchLanguage('tr')} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: i18n.language === 'tr' ? C.sage : C.card, borderRadius: 20 }}>
          <Text style={{ color: i18n.language === 'tr' ? C.white : C.navy, fontWeight: '600' }}>🇹🇷 Türkçe</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => switchLanguage('en')} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: i18n.language === 'en' ? C.sage : C.card, borderRadius: 20 }}>
          <Text style={{ color: i18n.language === 'en' ? C.white : C.navy, fontWeight: '600' }}>🇬🇧 English</Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.info, { marginTop: 20 }]}>AES-256-GCM • Android Keystore • Argon2id</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 16, paddingHorizontal: 20 }}>
        <Text style={{ fontSize: 11, color: C.muted, lineHeight: 18 }}>
          {t('legal.disclaimer').split('{{terms}}')[0]}
        </Text>
        <TouchableOpacity onPress={() => setLegalType('terms')} activeOpacity={0.6}>
          <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', textDecorationLine: 'underline', lineHeight: 18 }}>
            {t('legal.terms')}
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 11, color: C.muted, lineHeight: 18 }}>
          {t('legal.disclaimer').split('{{terms}}')[1].split('{{privacy}}')[0]}
        </Text>
        <TouchableOpacity onPress={() => setLegalType('privacy')} activeOpacity={0.6}>
          <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', textDecorationLine: 'underline', lineHeight: 18 }}>
            {t('legal.privacy')}
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 11, color: C.muted, lineHeight: 18 }}>
          {t('legal.disclaimer').split('{{privacy}}')[1] || ''}
        </Text>
      </View>
      
      <LegalModal visible={!!legalType} type={legalType} onClose={() => setLegalType(null)} />
    </View>
  );

  return (
    <View style={s.root} onTouchStart={resetTimer}>
      {tab === 'vault' && <VaultView items={items} search={search} setSearch={setSearch} selCat={selCat} setSelCat={setSelCat}
        onRefresh={load} count={count} onAdd={() => { setEditItem(null); setShowAdd(true); }}
        onDetail={(i: VaultItem) => { setEditItem(i); setShowDetail(true); }} onLock={lock} onDonation={() => setShowDonation(true)} onTrash={() => setShowTrash(true)} insets={insets} />}
      {tab === 'generator' && <GenView settings={settings} insets={insets} />}
      {tab === 'settings' && <SettView settings={settings} setSettings={setSettings} onLock={lock} onBackup={() => setShowBackup(true)} onCloud={() => setShowCloud(true)} openLegal={(type: any) => setLegalType(type)} onDonation={() => setShowDonation(true)} onTrash={() => setShowTrash(true)} insets={insets} onRefresh={load} />}

      <View style={[s.nav, { paddingBottom: Math.max(20, insets.bottom + 10) }]}>
        {([['vault',t('nav.vault'),'🔒'],['generator',t('nav.generator'),'⚡'],['settings',t('nav.settings'),'⚙️']] as const).map(([id,lbl,ic]) => (
          <TouchableOpacity key={id} style={s.navItem} onPress={() => setTab(id as Tab)} activeOpacity={0.6}>
            <Text style={[s.navIc, tab === id && s.navAct]}>{ic}</Text>
            <Text style={[s.navLbl, tab === id && s.navLblAct]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <AddModal visible={showAdd} item={editItem} onClose={() => setShowAdd(false)} settings={settings}
        onSave={async (item: any, pending: any[]) => {
          let id = editItem?.id ?? null;
          if (id) await SecurityModule.updateItem(id, item);
          else id = await SecurityModule.addItem(item);
          if (id && pending.length) {
            for (const f of pending) {
              if (f.base64) {
                // Use pre-cached base64 data (from pending files)
                await SecurityModule.addAttachmentFromBase64(id, f.name, f.type, f.base64, f.size);
              } else {
                // Fallback: try reading from URI directly
                await SecurityModule.addAttachment(id, f.name, f.type, f.uri);
              }
            }
          }
          setShowAdd(false); load();
        }} />

      <DetailModal visible={showDetail} item={editItem} onClose={() => setShowDetail(false)}
        onEdit={() => { setShowDetail(false); setShowAdd(true); }}
        onDelete={async () => { if (editItem?.id) { await SecurityModule.deleteItem(editItem.id); setShowDetail(false); load(); } }}
        onFav={async () => { if (editItem?.id) { await SecurityModule.toggleFavorite(editItem.id, editItem.favorite); setShowDetail(false); load(); } }}
        clipClear={settings.clipboardClearSeconds} />
      {showBackup && <BackupModal visible={showBackup} onClose={() => setShowBackup(false)} onImportDone={load} />}
      {showCloud && <CloudSyncModal visible={showCloud} onClose={() => setShowCloud(false)} onRefresh={load} />}
      {showDonation && <DonationModal visible={showDonation} onClose={() => setShowDonation(false)} />}
      {showTrash && <TrashModal visible={showTrash} onClose={() => setShowTrash(false)} onRefreshParent={load} />}
      {unlocked && <LegalModal visible={!!legalType} type={legalType} onClose={() => setLegalType(null)} />}
    </View>
  );
};

// ── Vault ──
const VaultView = ({ items, search, setSearch, selCat, setSelCat, onRefresh, count, onAdd, onDetail, onLock, onDonation, onTrash, insets }: any) => {
  const { t } = useTranslation();
  return (
  <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 + (insets?.bottom || 0) }}>
      <View style={s.hdr}><View><Text style={s.hdrT}>{t('lock_screen.title')}</Text><Text style={s.hdrS}>{count} {t('vault.items_count')} • AES-256</Text></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={onTrash} style={s.lockIc}><Text style={{ fontSize: 20 }}>🗑️</Text></TouchableOpacity>
          <TouchableOpacity onPress={onDonation} style={s.lockIc}><Text style={{ fontSize: 20 }}>❤️</Text></TouchableOpacity>
          <TouchableOpacity onPress={onLock} style={s.lockIc}><Text style={{ fontSize: 20 }}>🔒</Text></TouchableOpacity>
        </View>
      </View>
      <View style={s.srch}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
        <TextInput style={s.srchIn} placeholder={t('vault.search')} placeholderTextColor={C.muted} value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={onRefresh} />
        {search ? <TouchableOpacity onPress={() => { setSearch(''); }}><Text style={{ fontSize: 16, color: C.muted, padding: 4 }}>✕</Text></TouchableOpacity> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, flexGrow: 0 }}>
        {getCats(t).map(c => (
          <TouchableOpacity key={c.id} style={[s.cat, selCat === c.id && s.catAct]} onPress={() => setSelCat(c.id)} activeOpacity={0.7}>
            <Text style={{ fontSize: 14, marginRight: 5 }}>{c.icon}</Text>
            <Text style={[s.catLbl, selCat === c.id && s.catLblAct]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 6 }}>{t('vault.search')}</Text>
        </View>
      ) : items.map((i: VaultItem) => (
        <TouchableOpacity key={i.id} style={s.item} onPress={() => onDetail(i)} activeOpacity={0.7}>
          <View style={[s.avatar, { backgroundColor: getCatColor(i.category) }]}><Text style={{ fontSize: 20 }}>{getCatIcon(i.category)}</Text></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.itemT} numberOfLines={1}>{i.title}</Text>{i.favorite === 1 && <Text style={{ fontSize: 12 }}>⭐</Text>}
            </View>
            <Text style={s.itemS} numberOfLines={1}>{i.username || i.url || getCats(t).find(x => x.id === i.category)?.label}</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.muted, fontWeight: '300' }}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
    <TouchableOpacity style={[s.fab, { bottom: 90 + (insets?.bottom || 0) }]} onPress={onAdd} activeOpacity={0.8}><Text style={s.fabT}>+</Text></TouchableOpacity>
  </View>
)};

// ── Generator ──
const GenView = ({ settings, insets }: any) => {
  const { t } = useTranslation();
  const [pw, setPw] = useState('');
  const [len, setLen] = useState(settings.passwordLength);
  const [up, setUp] = useState(true); const [lo, setLo] = useState(true);
  const [num, setNum] = useState(true); const [sym, setSym] = useState(true);
  const [copied, setCopied] = useState(false);
  const gen = useCallback(() => { setPw(SecurityModule.generatePassword(len, { uppercase: up, lowercase: lo, numbers: num, symbols: sym })); setCopied(false); }, [len, up, lo, num, sym]);
  useEffect(() => { gen(); }, [gen]);
  const str = SecurityModule.getPasswordStrength(pw);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 + (insets?.bottom || 0) }}>
      <Text style={s.hdrT}>{t('generator.title')}</Text><Text style={s.hdrS}>{t('generator.subtitle')}</Text>
      <View style={s.genBox}><Text style={s.genPw} selectable>{pw}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10 }}>
          <View style={[s.bar, { flex: 1 }]}><View style={[s.barFill, { width: `${(str.score/7)*100}%`, backgroundColor: str.color }]} /></View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: str.color }}>{t(`generator.strength.${str.score > 3 ? 'strong' : 'weak'}`)}</Text></View></View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <TouchableOpacity style={[s.genBtn, { backgroundColor: C.sage }]} onPress={gen} activeOpacity={0.7}><Text style={{ color: '#fff', fontWeight: '700' }}>🔄 {t('generator.generate')}</Text></TouchableOpacity>
        <TouchableOpacity style={[s.genBtn, copied ? { backgroundColor: 'rgba(34,197,94,0.12)' } : { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }]}
          onPress={() => { Clipboard.setString(pw); setCopied(true); setTimeout(() => setCopied(false), 2000); }} activeOpacity={0.7}>
          <Text style={{ color: copied ? C.green : C.sage, fontWeight: '700' }}>{copied ? `✓ ${t('fields.copied')}` : `📋 ${t('generator.copy')}`}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.optBox}>
        <Text style={s.sLbl}>{t('generator.length')}: {len}</Text>
        <View style={s.sliderR}>
          <TouchableOpacity onPress={() => setLen(Math.max(6, len - 1))} style={s.sliderB}><Text style={s.sliderBT}>−</Text></TouchableOpacity>
          <View style={s.sliderTr}><View style={[s.sliderFl, { width: `${((len-6)/58)*100}%` }]} /></View>
          <TouchableOpacity onPress={() => setLen(Math.min(64, len + 1))} style={s.sliderB}><Text style={s.sliderBT}>+</Text></TouchableOpacity>
        </View>
        <ToggleRow label={t('generator.uppercase')} value={up} onToggle={setUp} />
        <ToggleRow label={t('generator.lowercase')} value={lo} onToggle={setLo} />
        <ToggleRow label={t('generator.numbers')} value={num} onToggle={setNum} />
        <ToggleRow label={t('generator.symbols')} value={sym} onToggle={setSym} />
      </View>
    </ScrollView>
  );
};


// ── Settings ──
const SettView = ({ settings: st2, setSettings, onLock, onBackup, onCloud, openLegal, onDonation, onTrash, insets, onRefresh }: any) => {
  const { t, i18n } = useTranslation();
  const upd = async (k: string, v: any) => { const n = { ...st2, [k]: v }; setSettings(n); await SecurityModule.setSetting(k, String(v)); };
  const ALO = [{l:t('settings.off'),v:0},{l:`30 ${t('settings.sec')}`,v:30},{l:`1 ${t('settings.min')}`,v:60},{l:`2 ${t('settings.min')}`,v:120},{l:`5 ${t('settings.min')}`,v:300},{l:`15 ${t('settings.min')}`,v:900}];
  const CLO = [{l:t('settings.off'),v:0},{l:`15 ${t('settings.sec')}`,v:15},{l:`30 ${t('settings.sec')}`,v:30},{l:`1 ${t('settings.min')}`,v:60}];
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 100 + (insets?.bottom || 0) }}>
      <Text style={s.hdrT}>{t('settings.title')}</Text><Text style={s.hdrS}>{t('settings.subtitle')}</Text>
      
      <Text style={s.sec}>🌐 Language / Dil</Text>
      <View style={s.sCard}>
        <View style={s.chipR}>
          <TouchableOpacity onPress={() => switchLanguage('tr')} style={[s.oChip, i18n.language === 'tr' && s.oChipA]}>
            <Text style={[s.oChipT, i18n.language === 'tr' && s.oChipTA]}>🇹🇷 Türkçe</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => switchLanguage('en')} style={[s.oChip, i18n.language === 'en' && s.oChipA]}>
            <Text style={[s.oChipT, i18n.language === 'en' && s.oChipTA]}>🇬🇧 English</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Autofill Section ── */}
      <Text style={s.sec}>{t('settings.autofill.title')}</Text>
      <TouchableOpacity style={s.sCard} onPress={() => AutofillService.openSettings()} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{t('settings.autofill.enable')}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 }}>
              {t('settings.autofill.enable_desc')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.sage }} />
              <Text style={{ fontSize: 11, color: C.sage, fontWeight: '600' }}>{t('settings.autofill.support')}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 22, color: C.muted, fontWeight: '300', marginLeft: 12 }}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={[s.sCard, { backgroundColor: 'rgba(114,136,111,0.06)', borderColor: 'rgba(114,136,111,0.2)' }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy, marginBottom: 8 }}>{t('settings.autofill.how_to')}</Text>
        <Text style={{ fontSize: 12, color: C.muted, lineHeight: 19 }}>
          {t('settings.autofill.steps')}
        </Text>
      </View>

      <Text style={s.sec}>{t('settings.security')}</Text>
      <View style={s.sCard}><ToggleRow label={t('settings.bio_login')} value={st2.biometricEnabled} onToggle={(v: boolean) => upd('biometricEnabled', v)} /></View>
      <Text style={s.sec}>{t('settings.auto_lock')}</Text>
      <View style={s.sCard}><Text style={s.sLbl}>{t('settings.auto_lock_desc')}</Text>
        <View style={s.chipR}>{ALO.map(o => <TouchableOpacity key={o.v} style={[s.oChip, st2.autoLockSeconds===o.v && s.oChipA]} onPress={() => upd('autoLockSeconds',o.v)} activeOpacity={0.7}>
          <Text style={[s.oChipT, st2.autoLockSeconds===o.v && s.oChipTA]}>{o.l}</Text></TouchableOpacity>)}</View></View>
      <Text style={s.sec}>{t('settings.clipboard_clear')}</Text>
      <View style={s.sCard}><Text style={s.sLbl}>{t('settings.clipboard_clear_desc')}</Text>
        <View style={s.chipR}>{CLO.map(o => <TouchableOpacity key={o.v} style={[s.oChip, st2.clipboardClearSeconds===o.v && s.oChipA]} onPress={() => upd('clipboardClearSeconds',o.v)} activeOpacity={0.7}>
          <Text style={[s.oChipT, st2.clipboardClearSeconds===o.v && s.oChipTA]}>{o.l}</Text></TouchableOpacity>)}</View></View>
      <Text style={s.sec}>{t('settings.default_length')}</Text>
      <View style={s.sCard}><Text style={s.sLbl}>{t('settings.default_length_desc', { length: st2.passwordLength })}</Text>
        <View style={s.sliderR}>
          <TouchableOpacity onPress={() => upd('passwordLength', Math.max(8, st2.passwordLength-2))} style={s.sliderB}><Text style={s.sliderBT}>−</Text></TouchableOpacity>
          <View style={s.sliderTr}><View style={[s.sliderFl, { width: `${((st2.passwordLength-8)/56)*100}%` }]} /></View>
          <TouchableOpacity onPress={() => upd('passwordLength', Math.min(64, st2.passwordLength+2))} style={s.sliderB}><Text style={s.sliderBT}>+</Text></TouchableOpacity>
        </View></View>
      <Text style={s.sec}>{t('settings.backup')}</Text>
      <TouchableOpacity style={s.sCard} onPress={onBackup} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{t('settings.import_export')}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{t('settings.import_export_desc')}</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.muted, fontWeight: '300', marginLeft: 12 }}>›</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={s.sCard} onPress={onCloud} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{t('settings.cloud')}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{t('settings.cloud_desc')}</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.muted, fontWeight: '300', marginLeft: 12 }}>›</Text>
        </View>
      </TouchableOpacity>

      <Text style={s.sec}>{t('trash.title')}</Text>
      <TouchableOpacity style={s.sCard} onPress={onTrash} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{t('trash.subtitle')}</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.muted, fontWeight: '300', marginLeft: 12 }}>🗑️</Text>
        </View>
      </TouchableOpacity>

      <Text style={s.sec}>{t('donation.title')}</Text>
      <TouchableOpacity style={s.sCard} onPress={onDonation} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{t('donation.subtitle')}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{t('donation.description')}</Text>
          </View>
          <Text style={{ fontSize: 22, color: C.muted, fontWeight: '300', marginLeft: 12 }}>›</Text>
        </View>
      </TouchableOpacity>

      <Text style={s.sec}>{t('settings.about')}</Text>
      <View style={s.sCard}>
        <Text style={s.sLbl}>{t('settings.about_desc')}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
          <TouchableOpacity onPress={() => openLegal('terms')} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.sage }}>{t('legal.terms')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openLegal('privacy')} activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.sage }}>{t('legal.privacy')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.sec}>⚠️ {t('reset.vault_title')}</Text>
      <TouchableOpacity 
        style={[s.sCard, { borderColor: 'rgba(239,68,68,0.2)' }]} 
        onPress={() => {
          Alert.alert(t('reset.vault_title'), t('reset.vault_confirm'), [
            { text: t('vault.cancel'), style: 'cancel' },
            { text: t('vault.delete'), style: 'destructive', onPress: async () => {
              await SecurityModule.resetVault();
              Alert.alert(t('reset.success'));
              onRefresh();
            }}
          ]);
        }} 
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.red }}>{t('reset.vault_title')}</Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{t('reset.vault_desc')}</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[s.sCard, { backgroundColor: C.redBg, borderColor: C.red }]} 
        onPress={() => {
          Alert.alert(t('reset.factory_title'), t('reset.factory_confirm'), [
            { text: t('vault.cancel'), style: 'cancel' },
            { text: t('reset.factory_title'), style: 'destructive', onPress: async () => {
              await SecurityModule.factoryReset();
              Alert.alert(t('reset.factory_success'));
              // In a real app we might use RNExitApp or similar, 
              // but here we just lock and let them restart
            }}
          ]);
        }} 
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.red }}>{t('reset.factory_title')}</Text>
        <Text style={{ fontSize: 12, color: C.navy, opacity: 0.6, marginTop: 4 }}>{t('reset.factory_desc')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.lockBtn} onPress={onLock} activeOpacity={0.7}><Text style={s.lockBtnT}>{t('settings.lock_vault')}</Text></TouchableOpacity>
    </ScrollView>
  );
};

// ── Add/Edit Modal ──
const AddModal = ({ visible, item, onClose, onSave, settings }: any) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<any>({});
  const [showPw, setShowPw] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      let data = {};
      try { data = item?.data ? JSON.parse(item.data) : {}; } catch {}
      setForm({ title: item?.title || '', username: item?.username || '', password: item?.password || '',
        url: item?.url || '', notes: item?.notes || '', category: item?.category || 'login',
        favorite: item?.favorite || 0, data });
      setShowPw(false); setPending([]);
      if (item?.id) SecurityModule.getAttachments(item.id).then(setAttachments);
      else setAttachments([]);
    }
  }, [visible, item]);

  const refreshAtt = async () => { if (item?.id) setAttachments(await SecurityModule.getAttachments(item.id)); };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={s.mdOv} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.mdC}>
          <View style={s.mdH}>
            <Text style={s.mdT}>{item ? t('vault.edit') : t('vault.new_record')}</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.mdX}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <SelectChips label={t('fields.category')} options={getCats(t).filter((c: any) => c.id !== 'all')} value={form.category}
              onChange={(v: string) => setForm({ ...form, category: v, data: {} })} />
            <View style={{ marginTop: 4, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>{t('fields.title')}</Text>
              <TextInput style={{ backgroundColor: C.inputBg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
                fontSize: 14, color: C.navy, borderWidth: 1, borderColor: C.cardBorder, fontWeight: '500' }}
                value={form.title} onChangeText={(v: string) => setForm({ ...form, title: v })} placeholder="..." placeholderTextColor={C.muted} />
            </View>
            <CategoryForm category={form.category} form={form} setForm={setForm} showPw={showPw} setShowPw={setShowPw} pwLen={settings.passwordLength} t={t} />
            <AttachmentSection itemId={item?.id || null} attachments={attachments} onRefresh={refreshAtt} pendingFiles={pending} setPendingFiles={setPending} />
          </ScrollView>
          <TouchableOpacity style={[s.saveBtn, !form.title?.trim() && { opacity: 0.4 }]}
            onPress={() => { if (form.title?.trim()) onSave({ ...form, data: JSON.stringify(form.data || {}) }, pending); }}
            disabled={!form.title?.trim()} activeOpacity={0.7}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{item ? t('vault.update') : t('vault.save')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── Detail Modal ──
const DetailModal = ({ visible, item, onClose, onEdit, onDelete, onFav, clipClear }: any) => {
  const { t } = useTranslation();
  const [showPw, setShowPw] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [breachCount, setBreachCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible && item?.id) SecurityModule.getAttachments(item.id).then(setAttachments);
    setShowPw(false);
    setBreachCount(null);
  }, [visible, item]);

  const checkBreach = async (pw: string) => {
    setChecking(true);
    const count = await HIBPModule.checkPassword(pw);
    setBreachCount(count);
    setChecking(false);
  };

  if (!item) return null;
  let data: any = {};
  try { data = item.data ? JSON.parse(item.data) : {}; } catch {}

  const copy = (txt: string, lbl: string) => {
    Clipboard.setString(txt); setCopied(lbl);
    setTimeout(() => setCopied(null), 2000);
    if (clipClear > 0) setTimeout(() => Clipboard.setString(''), clipClear * 1000);
  };

  const DField = ({ label, value, secret, copyKey }: any) => {
    if (!value) return null;
    const display = secret && !showPw ? '••••••••' : value;
    return (
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{label}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: C.navy, flex: 1 }} numberOfLines={1}>{display}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {secret && <TouchableOpacity onPress={() => setShowPw(!showPw)}><Text style={{ fontSize: 16 }}>{showPw ? '🙈' : '👁️'}</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => copy(value, copyKey)}><Text style={{ fontSize: 14, color: copied === copyKey ? C.green : C.sage }}>{copied === copyKey ? '✓' : '📋'}</Text></TouchableOpacity>
          </View>
        </View>
        
        {secret && (label.includes('Şifre') || label.includes('Password')) && (
          <View style={{ marginTop: 8 }}>
            {checking ? (
              <Text style={{ fontSize: 12, color: C.muted, fontWeight: '600' }}>{t('breach.checking')}</Text>
            ) : breachCount === null ? (
              <TouchableOpacity onPress={() => checkBreach(value)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(114,136,111,0.1)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: C.sage, fontWeight: '700' }}>{t('breach.check')}</Text>
              </TouchableOpacity>
            ) : breachCount > 0 ? (
              <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: C.red, fontWeight: '700' }}>{t('breach.compromised', { count: breachCount })}</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}>
                <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>{t('breach.safe')}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderCatFields = () => {
    switch (item.category) {
      case 'card': return (<>{DField({label:t('fields.cardholder'),value:data.cardholder,copyKey:'ch'})}{DField({label:t('fields.card_number'),value:data.card_number,copyKey:'cn'})}{DField({label:t('fields.expiry'),value:data.expiry,copyKey:'ex'})}{DField({label:t('fields.cvv'),value:data.cvv,secret:true,copyKey:'cv'})}{DField({label:t('fields.pin'),value:data.pin,secret:true,copyKey:'pn'})}</>);
      case 'identity': return (<>{DField({label:t('fields.first_name'),value:`${data.first_name||''} ${data.last_name||''}`.trim(),copyKey:'nm'})}{DField({label:t('fields.national_id'),value:data.national_id,secret:true,copyKey:'tc'})}{DField({label:t('fields.birthday'),value:data.birthday,copyKey:'bd'})}{DField({label:t('fields.phone'),value:data.phone,copyKey:'ph'})}{DField({label:t('fields.email'),value:data.email,copyKey:'em'})}{DField({label:t('fields.company'),value:data.company,copyKey:'co'})}{DField({label:t('fields.address'),value:data.address,copyKey:'ad'})}</>);
      case 'note': return DField({ label: t('fields.note_content'), value: data.content, copyKey: 'nt' });
      case 'wifi': return (<>{DField({label:t('fields.ssid'),value:data.ssid,copyKey:'ss'})}{DField({label:t('fields.wifi_password'),value:data.wifi_password,secret:true,copyKey:'wp'})}{DField({label:t('fields.security'),value:data.security,copyKey:'sc'})}</>);
      default: return (<>{DField({label:t('fields.username'),value:item.username,copyKey:'us'})}{DField({label:t('fields.password'),value:item.password,secret:true,copyKey:'pw'})}{DField({label:t('fields.url'),value:item.url,copyKey:'ur'})}{data.totp_secret ? <TOTPDisplay secret={data.totp_secret} /> : null}</>);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.mdOv}><View style={s.mdC}>
        <View style={s.mdH}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 22 }}>{getCatIcon(item.category)}</Text><Text style={s.mdT}>{item.title}</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Text style={s.mdX}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {renderCatFields()}
          {item.notes ? <View style={{ marginBottom: 14 }}><Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>{t('vault.notes')}</Text><Text style={{ fontSize: 14, color: C.navy, lineHeight: 20 }}>{item.notes}</Text></View> : null}
          {attachments.length > 0 && <AttachmentSection itemId={item.id} attachments={attachments} onRefresh={async () => setAttachments(await SecurityModule.getAttachments(item.id!))} pendingFiles={[]} setPendingFiles={() => {}} />}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: C.sageLight }]} onPress={onFav}><Text style={s.actBtnT}>{item.favorite === 1 ? '⭐' : '☆'}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: C.sageLight, flex: 1 }]} onPress={onEdit}><Text style={[s.actBtnT, { color: C.sage }]}>✏️ {t('vault.edit')}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.actBtn, { backgroundColor: C.redBg }]} onPress={() => Alert.alert(t('vault.delete'), t('vault.delete_confirm'),
            [{ text: t('vault.cancel'), style: 'cancel' }, { text: t('vault.delete'), style: 'destructive', onPress: onDelete }])}><Text style={[s.actBtnT, { color: C.red }]}>🗑️</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  );
};

// ── Styles ──
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loginBox: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { fontSize: 30, fontWeight: '800', color: C.navy, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.muted, marginBottom: 36 },
  bioBtn: { backgroundColor: C.card, borderColor: C.sageMid, borderWidth: 1, paddingVertical: 17, paddingHorizontal: 32, borderRadius: 22, overflow: 'hidden' },
  glow: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(114,136,111,0.1)' },
  bioBtnText: { color: C.navy, fontWeight: '700', fontSize: 15 },
  info: { marginTop: 36, fontSize: 11, fontWeight: '600', opacity: 0.35, color: C.navy, textAlign: 'center' },
  hdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  hdrT: { fontSize: 26, fontWeight: '800', color: C.navy },
  hdrS: { fontSize: 13, color: C.sage, fontWeight: '600', marginTop: 3 },
  lockIc: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.cardBorder },
  srch: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 16, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  srchIn: { flex: 1, fontSize: 14, color: C.navy, paddingVertical: 12, fontWeight: '500' },
  cat: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.card, marginRight: 8, borderWidth: 1, borderColor: C.cardBorder },
  catAct: { backgroundColor: C.sage, borderColor: C.sage },
  catLbl: { fontSize: 12, fontWeight: '600', color: C.navy },
  catLblAct: { color: C.white },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.cardBorder },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  itemT: { fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 },
  itemS: { fontSize: 12, color: C.muted, marginTop: 3 },
  fab: { position: 'absolute', right: 20, bottom: 90, width: 58, height: 58, borderRadius: 20, backgroundColor: C.sage, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  fabT: { fontSize: 28, color: C.white, fontWeight: '300', marginTop: -2 },
  nav: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.divider, paddingBottom: 20, paddingTop: 10 },
  navItem: { flex: 1, alignItems: 'center' },
  navIc: { fontSize: 22, opacity: 0.5 },
  navAct: { opacity: 1 },
  navLbl: { fontSize: 10, color: C.muted, marginTop: 3, fontWeight: '600' },
  navLblAct: { color: C.sage },
  genBox: { backgroundColor: C.card, borderRadius: 20, padding: 24, marginTop: 20, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  genPw: { fontSize: 17, fontWeight: '700', color: C.navy, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.5, lineHeight: 24 },
  genBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  bar: { height: 6, borderRadius: 3, backgroundColor: C.divider, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  optBox: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.cardBorder },
  sliderR: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sliderB: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.sageLight, alignItems: 'center', justifyContent: 'center' },
  sliderBT: { fontSize: 20, color: C.sage, fontWeight: '700' },
  sliderTr: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.divider, overflow: 'hidden' },
  sliderFl: { height: '100%', borderRadius: 3, backgroundColor: C.sage },
  sec: { fontSize: 14, fontWeight: '700', color: C.navy, marginTop: 24, marginBottom: 10 },
  sCard: { backgroundColor: C.card, borderRadius: 18, padding: 18, marginBottom: 8, borderWidth: 1, borderColor: C.cardBorder },
  sLbl: { fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 18 },
  chipR: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  oChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.cardBorder },
  oChipA: { backgroundColor: C.sage, borderColor: C.sage },
  oChipT: { fontSize: 12, fontWeight: '600', color: C.navy },
  oChipTA: { color: C.white },
  lockBtn: { marginTop: 24, backgroundColor: C.redBg, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  lockBtnT: { color: C.red, fontWeight: '700', fontSize: 15 },
  mdOv: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  mdC: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '92%' },
  mdH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  mdT: { fontSize: 20, fontWeight: '800', color: C.navy },
  mdX: { fontSize: 22, color: C.muted, padding: 4 },
  saveBtn: { backgroundColor: C.sage, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 20 },
  actBtn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actBtnT: { fontWeight: '700', fontSize: 14 },
});
