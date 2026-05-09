import RNFS from 'react-native-fs';
import { BackupModule, getExportFormats, getImportSources } from '../src/BackupModule';
import { SecurityModule } from '../src/SecurityModule';

jest.mock('react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
  DocumentDirectoryPath: '/mock/documents',
  DownloadDirectoryPath: '/mock/downloads',
  ExternalDirectoryPath: '/mock/external',
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    getItems: jest.fn(),
    getSharedVaultSpaces: jest.fn(),
    saveSharedVaultSpace: jest.fn(),
    addItem: jest.fn(),
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
    encryptAES256GCM: jest.fn(),
    decryptAES256GCM: jest.fn(),
  },
}));

describe('BackupModule current API', () => {
  const mockItems = [
    {
      id: 1,
      title: 'GitHub',
      username: 'john',
      password: 'secret-1',
      url: 'https://github.com',
      notes: 'dev',
      category: 'login',
      favorite: 1,
      data: '{}',
    },
    {
      id: 2,
      title: 'Wifi',
      username: '',
      password: '',
      url: '',
      notes: '',
      category: 'wifi',
      favorite: 0,
      data: '{"ssid":"Office","wifi_password":"wifi-pass"}',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (SecurityModule.getItems as jest.Mock).mockResolvedValue(mockItems);
    (SecurityModule.getSharedVaultSpaces as jest.Mock).mockResolvedValue([
      {
        id: 'space-1',
        name: 'Family',
        kind: 'family',
        description: '',
        defaultRole: 'viewer',
        allowExport: true,
        requireReview: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        members: [],
      },
    ]);
    (SecurityModule.saveSharedVaultSpace as jest.Mock).mockResolvedValue(true);
    (SecurityModule.addItem as jest.Mock).mockResolvedValue(1);
    (SecurityModule.encryptAES256GCM as jest.Mock).mockResolvedValue({
      salt: 'salt-b64',
      iv: 'iv-b64',
      authTag: 'tag-b64',
      ciphertext: 'cipher-b64',
      kdf: 'Argon2id',
      memory: 32768,
      iterations: 4,
      parallelism: 2,
      hashLength: 32,
    });
    (SecurityModule.decryptAES256GCM as jest.Mock).mockResolvedValue(
      JSON.stringify([
        {
          title: 'GitHub',
          username: 'john',
          password: 'secret-1',
          url: 'https://github.com',
          notes: 'dev',
          category: 'login',
          favorite: 1,
          data: '{}',
        },
      ]),
    );
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        encrypted: true,
        algorithm: 'AES-256-GCM',
        kdf: 'Argon2id',
        memory: 32768,
        iterations: 4,
        parallelism: 2,
        hashLength: 32,
        salt: 'salt-b64',
        iv: 'iv-b64',
        authTag: 'tag-b64',
        data: 'cipher-b64',
      }),
    );
  });

  test('exportToCSV writes CSV content', async () => {
    const path = await BackupModule.exportToCSV();

    expect(path).toContain('aegis_vault_export_');
    expect(path.startsWith('/mock/documents/')).toBe(true);
    expect(RNFS.writeFile).toHaveBeenCalled();
    const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
    const [, content] = writeCalls[writeCalls.length - 1];
    expect(content).toContain(
      'title,username,password,url,notes,category,favorite,data',
    );
    expect(content).toContain(
      'GitHub,john,secret-1,https://github.com,dev,login,1,{}',
    );
  });

  test('exportToJSON writes structured export data', async () => {
    const path = await BackupModule.exportToJSON();

    expect(path.startsWith('/mock/documents/')).toBe(true);
    const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
    const [, content] = writeCalls[writeCalls.length - 1];
    const parsed = JSON.parse(content);
    expect(parsed.app).toBe('Aegis Vault Android');
    expect(parsed.count).toBe(2);
    expect(parsed.sharedSpaces).toHaveLength(1);
    expect(parsed.canonical.schemaVersion).toBe('5.0.0');
    expect(parsed.canonical.items[0].category).toBe('login');
    expect(parsed.items[0].title).toBe('GitHub');
  });

  test('exportCanonicalJSON writes desktop v5 canonical export data', async () => {
    const path = await BackupModule.exportCanonicalJSON();

    expect(path).toContain('aegis_vault_canonical_v5_');
    expect(path.startsWith('/mock/documents/')).toBe(true);
    const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
    const [, content] = writeCalls[writeCalls.length - 1];
    const parsed = JSON.parse(content);
    expect(parsed.kind).toBe('aegis-vault-canonical');
    expect(parsed.schemaVersion).toBe('5.0.0');
    expect(parsed.sharedSpaces).toHaveLength(1);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].secret.password).toBe('secret-1');
  });

  test('exportEncrypted persists Argon2id metadata', async () => {
    const path = await BackupModule.exportEncrypted('backup-password');

    expect(path.startsWith('/mock/documents/')).toBe(true);
    expect(SecurityModule.encryptAES256GCM).toHaveBeenCalledWith(
      expect.any(String),
      'backup-password',
    );
    const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
    const [, content] = writeCalls[writeCalls.length - 1];
    const parsed = JSON.parse(content);
    expect(parsed.kdf).toBe('Argon2id');
    expect(parsed.algorithm).toBe('AES-256-GCM');
    expect(parsed.data).toBe('cipher-b64');
    const decryptedPayload = JSON.parse(
      (SecurityModule.encryptAES256GCM as jest.Mock).mock.calls[0][0],
    );
    expect(decryptedPayload.sharedSpaces).toHaveLength(1);
    expect(decryptedPayload.items).toHaveLength(2);
    expect(decryptedPayload.canonical.schemaVersion).toBe('5.0.0');
    expect(decryptedPayload.canonical.items).toHaveLength(2);
  });

  test('importEncryptedAegis decrypts and imports items', async () => {
    const result = await BackupModule.importEncryptedAegis(
      '/mock/documents/test.aegis',
      'backup-password',
    );

    expect(SecurityModule.decryptAES256GCM).toHaveBeenCalledWith(
      'cipher-b64',
      'backup-password',
      'salt-b64',
      'iv-b64',
      'tag-b64',
      expect.objectContaining({ kdf: 'Argon2id', iterations: 4 }),
    );
    expect(SecurityModule.addItem).toHaveBeenCalledTimes(1);
    expect(SecurityModule.saveSharedVaultSpace).not.toHaveBeenCalled();
    expect(result.imported).toBe(1);
  });

  test('importEncryptedAegis restores shared spaces from encrypted bundle', async () => {
    (SecurityModule.decryptAES256GCM as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        items: [
          {
            title: 'GitHub',
            username: 'john',
            password: 'secret-1',
            url: 'https://github.com',
            notes: 'dev',
            category: 'login',
            favorite: 1,
            data: '{}',
          },
        ],
        sharedSpaces: [
          {
            id: 'space-1',
            name: 'Family',
            kind: 'family',
            description: '',
            defaultRole: 'viewer',
            allowExport: true,
            requireReview: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            members: [],
          },
        ],
      }),
    );

    await BackupModule.importEncryptedAegis(
      '/mock/documents/test.aegis',
      'backup-password',
    );

    expect(SecurityModule.addItem).toHaveBeenCalledTimes(1);
    expect(SecurityModule.saveSharedVaultSpace).toHaveBeenCalledTimes(1);
  });

  test('importEncryptedAegis rejects insecure or legacy encrypted formats without decrypting', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        encrypted: true,
        algorithm: 'AES-256-CBC',
        salt: 'salt-b64',
        iv: 'iv-b64',
        data: 'cipher-b64',
      }),
    );

    const result = await BackupModule.importEncryptedAegis(
      '/mock/documents/test.aegis',
      'backup-password',
    );

    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain('guvensiz');
    expect(SecurityModule.decryptAES256GCM).not.toHaveBeenCalled();
  });

  test('importFromFile imports generic CSV rows', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'title,username,password,url\nGitHub,john,secret,https://github.com\n',
    );

    const result = await BackupModule.importFromFile(
      '/mock/documents/import.csv',
      'generic_csv',
    );

    expect(result.total).toBe(1);
    expect(result.imported).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'GitHub',
        username: 'john',
        password: 'secret',
      }),
    );
  });

  test('importFromFile logs failure when file content cannot be read', async () => {
    (RNFS.readFile as jest.Mock).mockRejectedValueOnce(new Error('disk error'));

    const result = await BackupModule.importFromFile(
      '/mock/documents/import.csv',
      'generic_csv',
    );

    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain('disk error');
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'backup_import',
      'failed',
      expect.objectContaining({ reason: 'disk error' }),
    );
  });

  test('detectSource falls back to generic_json for unknown JSON structures', () => {
    expect(
      BackupModule.detectSource(
        'unknown.json',
        '{"accounts":[{"label":"example"}]}',
      ),
    ).toBe('generic_json');
  });

  test('detectSource recognizes Aegis and Chrome exports', () => {
    expect(
      BackupModule.detectSource(
        'vault.aegis',
        '{"encrypted":true,"app":"Aegis Vault Android"}',
      ),
    ).toBe('aegis_vault');
    expect(
      BackupModule.detectSource(
        'chrome.csv',
        'name,url,username,password\nExample,https://example.com,u,p',
      ),
    ).toBe('chrome');
  });

  test('getExportFormats returns translated built-in formats', () => {
    const formats = getExportFormats((key: string) => `tr:${key}`);

    expect(formats).toEqual([
      expect.objectContaining({
        id: 'csv',
        label: 'CSV',
        description: 'tr:backup.fmt_csv_desc',
      }),
      expect.objectContaining({
        id: 'json',
        label: 'JSON',
        description: 'tr:backup.fmt_json_desc',
      }),
      expect.objectContaining({
        id: 'canonical_json',
        label: 'tr:backup.fmt_canonical_lbl',
        icon: 'V5',
        description: 'tr:backup.fmt_canonical_desc',
      }),
      expect.objectContaining({
        id: 'aegis_encrypted',
        label: 'tr:backup.fmt_aegis_lbl',
        description: 'tr:backup.fmt_aegis_desc',
      }),
    ]);
  });

  test('getImportSources returns translated platform import definitions', () => {
    const sources = getImportSources((key: string) => `tr:${key}`);

    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'bitwarden', extensions: ['.json', '.csv'] }),
        expect.objectContaining({
          id: 'chrome',
          label: 'tr:backup.src_chrome',
          extensions: ['.csv'],
        }),
        expect.objectContaining({
          id: 'aegis_vault',
          label: 'tr:backup.src_aegis',
          extensions: ['.json', '.aegis'],
        }),
        expect.objectContaining({
          id: 'generic_json',
          label: 'tr:backup.src_gn_json',
        }),
      ]),
    );
  });

  test('importFromFile imports Bitwarden JSON logins and cards', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        encrypted: false,
        items: [
          {
            type: 1,
            name: 'GitHub',
            favorite: true,
            notes: 'dev',
            login: {
              username: 'john',
              password: 'secret',
              uris: [{ uri: 'https://github.com' }],
              totp: 'totp-secret',
            },
          },
          {
            type: 3,
            name: 'Visa',
            card: {
              cardholderName: 'John Doe',
              number: '4111111111111111',
              expMonth: '12',
              expYear: '2030',
              code: '123',
              brand: 'visa',
            },
          },
        ],
      }),
    );

    const result = await BackupModule.importFromFile(
      '/mock/documents/bitwarden.json',
      'bitwarden',
    );

    expect(result.total).toBe(2);
    expect(result.imported).toBe(2);
    expect(SecurityModule.addItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'GitHub',
        username: 'john',
        password: 'secret',
        favorite: 1,
      }),
    );
    expect(SecurityModule.addItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'Visa',
        category: 'card',
      }),
    );
  });

  test('importFromFile imports generic JSON shared spaces and fills missing title', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        items: [
          {
            username: 'john',
            password: 'secret',
            url: 'https://example.com',
            notes: 'note',
            category: 'login',
          },
        ],
        sharedSpaces: [{ id: 'space-2', name: 'Ops' }],
      }),
    );

    const result = await BackupModule.importFromFile(
      '/mock/documents/import.json',
      'generic_json',
    );

    expect(result.total).toBe(1);
    expect(result.imported).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'https://example.com',
        username: 'john',
      }),
    );
    expect(SecurityModule.saveSharedVaultSpace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'space-2', name: 'Ops' }),
    );
  });

  test('importFromFile records skipped entries when addItem fails for one row', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'title,username,password,url\nFirst,user-1,pass-1,https://one\nSecond,user-2,pass-2,https://two\n',
    );
    (SecurityModule.addItem as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('duplicate item'));

    const result = await BackupModule.importFromFile(
      '/mock/documents/import.csv',
      'generic_csv',
    );

    expect(result.total).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain('duplicate item');
  });

  test('detectSource recognizes provider specific JSON and CSV signatures', () => {
    expect(
      BackupModule.detectSource(
        'aegis-auth.json',
        JSON.stringify({
          header: { version: 1 },
          db: { entries: [{ name: 'otp' }] },
        }),
      ),
    ).toBe('aegis_auth');

    expect(
      BackupModule.detectSource(
        'vault.json',
        JSON.stringify({
          items: [],
          folders: [],
        }),
      ),
    ).toBe('bitwarden');

    expect(
      BackupModule.detectSource(
        'dashlane.json',
        JSON.stringify({
          credentials: [],
        }),
      ),
    ).toBe('dashlane');

    expect(
      BackupModule.detectSource(
        'enpass.json',
        JSON.stringify({
          items: [{ fields: [] }],
        }),
      ),
    ).toBe('enpass');

    expect(
      BackupModule.detectSource(
        'lastpass.csv',
        'url,username,password,totp,extra,name,grouping,fav\n',
      ),
    ).toBe('lastpass');

    expect(
      BackupModule.detectSource(
        'firefox.csv',
        'hostname,username,password,httprealm,formactionorigin\n',
      ),
    ).toBe('firefox');

    expect(BackupModule.detectSource('vault.xml', '<xml />')).toBe('keepass');
    expect(BackupModule.detectSource('export.1pux', '[]')).toBe('1password');
  });

  test('importFromFile imports 1Password line-delimited json exports', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      [
        JSON.stringify({
          title: 'Example',
          location: 'https://example.com',
          secureContents: {
            username: 'alice',
            password: 'secret',
            notesPlain: 'from 1password',
          },
          faveIndex: 1,
        }),
      ].join('\n'),
    );

    const result = await BackupModule.importFromFile(
      '/mock/documents/export.1pif',
      '1password',
    );

    expect(result.total).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Example',
        username: 'alice',
        password: 'secret',
        favorite: 1,
      }),
    );
  });

  test('importFromFile imports LastPass secure notes as note category', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'url,username,password,totp,extra,name,grouping,fav\nhttp://sn,,,,"secure note",My Note,Personal,1\n',
    );

    const result = await BackupModule.importFromFile(
      '/mock/documents/lastpass.csv',
      'lastpass',
    );

    expect(result.total).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My Note',
        url: '',
        category: 'note',
        favorite: 1,
      }),
    );
  });

  test('importFromFile imports KeePass xml entries', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(`
      <Root>
        <Entry>
          <String><Key>Title</Key><Value>Server</Value></String>
          <String><Key>UserName</Key><Value>root</Value></String>
          <String><Key>Password</Key><Value>pw</Value></String>
          <String><Key>URL</Key><Value>https://server</Value></String>
          <String><Key>Notes</Key><Value>prod</Value></String>
        </Entry>
      </Root>
    `);

    const result = await BackupModule.importFromFile(
      '/mock/documents/keepass.xml',
      'keepass',
    );

    expect(result.total).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Server',
        username: 'root',
        password: 'pw',
      }),
    );
  });

  test('importFromFile imports Chrome csv and derives title from url when missing', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'name,url,username,password,note\n,https://portal.example.com,user1,secret,work\n',
    );

    const result = await BackupModule.importFromFile(
      '/mock/documents/chrome.csv',
      'chrome',
    );

    expect(result.total).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'portal.example.com',
        username: 'user1',
        notes: 'work',
      }),
    );
  });

  test('importFromFile imports Dashlane and Enpass json payloads', async () => {
    (RNFS.readFile as jest.Mock)
      .mockResolvedValueOnce(
        JSON.stringify({
          credentials: [
            {
              title: 'Dashlane Item',
              login: 'dash-user',
              password: 'dash-pass',
              url: 'https://dash.example.com',
              favorite: true,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          items: [
            {
              title: 'Enpass Item',
              note: 'enpass-note',
              favorite: true,
              fields: [
                { label: 'username', value: 'en-user' },
                { label: 'password', value: 'en-pass' },
                { label: 'website', value: 'https://enpass.example.com' },
              ],
            },
          ],
        }),
      );

    const dashlane = await BackupModule.importFromFile(
      '/mock/documents/dashlane.json',
      'dashlane',
    );
    const enpass = await BackupModule.importFromFile(
      '/mock/documents/enpass.json',
      'enpass',
    );

    expect(dashlane.total).toBe(1);
    expect(enpass.total).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'Dashlane Item',
        username: 'dash-user',
        favorite: 1,
      }),
    );
    expect(SecurityModule.addItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'Enpass Item',
        username: 'en-user',
        password: 'en-pass',
        notes: 'enpass-note',
        favorite: 1,
      }),
    );
  });

  test('importFromFile imports Firefox and Aegis Authenticator exports', async () => {
    (RNFS.readFile as jest.Mock)
      .mockResolvedValueOnce(
        'hostname,username,password,httprealm,formactionorigin\nhttps://firefox.example.com,fox,pass,,\n',
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          db: {
            entries: [
              {
                issuer: 'GitHub',
                name: 'alice',
                type: 'totp',
                favorite: true,
                info: {
                  secret: 'otp-secret',
                  algo: 'SHA256',
                  digits: 8,
                  period: 45,
                },
              },
            ],
          },
        }),
      );

    const firefox = await BackupModule.importFromFile(
      '/mock/documents/firefox.csv',
      'firefox',
    );
    const aegis = await BackupModule.importFromFile(
      '/mock/documents/aegis.json',
      'aegis_auth',
    );

    expect(firefox.total).toBe(1);
    expect(aegis.total).toBe(1);
    expect(SecurityModule.addItem).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'firefox.example.com',
        username: 'fox',
      }),
    );
    expect(SecurityModule.addItem).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'GitHub',
        username: 'alice',
        favorite: 1,
      }),
    );
  });

  test('importFromFile uses fallback title when title is missing', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'title,username,password,url\n,john,secret,https://github.com\n',
    );

    await BackupModule.importFromFile('/mock/documents/import_1.csv', 'generic_csv');

    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'https://github.com',
        username: 'john',
      }),
    );

    (SecurityModule.addItem as jest.Mock).mockClear();

    // Test generic_csv specific fallback
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'title,username,password,url\n,,new-secret,\n',
    );
    await BackupModule.importFromFile('/mock/documents/import_2.csv', 'generic_csv');
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'new-secret',
        title: 'İçe Aktarılan',
      }),
    );

    (SecurityModule.addItem as jest.Mock).mockClear();

    // Test absolute fallback in importFromFile (using 1password source which doesn't have its own fallback)
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce(
      'title,username,password,url\n,,last-secret,\n',
    );
    await BackupModule.importFromFile('/mock/documents/import_3.csv', '1password');
    expect(SecurityModule.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'last-secret',
        title: 'İsimsiz Kayıt',
      }),
    );
  });

  test('detectSource handles Dashlane CSV and KeePass exact column signatures', () => {
    expect(BackupModule.detectSource('dashlane.csv', 'cardholder,login_name,password\n')).toBe('dashlane');
    expect(BackupModule.detectSource('keepass.csv', '"Account","Login Name","Password","Web Site","Comments"\n')).toBe('keepass');
  });

  test('detectSource returns generic_csv as default fallback', () => {
    expect(BackupModule.detectSource('unknown.ext', 'random content')).toBe('generic_csv');
  });

  test('importFromFile handles empty file content gracefully', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValueOnce('   ');
    const result = await BackupModule.importFromFile('/mock/documents/empty.csv', 'generic_csv');
    expect(result.errors[0]).toContain('boş');
  });
});
