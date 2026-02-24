import RNFS from 'react-native-fs';
import pbkdf2 from 'react-native-quick-crypto';
import { Buffer } from '@craftzdog/react-native-buffer';
import { SecurityModule, VaultItem } from './SecurityModule';

// ═══════════════════════════════════════════════════════════════
// Aegis Vault – Professional Backup & Restore Module
// Supports: Bitwarden, 1Password, LastPass, KeePass, Chrome,
//           Dashlane, Enpass, Firefox, Aegis Authenticator,
//           Generic CSV/JSON, Aegis Vault native format
// ═══════════════════════════════════════════════════════════════

export type ImportSource =
  | 'bitwarden' | '1password' | 'lastpass' | 'keepass'
  | 'chrome' | 'dashlane' | 'enpass' | 'firefox'
  | 'aegis_auth' | 'aegis_vault' | 'generic_csv' | 'generic_json';

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  source: ImportSource;
}

export interface ExportFormat {
  id: 'csv' | 'json' | 'aegis_encrypted';
  label: string;
  icon: string;
  description: string;
}

export const getExportFormats = (t: any): ExportFormat[] => [
  { id: 'csv', label: 'CSV', icon: '📊', description: t('backup.fmt_csv_desc') },
  { id: 'json', label: 'JSON', icon: '📋', description: t('backup.fmt_json_desc') },
  { id: 'aegis_encrypted', label: t('backup.fmt_aegis_lbl'), icon: '🔐', description: t('backup.fmt_aegis_desc') },
];

export const getImportSources = (t: any): { id: ImportSource; label: string; icon: string; extensions: string[] }[] => [
  { id: 'bitwarden', label: 'Bitwarden', icon: '🔷', extensions: ['.json', '.csv'] },
  { id: '1password', label: '1Password', icon: '🔑', extensions: ['.csv', '.1pux', '.1pif'] },
  { id: 'lastpass', label: 'LastPass', icon: '🔴', extensions: ['.csv'] },
  { id: 'keepass', label: 'KeePass', icon: '🟢', extensions: ['.csv', '.xml'] },
  { id: 'chrome', label: t('backup.src_chrome'), icon: '🌐', extensions: ['.csv'] },
  { id: 'dashlane', label: 'Dashlane', icon: '🟦', extensions: ['.csv', '.json'] },
  { id: 'enpass', label: 'Enpass', icon: '🟣', extensions: ['.csv', '.json'] },
  { id: 'firefox', label: 'Firefox', icon: '🦊', extensions: ['.csv'] },
  { id: 'aegis_auth', label: 'Aegis Authenticator', icon: '🛡️', extensions: ['.json'] },
  { id: 'aegis_vault', label: t('backup.src_aegis'), icon: '🏛️', extensions: ['.json', '.aegis'] },
  { id: 'generic_csv', label: t('backup.src_gn_csv'), icon: '📄', extensions: ['.csv'] },
  { id: 'generic_json', label: t('backup.src_gn_json'), icon: '📃', extensions: ['.json'] },
];

// ─── CSV Parser (handles quoted fields, commas in values, newlines) ──────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'; i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim()); current = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim()); current = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }
  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }
  return rows;
}

function escapeCSV(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// ─── Column Mapping Helpers ─────────────────────────────────────────────────
function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function getVal(row: string[], idx: number): string {
  return idx >= 0 && idx < row.length ? (row[idx] || '').trim() : '';
}

// ═══════════════════════════════════════════════════════════════
// IMPORT LOGIC
// ═══════════════════════════════════════════════════════════════

export class BackupModule {

  // ── Main import entry ──────────────────────────────────────
  static async importFromFile(filePath: string, source: ImportSource): Promise<ImportResult> {
    const result: ImportResult = { total: 0, imported: 0, skipped: 0, errors: [], source };
    try {
      const content = await RNFS.readFile(filePath, 'utf8');
      if (!content.trim()) { result.errors.push('Dosya boş.'); return result; }

      const ext = filePath.toLowerCase().split('.').pop() || '';
      let items: Partial<VaultItem>[] = [];

      switch (source) {
        case 'bitwarden':    items = ext === 'csv' ? this.parseBitwardenCSV(content) : this.parseBitwardenJSON(content); break;
        case '1password':    items = this.parse1Password(content, ext); break;
        case 'lastpass':     items = this.parseLastPassCSV(content); break;
        case 'keepass':      items = ext === 'xml' ? this.parseKeePassXML(content) : this.parseKeePassCSV(content); break;
        case 'chrome':       items = this.parseChromeCSV(content); break;
        case 'dashlane':     items = ext === 'csv' ? this.parseDashlaneCSV(content) : this.parseDashlaneJSON(content); break;
        case 'enpass':       items = ext === 'csv' ? this.parseEnpassCSV(content) : this.parseEnpassJSON(content); break;
        case 'firefox':      items = this.parseFirefoxCSV(content); break;
        case 'aegis_auth':   items = this.parseAegisAuthJSON(content); break;
        case 'aegis_vault':  items = this.parseAegisVaultJSON(content); break;
        case 'generic_csv':  items = this.parseGenericCSV(content); break;
        case 'generic_json': items = this.parseGenericJSON(content); break;
      }

      result.total = items.length;

      for (const item of items) {
        try {
          if (!item.title || item.title.trim() === '') {
            item.title = item.url || item.username || 'İsimsiz Kayıt';
          }
          await SecurityModule.addItem(item);
          result.imported++;
        } catch (e: any) {
          result.skipped++;
          result.errors.push(`"${item.title}": ${e?.message || 'Bilinmeyen hata'}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`Dosya okunamadı: ${e?.message || 'Bilinmeyen hata'}`);
    }
    return result;
  }

  // ── Bitwarden CSV ──────────────────────────────────────────
  private static parseBitwardenCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      folder: findCol(h, ['folder']),
      fav: findCol(h, ['favorite']),
      type: findCol(h, ['type']),
      name: findCol(h, ['name']),
      notes: findCol(h, ['notes']),
      fields: findCol(h, ['fields']),
      reprompt: findCol(h, ['reprompt']),
      uri: findCol(h, ['login_uri']),
      user: findCol(h, ['login_username']),
      pass: findCol(h, ['login_password']),
      totp: findCol(h, ['login_totp']),
    };

    return rows.slice(1).map(r => {
      const type = getVal(r, ci.type);
      let category = 'login';
      if (type === 'card' || type === '3') category = 'card';
      else if (type === 'identity' || type === '4') category = 'identity';
      else if (type === 'note' || type === 'securenote' || type === '2') category = 'note';

      const data: any = {};
      if (getVal(r, ci.totp)) data.totp_secret = getVal(r, ci.totp);

      return {
        title: getVal(r, ci.name),
        username: getVal(r, ci.user),
        password: getVal(r, ci.pass),
        url: getVal(r, ci.uri),
        notes: getVal(r, ci.notes),
        category,
        favorite: getVal(r, ci.fav) === '1' ? 1 : 0,
        data: JSON.stringify(data),
      };
    });
  }

  // ── Bitwarden JSON ─────────────────────────────────────────
  private static parseBitwardenJSON(content: string): Partial<VaultItem>[] {
    const json = JSON.parse(content);
    const items = json.items || json.encrypted ? [] : (json.items || []);
    if (json.encrypted) return [];

    return (json.items || []).map((item: any) => {
      let category = 'login';
      if (item.type === 3) category = 'card';
      else if (item.type === 4) category = 'identity';
      else if (item.type === 2) category = 'note';

      const login = item.login || {};
      const data: any = {};
      if (login.totp) data.totp_secret = login.totp;

      if (item.type === 3 && item.card) {
        data.cardholder = item.card.cardholderName || '';
        data.card_number = item.card.number || '';
        data.expiry = `${item.card.expMonth || ''}/${item.card.expYear || ''}`;
        data.cvv = item.card.code || '';
        data.brand = item.card.brand || '';
      }

      if (item.type === 4 && item.identity) {
        const id = item.identity;
        data.first_name = id.firstName || '';
        data.last_name = id.lastName || '';
        data.email = id.email || '';
        data.phone = id.phone || '';
        data.company = id.company || '';
        data.address = [id.address1, id.address2, id.city, id.state, id.postalCode, id.country].filter(Boolean).join(', ');
      }

      if (item.type === 2) {
        data.content = item.notes || '';
      }

      return {
        title: item.name || '',
        username: login.username || '',
        password: login.password || '',
        url: login.uris?.[0]?.uri || '',
        notes: item.type !== 2 ? (item.notes || '') : '',
        category,
        favorite: item.favorite ? 1 : 0,
        data: JSON.stringify(data),
      };
    });
  }

  // ── 1Password ──────────────────────────────────────────────
  private static parse1Password(content: string, ext: string): Partial<VaultItem>[] {
    if (ext === 'csv') return this.parse1PasswordCSV(content);
    if (ext === '1pux' || ext === '1pif') {
      // 1pux is a zip; 1pif is line-delimited JSON — both are JSON-based
      try { return this.parse1PasswordJSON(content); }
      catch { return this.parseGenericJSON(content); }
    }
    return [];
  }

  private static parse1PasswordCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      title: findCol(h, ['title', 'name']),
      url: findCol(h, ['url', 'website', 'urls']),
      user: findCol(h, ['username', 'login']),
      pass: findCol(h, ['password']),
      notes: findCol(h, ['notes', 'notesplain']),
      type: findCol(h, ['type', 'category']),
    };
    return rows.slice(1).map(r => ({
      title: getVal(r, ci.title),
      username: getVal(r, ci.user),
      password: getVal(r, ci.pass),
      url: getVal(r, ci.url),
      notes: getVal(r, ci.notes),
      category: 'login',
      favorite: 0,
      data: '{}',
    }));
  }

  private static parse1PasswordJSON(content: string): Partial<VaultItem>[] {
    // Handle both raw 1pif and exported JSON
    const lines = content.split('\n').filter(l => l.trim().startsWith('{'));
    return lines.map(line => {
      try {
        const item = JSON.parse(line);
        const fields = item.secureContents || item.details || {};
        return {
          title: item.title || item.name || '',
          username: fields.username || fields.fields?.find?.((f: any) => f.designation === 'username')?.value || '',
          password: fields.password || fields.fields?.find?.((f: any) => f.designation === 'password')?.value || '',
          url: item.location || fields.URLs?.[0]?.url || '',
          notes: fields.notesPlain || item.notes || '',
          category: 'login',
          favorite: item.faveIndex ? 1 : 0,
          data: '{}',
        };
      } catch { return null; }
    }).filter(Boolean) as Partial<VaultItem>[];
  }

  // ── LastPass CSV ───────────────────────────────────────────
  private static parseLastPassCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      url: findCol(h, ['url']),
      user: findCol(h, ['username']),
      pass: findCol(h, ['password']),
      totp: findCol(h, ['totp']),
      extra: findCol(h, ['extra', 'notes']),
      name: findCol(h, ['name']),
      group: findCol(h, ['grouping', 'folder']),
      fav: findCol(h, ['fav']),
    };
    return rows.slice(1).map(r => {
      const data: any = {};
      if (getVal(r, ci.totp)) data.totp_secret = getVal(r, ci.totp);
      const url = getVal(r, ci.url);
      return {
        title: getVal(r, ci.name) || (url !== 'http://sn' ? url : 'Güvenli Not'),
        username: getVal(r, ci.user),
        password: getVal(r, ci.pass),
        url: url === 'http://sn' ? '' : url,
        notes: getVal(r, ci.extra),
        category: url === 'http://sn' ? 'note' : 'login',
        favorite: getVal(r, ci.fav) === '1' ? 1 : 0,
        data: JSON.stringify(data),
      };
    });
  }

  // ── KeePass CSV ────────────────────────────────────────────
  private static parseKeePassCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      title: findCol(h, ['title', 'account', 'group']),
      user: findCol(h, ['username', 'user name', 'login name']),
      pass: findCol(h, ['password']),
      url: findCol(h, ['url', 'web site']),
      notes: findCol(h, ['notes', 'comments']),
    };
    return rows.slice(1).map(r => ({
      title: getVal(r, ci.title),
      username: getVal(r, ci.user),
      password: getVal(r, ci.pass),
      url: getVal(r, ci.url),
      notes: getVal(r, ci.notes),
      category: 'login',
      favorite: 0,
      data: '{}',
    }));
  }

  // ── KeePass XML ────────────────────────────────────────────
  private static parseKeePassXML(content: string): Partial<VaultItem>[] {
    // Simple XML parser for KeePass export (KDBX XML export format)
    const items: Partial<VaultItem>[] = [];
    const entryRegex = /<Entry>([\s\S]*?)<\/Entry>/gi;
    let match;
    while ((match = entryRegex.exec(content)) !== null) {
      const entry = match[1];
      const getString = (key: string): string => {
        const regex = new RegExp(`<String>\\s*<Key>${key}</Key>\\s*<Value[^>]*>([^<]*)</Value>\\s*</String>`, 'i');
        const m = entry.match(regex);
        return m ? m[1] : '';
      };
      items.push({
        title: getString('Title'),
        username: getString('UserName'),
        password: getString('Password'),
        url: getString('URL'),
        notes: getString('Notes'),
        category: 'login',
        favorite: 0,
        data: '{}',
      });
    }
    return items;
  }

  // ── Chrome / Edge CSV ──────────────────────────────────────
  private static parseChromeCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      name: findCol(h, ['name', 'origin', 'title']),
      url: findCol(h, ['url', 'origin_url']),
      user: findCol(h, ['username', 'login']),
      pass: findCol(h, ['password']),
      note: findCol(h, ['note', 'notes']),
    };
    return rows.slice(1).map(r => {
      const url = getVal(r, ci.url);
      let title = getVal(r, ci.name);
      if (!title && url) {
        try { title = new URL(url).hostname; } catch { title = url; }
      }
      return {
        title, username: getVal(r, ci.user), password: getVal(r, ci.pass),
        url, notes: getVal(r, ci.note), category: 'login', favorite: 0, data: '{}',
      };
    });
  }

  // ── Dashlane CSV ───────────────────────────────────────────
  private static parseDashlaneCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      title: findCol(h, ['title', 'name']),
      url: findCol(h, ['url', 'domain', 'website']),
      user: findCol(h, ['username', 'login', 'email']),
      pass: findCol(h, ['password', 'password2']),
      notes: findCol(h, ['note', 'notes']),
      cat: findCol(h, ['category']),
    };
    return rows.slice(1).map(r => ({
      title: getVal(r, ci.title) || getVal(r, ci.url),
      username: getVal(r, ci.user), password: getVal(r, ci.pass),
      url: getVal(r, ci.url), notes: getVal(r, ci.notes),
      category: 'login', favorite: 0, data: '{}',
    }));
  }

  // ── Dashlane JSON ──────────────────────────────────────────
  private static parseDashlaneJSON(content: string): Partial<VaultItem>[] {
    const json = JSON.parse(content);
    const creds = json.AUTHENTIFIANT || json.credentials || [];
    return creds.map((item: any) => ({
      title: item.title || item.domain || '',
      username: item.login || item.email || item.secondaryLogin || '',
      password: item.password || '',
      url: item.domain || item.url || '',
      notes: item.note || '',
      category: 'login', favorite: item.favorite ? 1 : 0, data: '{}',
    }));
  }

  // ── Enpass CSV ─────────────────────────────────────────────
  private static parseEnpassCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      title: findCol(h, ['title', 'name']),
      user: findCol(h, ['username', 'login', 'email']),
      pass: findCol(h, ['password']),
      url: findCol(h, ['url', 'website']),
      notes: findCol(h, ['notes', 'note']),
      cat: findCol(h, ['category', 'type']),
    };
    return rows.slice(1).map(r => ({
      title: getVal(r, ci.title), username: getVal(r, ci.user),
      password: getVal(r, ci.pass), url: getVal(r, ci.url),
      notes: getVal(r, ci.notes), category: 'login', favorite: 0, data: '{}',
    }));
  }

  // ── Enpass JSON ────────────────────────────────────────────
  private static parseEnpassJSON(content: string): Partial<VaultItem>[] {
    const json = JSON.parse(content);
    const items = json.items || json.folders?.flatMap?.((f: any) => f.items || []) || [];
    return items.map((item: any) => {
      const fields = item.fields || [];
      const getField = (label: string) => fields.find((f: any) =>
        f.label?.toLowerCase().includes(label) || f.type?.toLowerCase().includes(label)
      )?.value || '';
      return {
        title: item.title || '', username: getField('username') || getField('email'),
        password: getField('password'), url: getField('url') || getField('website'),
        notes: item.note || '', category: 'login', favorite: item.favorite ? 1 : 0, data: '{}',
      };
    });
  }

  // ── Firefox CSV ────────────────────────────────────────────
  private static parseFirefoxCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      url: findCol(h, ['url', 'hostname']),
      user: findCol(h, ['username']),
      pass: findCol(h, ['password']),
      realm: findCol(h, ['httprealm']),
      form: findCol(h, ['formactionorigin']),
    };
    return rows.slice(1).map(r => {
      const url = getVal(r, ci.url);
      let title = '';
      try { title = new URL(url).hostname; } catch { title = url; }
      return {
        title, username: getVal(r, ci.user), password: getVal(r, ci.pass),
        url, notes: '', category: 'login', favorite: 0, data: '{}',
      };
    });
  }

  // ── Aegis Authenticator JSON ───────────────────────────────
  private static parseAegisAuthJSON(content: string): Partial<VaultItem>[] {
    const json = JSON.parse(content);
    // Aegis Authenticator exports under db.entries
    const entries = json.db?.entries || json.entries || [];
    return entries.map((entry: any) => {
      const data: any = { totp_secret: entry.info?.secret || '' };
      return {
        title: entry.issuer || entry.name || '',
        username: entry.name || '',
        password: '',
        url: '',
        notes: `OTP Type: ${entry.type || 'TOTP'}\nAlgorithm: ${entry.info?.algo || 'SHA1'}\nDigits: ${entry.info?.digits || 6}\nPeriod: ${entry.info?.period || 30}`,
        category: 'login',
        favorite: entry.favorite ? 1 : 0,
        data: JSON.stringify(data),
      };
    });
  }

  // ── Aegis Vault Native JSON ────────────────────────────────
  private static parseAegisVaultJSON(content: string): Partial<VaultItem>[] {
    const json = JSON.parse(content);

    // Check if encrypted
    if (json.encrypted && json.data) {
      // Encrypted Aegis Vault backup - cannot import without password
      // Will be handled by importEncryptedAegis method
      return [];
    }

    const items = json.items || json.vault?.items || [];
    return items.map((item: any) => ({
      title: item.title || '',
      username: item.username || '',
      password: item.password || '',
      url: item.url || '',
      notes: item.notes || '',
      category: item.category || 'login',
      favorite: item.favorite || 0,
      data: item.data || '{}',
    }));
  }

  // ── Generic CSV ────────────────────────────────────────────
  private static parseGenericCSV(content: string): Partial<VaultItem>[] {
    const rows = parseCSV(content);
    if (rows.length < 2) return [];
    const h = rows[0];
    const ci = {
      title: findCol(h, ['title', 'name', 'site', 'service', 'account', 'entry', 'label']),
      user: findCol(h, ['username', 'user', 'login', 'email', 'e-mail', 'mail', 'account']),
      pass: findCol(h, ['password', 'pass', 'secret', 'pwd']),
      url: findCol(h, ['url', 'website', 'site', 'domain', 'uri', 'web', 'link', 'address']),
      notes: findCol(h, ['notes', 'note', 'comments', 'comment', 'description', 'extra', 'memo']),
      cat: findCol(h, ['category', 'type', 'group', 'folder', 'tag']),
    };
    // If no recognizable columns, treat first cols as title,user,pass,url,notes
    if (ci.title < 0 && ci.user < 0 && ci.pass < 0) {
      ci.title = 0;
      ci.user = h.length > 1 ? 1 : -1;
      ci.pass = h.length > 2 ? 2 : -1;
      ci.url = h.length > 3 ? 3 : -1;
      ci.notes = h.length > 4 ? 4 : -1;
    }
    return rows.slice(1).map(r => ({
      title: getVal(r, ci.title) || getVal(r, ci.url) || 'İçe Aktarılan',
      username: getVal(r, ci.user), password: getVal(r, ci.pass),
      url: getVal(r, ci.url), notes: getVal(r, ci.notes),
      category: this.mapCategory(getVal(r, ci.cat)),
      favorite: 0, data: '{}',
    }));
  }

  // ── Generic JSON ───────────────────────────────────────────
  private static parseGenericJSON(content: string): Partial<VaultItem>[] {
    const json = JSON.parse(content);
    const items = Array.isArray(json) ? json : (json.items || json.entries || json.passwords || json.data || json.logins || []);
    return items.map((item: any) => ({
      title: item.title || item.name || item.site || item.service || item.label || '',
      username: item.username || item.user || item.login || item.email || '',
      password: item.password || item.pass || item.secret || '',
      url: item.url || item.website || item.domain || item.uri || '',
      notes: item.notes || item.note || item.description || item.comments || '',
      category: this.mapCategory(item.category || item.type || item.group || ''),
      favorite: item.favorite || item.fav ? 1 : 0,
      data: item.data || '{}',
    }));
  }

  private static mapCategory(cat: string): string {
    if (!cat) return 'login';
    const l = cat.toLowerCase();
    if (l.includes('card') || l.includes('payment') || l.includes('credit')) return 'card';
    if (l.includes('identity') || l.includes('id') || l.includes('personal')) return 'identity';
    if (l.includes('note') || l.includes('secure') || l.includes('memo')) return 'note';
    if (l.includes('wifi') || l.includes('wireless') || l.includes('network')) return 'wifi';
    return 'login';
  }

  // ═══════════════════════════════════════════════════════════════
  // IMPORT ENCRYPTED AEGIS (AES-256-GCM)
  // ═══════════════════════════════════════════════════════════════
  static async importEncryptedAegis(filePath: string, password: string): Promise<ImportResult> {
    const result: ImportResult = { total: 0, imported: 0, skipped: 0, errors: [], source: 'aegis_vault' };
    try {
      const content = await RNFS.readFile(filePath, 'utf8');
      const json = JSON.parse(content);

      if (!json.encrypted || !json.data || !json.salt || !json.iv) {
        result.errors.push('Geçersiz şifreli Aegis Vault dosyası.');
        return result;
      }

      let plaintext: string;

      if (json.algorithm === 'AES-256-GCM' && json.authTag) {
        // New AES-256-GCM format
        plaintext = await SecurityModule.decryptAES256GCM(
          json.data, password, json.salt, json.iv, json.authTag
        );
      } else {
        // Legacy XOR format fallback (for old backups)
        const keyBuf = await new Promise<Buffer>((resolve, reject) => {
          pbkdf2.pbkdf2(password, json.salt, json.iterations || 310000, 32, 'sha256',
            (e: any, k: any) => e ? reject(e) : resolve(k));
        });
        const encData = Buffer.from(json.data, 'base64');
        const decrypted: number[] = [];
        for (let i = 0; i < encData.length; i++) {
          decrypted.push(encData[i] ^ keyBuf[i % keyBuf.length]);
        }
        plaintext = Buffer.from(decrypted).toString('utf8');
        for (let i = 0; i < keyBuf.length; i++) (keyBuf as any)[i] = 0;
      }

      const items = JSON.parse(plaintext);
      result.total = items.length;
      for (const item of items) {
        try {
          await SecurityModule.addItem(item);
          result.imported++;
        } catch (e: any) {
          result.skipped++;
          result.errors.push(`"${item.title}": ${e?.message || 'Error'}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`Şifre çözme hatası: ${e?.message || 'Geçersiz şifre veya bozuk dosya'}`);
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // EXPORT LOGIC
  // ═══════════════════════════════════════════════════════════════

  static async exportToCSV(): Promise<string> {
    const items = await SecurityModule.getItems();
    const header = 'title,username,password,url,notes,category,favorite,data';
    const rows = items.map(item =>
      [item.title, item.username, item.password, item.url, item.notes, item.category, item.favorite, item.data]
        .map(v => escapeCSV(String(v ?? '')))
        .join(',')
    );
    const csv = [header, ...rows].join('\n');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = `${RNFS.DownloadDirectoryPath || RNFS.DocumentDirectoryPath}/aegis_vault_export_${ts}.csv`;
    await RNFS.writeFile(path, csv, 'utf8');
    return path;
  }

  static async exportToJSON(): Promise<string> {
    const items = await SecurityModule.getItems();
    const exportData = {
      version: '1.0.0',
      app: 'Aegis Vault Android',
      exported_at: new Date().toISOString(),
      count: items.length,
      items: items.map(({ id, ...rest }) => rest),
    };
    const json = JSON.stringify(exportData, null, 2);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = `${RNFS.DownloadDirectoryPath || RNFS.DocumentDirectoryPath}/aegis_vault_export_${ts}.json`;
    await RNFS.writeFile(path, json, 'utf8');
    return path;
  }

  static async exportEncrypted(password: string): Promise<string> {
    const items = await SecurityModule.getItems();
    const plainItems = items.map(({ id, ...rest }) => rest);
    const plaintext = JSON.stringify(plainItems);

    // AES-256-GCM encryption (proper authenticated encryption)
    const { salt, iv, authTag, ciphertext } = await SecurityModule.encryptAES256GCM(plaintext, password);

    const exportData = {
      version: '2.0.0',
      app: 'Aegis Vault Android',
      encrypted: true,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: 310000,
      salt,
      iv,
      authTag,
      exported_at: new Date().toISOString(),
      count: items.length,
      data: ciphertext,
    };

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const path = `${RNFS.DownloadDirectoryPath || RNFS.DocumentDirectoryPath}/aegis_vault_encrypted_${ts}.aegis`;
    await RNFS.writeFile(path, JSON.stringify(exportData, null, 2), 'utf8');

    return path;
  }

  // ── Auto-detect source from file ───────────────────────────
  static detectSource(filename: string, content: string): ImportSource {
    const lower = filename.toLowerCase();
    const ext = lower.split('.').pop() || '';

    // Check content signatures
    try {
      if (ext === 'json') {
        const json = JSON.parse(content.substring(0, 5000));
        if (json.db?.entries && (json.header || json.version)) return 'aegis_auth';
        if (json.app === 'Aegis Vault Android' || json.encrypted) return 'aegis_vault';
        if (json.items && json.folders !== undefined) return 'bitwarden';
        if (json.AUTHENTIFIANT || json.credentials) return 'dashlane';
        if (json.items?.[0]?.fields) return 'enpass';
        return 'generic_json';
      }
    } catch {}

    if (ext === 'aegis') return 'aegis_vault';
    if (ext === '1pux' || ext === '1pif') return '1password';
    if (ext === 'xml') return 'keepass';

    // CSV header detection
    if (ext === 'csv') {
      const firstLine = content.split('\n')[0].toLowerCase();
      if (firstLine.includes('login_uri') || firstLine.includes('login_username')) return 'bitwarden';
      if (firstLine.includes('grouping') && firstLine.includes('fav')) return 'lastpass';
      if (firstLine.includes('origin_url') || (firstLine.includes('name') && firstLine.includes('url') && firstLine.includes('password') && !firstLine.includes('notes'))) return 'chrome';
      if (firstLine.includes('httprealm') || firstLine.includes('formactionorigin')) return 'firefox';
      if (firstLine.includes('cardholder') || firstLine.includes('login_name')) return 'dashlane';
      // KeePass: "Account","Login Name","Password","Web Site","Comments"
      if (firstLine.includes('account') && firstLine.includes('web site')) return 'keepass';
      return 'generic_csv';
    }

    return 'generic_csv';
  }
}
