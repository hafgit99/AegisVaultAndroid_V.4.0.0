import RNFS from 'react-native-fs';
import { BackupModule } from '../src/BackupModule';
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
    await BackupModule.exportToJSON();

    const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
    const [, content] = writeCalls[writeCalls.length - 1];
    const parsed = JSON.parse(content);
    expect(parsed.app).toBe('Aegis Vault Android');
    expect(parsed.count).toBe(2);
    expect(parsed.items[0].title).toBe('GitHub');
  });

  test('exportEncrypted persists Argon2id metadata', async () => {
    await BackupModule.exportEncrypted('backup-password');

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
    expect(result.imported).toBe(1);
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
});
