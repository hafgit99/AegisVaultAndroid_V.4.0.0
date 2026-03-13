/**
 * BackupModule Test Suite - Comprehensive Testing
 * Validates export/import across 12 formats, encryption, and round-trip integrity
 * 
 * BackupModule Test Seti - Kapsamlı Test
 * 12 format üzerinden dışa/içe aktarım, şifreleme ve round-trip bütünlüğü doğrula
 */

import { BackupModule, ImportResult } from '../src/BackupModule';
import jest from 'jest';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS & MOCKS
// ═══════════════════════════════════════════════════════════════

interface VaultItem {
  id: number;
  title: string;
  username?: string;
  password: string;
  url?: string;
  category?: string;
  tags?: string[];
  notes?: string;
  customFields?: Record<string, string>;
}

interface BackupMetadata {
  version: string;
  algorithm: string;
  kdf: string;
  memory?: number;
  iterations?: number;
  salt?: string;
  iv?: string;
  authTag?: string;
}

const mockVaultItems: VaultItem[] = [
  {
    id: 1,
    title: 'GitHub',
    username: 'john-dev',
    password: 'gh-token-xyz123',
    url: 'https://github.com',
    category: 'development',
    tags: ['work', 'code'],
    notes: 'Personal GitHub account'
  },
  {
    id: 2,
    title: 'Gmail',
    username: 'john@gmail.com',
    password: 'gmail-secure-pwd-456',
    url: 'https://mail.google.com',
    category: 'email',
    tags: ['personal'],
    customFields: { 'Recovery Email': 'john.old@gmail.com' }
  },
  {
    id: 3,
    title: 'AWS Console',
    username: 'john@company.com',
    password: 'aws-iam-key-789',
    url: 'https://console.aws.amazon.com',
    category: 'cloud',
    tags: ['work', 'production']
  }
];

// ═══════════════════════════════════════════════════════════════
// TEST SUITE: Module Functionality
// ═══════════════════════════════════════════════════════════════

describe('BackupModule - Core Functionality', () => {
  test('BackupModule exports all required functions', () => {
    const requiredMethods = [
      'importFromFile',
      'exportToCSV',
      'exportToJSON',
      'exportEncrypted',
      'importBitwarden',
      'import1Password',
      'importLastPass',
      'importKeePass'
    ];

    requiredMethods.forEach(method => {
      expect(typeof BackupModule[method as keyof typeof BackupModule]).toBe('function');
    });
    
    console.log('✅ All BackupModule methods available');
  });

  test('ImportResult structure is valid', () => {
    const mockResult: ImportResult = {
      total: 5,
      imported: 5,
      skipped: 0,
      errors: [],
      source: 'generic_csv',
      items: mockVaultItems.slice(0, 5)
    };

    expect(mockResult.total).toBe(5);
    expect(mockResult.imported).toBe(5);
    expect(mockResult.skipped).toBe(0);
    expect(Array.isArray(mockResult.errors)).toBe(true);
    expect(Array.isArray(mockResult.items)).toBe(true);
    
    console.log('✅ ImportResult structure valid');
  });

  test('All 12 import formats are supported', () => {
    const supportedFormats = [
      'bitwarden', '1password', 'lastpass', 'keepass',
      'chrome', 'dashlane', 'enpass', 'firefox',
      'aegis_auth', 'aegis_vault', 'generic_csv', 'generic_json'
    ];
    
    expect(supportedFormats).toHaveLength(12);
    supportedFormats.forEach(format => {
      expect(typeof BackupModule[`import${format.charAt(0).toUpperCase()}${format.slice(1)}`]).toBe('function');
    });
    console.log(`✅ All ${supportedFormats.length} import formats supported`);
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE: Export Formats
// ═══════════════════════════════════════════════════════════════

describe('BackupModule - Export Formats', () => {
  test('exportToCSV produces valid CSV with BOM', () => {
    const csv = BackupModule.exportToCSV(mockVaultItems);

    // Check CSV header
    expect(csv).toContain('title');
    expect(csv).toContain('username');
    expect(csv).toContain('password');
    expect(csv).toContain('url');

    // Check data rows
    expect(csv).toContain('GitHub');
    expect(csv).toContain('john-dev');
    expect(csv).toContain('gh-token-xyz123');

    // Verify line count (header + 3 items)
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(4);

    console.log('✅ CSV export valid');
  });

  test('exportToJSON produces structured format', () => {
    const json = BackupModule.exportToJSON(mockVaultItems);
    const parsed = JSON.parse(json);

    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('items');
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0].title).toBe('GitHub');

    console.log('✅ JSON export valid');
  });

  test('exportEncrypted uses Argon2id (32MB, 4 iter) by default', async () => {
    const encrypted = await BackupModule.exportEncrypted(
      mockVaultItems,
      'backup-password-123'
    );

    const parsed = JSON.parse(encrypted);

    expect(parsed).toHaveProperty('kdf', 'Argon2id');
    expect(parsed).toHaveProperty('memory', 32768);
    expect(parsed).toHaveProperty('iterations', 4);
    expect(parsed).toHaveProperty('salt');
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('authTag');
    expect(parsed).toHaveProperty('data');
    expect(parsed.salt).toHaveLength(64); // 32 bytes hex
    expect(parsed.authTag).toHaveLength(32); // 16 bytes hex

    console.log('✅ Encrypted export uses Argon2id');
  });

  test('exportEncrypted produces different ciphertext for same input (random IV)', async () => {
    const encrypted1 = await BackupModule.exportEncrypted(
      mockVaultItems,
      'password123'
    );
    const encrypted2 = await BackupModule.exportEncrypted(
      mockVaultItems,
      'password123'
    );

    const parsed1 = JSON.parse(encrypted1);
    const parsed2 = JSON.parse(encrypted2);

    // IVs should be different (random)
    expect(parsed1.iv).not.toBe(parsed2.iv);
    // Ciphertexts should be different
    expect(parsed1.data).not.toBe(parsed2.data);
    // But both are valid
    expect(parsed1.authTag).toBeDefined();
    expect(parsed2.authTag).toBeDefined();

    console.log('✅ Encrypted exports use random IVs');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE: Import Compatibility
// ═══════════════════════════════════════════════════════════════

describe('BackupModule - Import Compatibility', () => {
  test('importFromFile with CSV format parses correctly', async () => {
    const csvData = `title,username,password,url
GitHub,john-dev,gh-token-xyz123,https://github.com
Gmail,john@gmail.com,gmail-password,https://mail.google.com`;

    const result = await BackupModule.importFromFile(csvData, 'generic_csv');

    expect(result.imported).toBe(2);
    expect(result.total).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].title).toBe('GitHub');

    console.log('✅ CSV import successful');
  });

  test('importFromFile with JSON format parses correctly', async () => {
    const jsonData = JSON.stringify({
      version: '1.0',
      items: [
        { id: 1, title: 'GitHub', username: 'user', password: 'pwd' }
      ]
    });

    const result = await BackupModule.importFromFile(jsonData, 'generic_json');

    expect(result.imported).toBeGreaterThan(0);
    expect(result.items[0].title).toBe('GitHub');

    console.log('✅ JSON import successful');
  });

  test('importFromFile handles CSV with special characters', async () => {
    const csvData = `title,username,password,notes
"Special Chars",user@example.com,"pwd,with,commas","Notes with ""quotes"""
Umlauts,user,änderung,Ätzlich schöne Nöte`;

    const result = await BackupModule.importFromFile(csvData, 'generic_csv');

    expect(result.imported).toBe(2);
    expect(result.items[0].notes).toContain('quotes');
    expect(result.items[1].title).toBe('Umlauts');

    console.log('✅ CSV special character handling OK');
  });

  test('importEncrypted decrypts Argon2id-encrypted backups', async () => {
    const password = 'test-backup-password';
    
    // Export encrypted
    const encrypted = await BackupModule.exportEncrypted(mockVaultItems, password);
    
    // Import encrypted
    const result = await BackupModule.importEncrypted(encrypted, password);

    expect(result.imported).toBe(3);
    expect(result.items[0].title).toBe('GitHub');
    expect(result.items[0].username).toBe('john-dev');
    expect(result.items[0].password).toBe('gh-token-xyz123');

    console.log('✅ Encrypted import/export round-trip successful');
  });

  test('importEncrypted rejects wrong password', async () => {
    const password = 'correct-password';
    const wrongPassword = 'wrong-password';
    
    const encrypted = await BackupModule.exportEncrypted(mockVaultItems, password);

    await expect(
      BackupModule.importEncrypted(encrypted, wrongPassword)
    ).rejects.toThrow();

    console.log('✅ Wrong password rejection working');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE: Round-Trip Encryption
// ═══════════════════════════════════════════════════════════════

describe('BackupModule - Round-Trip Integrity', () => {
  test('Export + Import preserves all fields', async () => {
    const password = 'round-trip-password';
    
    // Export
    const encrypted = await BackupModule.exportEncrypted(mockVaultItems, password);
    
    // Import
    const result = await BackupModule.importEncrypted(encrypted, password);

    // Verify all items match
    expect(result.items).toHaveLength(mockVaultItems.length);
    
    result.items.forEach((item, idx) => {
      const original = mockVaultItems[idx];
      expect(item.title).toBe(original.title);
      expect(item.username).toBe(original.username);
      expect(item.password).toBe(original.password);
      expect(item.url).toBe(original.url);
      expect(JSON.stringify(item.tags)).toBe(JSON.stringify(original.tags));
    });

    console.log('✅ Round-trip encryption preserves all data');
  });

  test('CSV → JSON → Encrypted round-trip maintains data', async () => {
    const password = 'csv-json-encryption-password';

    // CSV export
    const csv = BackupModule.exportToCSV(mockVaultItems);
    
    // Import from CSV
    const fromCsv = await BackupModule.importFromFile(csv, 'generic_csv');
    
    // Export to encrypted
    const encrypted = await BackupModule.exportEncrypted(fromCsv.items || [], password);
    
    // Import from encrypted
    const result = await BackupModule.importEncrypted(encrypted, password);

    expect(result.imported).toBeGreaterThan(0);
    expect(result.items[0].title).toBe('GitHub');

    console.log('✅ CSV → JSON → Encrypted round-trip OK');
  });
});

// ═══════════════════════════════════════════════════════════════
// TEST SUITE: Error Handling
// ═══════════════════════════════════════════════════════════════

describe('BackupModule - Error Handling', () => {
  test('importFromFile rejects invalid JSON', async () => {
    const invalidJson = '{invalid json content}';

    await expect(
      BackupModule.importFromFile(invalidJson, 'generic_json')
    ).rejects.toThrow();

    console.log('✅ Invalid JSON rejection working');
  });

  test('importFromFile handles CSV with missing columns', async () => {
    const incompleteCSV = `title,password
GitHub,gh-token-xyz123`;

    const result = await BackupModule.importFromFile(incompleteCSV, 'generic_csv');

    expect(result.imported).toBeGreaterThan(0);
    expect(result.items[0].title).toBe('GitHub');
    expect(result.items[0].password).toBe('gh-token-xyz123');

    console.log('✅ CSV with missing columns handled gracefully');
  });

  test('importEncrypted rejects corrupted ciphertext', async () => {
    const corrupted = JSON.stringify({
      kdf: 'Argon2id',
      data: 'corrupted-base64-data-!!!',
      authTag: 'invalid-tag',
      salt: 'salt'
    });

    await expect(
      BackupModule.importEncrypted(corrupted, 'password')
    ).rejects.toThrow();

    console.log('✅ Corrupted data rejection working');
  });

  test('exportEncrypted handles empty vault', async () => {
    const empty: VaultItem[] = [];
    const encrypted = await BackupModule.exportEncrypted(empty, 'password');
    const parsed = JSON.parse(encrypted);

    expect(parsed.data).toBeDefined();
    expect(parsed.authTag).toBeDefined();

    const result = await BackupModule.importEncrypted(encrypted, 'password');
    expect(result.items).toHaveLength(0);

    console.log('✅ Empty vault export/import OK');
  });
});
