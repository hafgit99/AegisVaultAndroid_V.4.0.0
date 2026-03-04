import { BackupModule } from '../../src/BackupModule';
import { SecurityModule } from '../../src/SecurityModule';
import RNFS from 'react-native-fs';

// Mock SecurityModule
jest.mock('../../src/SecurityModule', () => ({
  addItem: jest.fn().mockResolvedValue(1),
  SecurityModule: {
    addItem: jest.fn()
  }
}));

describe('BackupModule Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CSV Parsing logic (tested via Bitwarden CSV import)', () => {
    test('correctly parses quoted fields and commas in CSV', async () => {
      const csvContent = 
        'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
        'Work,0,login,"My App, Inc.","Notes with, comma","field1: val1",0,https://example.com,user1,pass1,TOTP123';
      
      (RNFS.readFile as jest.Mock).mockResolvedValue(csvContent);

      const result = await BackupModule.importFromFile('dummy.csv', 'bitwarden');

      expect(result.total).toBe(1);
      expect(result.imported).toBe(1);
      expect(SecurityModule.addItem).toHaveBeenCalledWith(expect.objectContaining({
        title: 'My App, Inc.',
        notes: 'Notes with, comma',
        username: 'user1'
      }));
    });

    test('handles multi-line notes in quoted fields', async () => {
      const csvContent = 
        'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
        'Work,0,login,MultiLine,"Line 1\nLine 2",,0,uri,user,pass,';
      
      (RNFS.readFile as jest.Mock).mockResolvedValue(csvContent);

      const result = await BackupModule.importFromFile('dummy.csv', 'bitwarden');
      
      expect(result.total).toBe(1);
      expect(SecurityModule.addItem).toHaveBeenCalledWith(expect.objectContaining({
        title: 'MultiLine',
        notes: 'Line 1\nLine 2'
      }));
    });
  });

  describe('Generic JSON Import', () => {
    test('imports simple JSON array', async () => {
      const jsonContent = JSON.stringify([
        { title: 'Entry 1', username: 'user1', password: 'pw1' },
        { title: 'Entry 2', username: 'user2', password: 'pw2' }
      ]);

      (RNFS.readFile as jest.Mock).mockResolvedValue(jsonContent);

      const result = await BackupModule.importFromFile('dummy.json', 'generic_json');

      expect(result.total).toBe(2);
      expect(result.imported).toBe(2);
      expect(SecurityModule.addItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('Aegis Vault Native Import', () => {
    test('imports native Aegis JSON format', async () => {
      const nativeJson = JSON.stringify({
        version: '2.0.0',
        app: 'Aegis Vault Android',
        items: [
          {
            category: 'login',
            title: 'Aegis Login',
            url: 'https://aegis.com',
            username: 'admin',
            password: 'admin123'
          }
        ]
      });

      (RNFS.readFile as jest.Mock).mockResolvedValue(nativeJson);

      const result = await BackupModule.importFromFile('dummy.json', 'aegis_vault');

      expect(result.total).toBe(1);
      expect(SecurityModule.addItem).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Aegis Login',
        username: 'admin',
        url: 'https://aegis.com'
      }));
    });
  });
});
