import RNFS from 'react-native-fs';
import { EmergencyAccessModule } from '../src/EmergencyAccessModule';
import { RecoveryModule } from '../src/RecoveryModule';
import { SecurityModule } from '../src/SecurityModule';

jest.mock('../src/RecoveryModule', () => ({
  RecoveryModule: {
    initiateRecovery: jest.fn(),
    restoreFromRecovery: jest.fn(),
  },
}));

jest.mock('../src/SecurityModule', () => ({
  SecurityModule: {
    logSecurityEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('EmergencyAccessModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.readDir as jest.Mock).mockResolvedValue([]);
    (RNFS.readFile as jest.Mock).mockResolvedValue('');
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('addContact pending durumunda kontakti yazar ve audit log olusturur', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const id = await EmergencyAccessModule.addContact({
      email: 'trusted@example.com',
      name: 'Trusted Person',
      publicKey: 'pub-key',
      status: 'active',
    });

    expect(id).toBe('tc_1700000000000');
    expect(RNFS.mkdir).toHaveBeenCalled();
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/trusted_contacts/tc_1700000000000.json'),
      expect.any(String),
      'utf8',
    );

    const [, body] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(body)).toMatchObject({
      id: 'tc_1700000000000',
      email: 'trusted@example.com',
      name: 'Trusted Person',
      publicKey: 'pub-key',
      status: 'pending',
    });
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'trusted_contact_added',
      'success',
      { email: 'trusted@example.com' },
    );
  });

  test('getContacts yalnizca json dosyalarini doner', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readDir as jest.Mock).mockResolvedValue([
      { name: 'one.json', path: '/mock/documents/trusted_contacts/one.json' },
      { name: 'ignore.txt', path: '/mock/documents/trusted_contacts/ignore.txt' },
      { name: 'two.json', path: '/mock/documents/trusted_contacts/two.json' },
    ]);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('one.json')) {
        return JSON.stringify({
          id: 'one',
          email: 'one@example.com',
          name: 'One',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return JSON.stringify({
        id: 'two',
        email: 'two@example.com',
        name: 'Two',
        addedAt: new Date().toISOString(),
        status: 'pending',
      });
    });

    const contacts = await EmergencyAccessModule.getContacts();

    expect(contacts).toHaveLength(2);
    expect(contacts.map(contact => contact.id)).toEqual(['one', 'two']);
  });

  test('getContacts dosya sistemi hatasinda bos dizi doner', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readDir as jest.Mock).mockRejectedValue(new Error('io failed'));

    await expect(EmergencyAccessModule.getContacts()).resolves.toEqual([]);
  });

  test('requestEmergencyAccess creates approval request when active contacts exist', async () => {
    (RecoveryModule.initiateRecovery as jest.Mock).mockResolvedValue({
      sessionId: 'session_123',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
      verificationCode: '',
      status: 'initiated',
      userEmail: 'user@example.com',
    });
    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      `${path}`.includes('trusted_contacts'),
    );
    (RNFS.readDir as jest.Mock).mockResolvedValue([
      { name: 'c1.json', path: '/mock/documents/trusted_contacts/c1.json' },
      { name: 'c2.json', path: '/mock/documents/trusted_contacts/c2.json' },
    ]);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('c1.json')) {
        return JSON.stringify({
          id: 'c1',
          email: 'a@example.com',
          name: 'A',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      if (path.endsWith('c2.json')) {
        return JSON.stringify({
          id: 'c2',
          email: 'b@example.com',
          name: 'B',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return '';
    });

    const requestId = await EmergencyAccessModule.requestEmergencyAccess(
      'user@example.com',
    );
    expect(requestId).toBe('session_123');
    expect(RNFS.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/emergency_requests/session_123.json'),
      expect.any(String),
      'utf8',
    );
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'emergency_request_created',
      'success',
      expect.objectContaining({
        requestId: 'session_123',
        requiredApprovals: 2,
      }),
    );
  });

  test('approveRecovery transitions to approved when quorum reached', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/emergency_requests/request_1.json')) {
        return JSON.stringify({
          id: 'request_1',
          recoverySessionId: 'session_1',
          requesterEmail: 'user@example.com',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
          requiredApprovals: 1,
          approvedBy: [],
        });
      }
      if (path.endsWith('/trusted_contacts/contact_1.json')) {
        return JSON.stringify({
          id: 'contact_1',
          email: 'a@example.com',
          name: 'A',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return '';
    });

    const approved = await EmergencyAccessModule.approveRecovery(
      'request_1',
      'contact_1',
    );
    expect(approved).toBe(true);
    const [, body] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(body).status).toBe('approved');
  });

  test('requestEmergencyAccess returns null and logs failure when no active contacts exist', async () => {
    (RecoveryModule.initiateRecovery as jest.Mock).mockResolvedValue({
      sessionId: 'session_456',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
      verificationCode: '',
      status: 'initiated',
      userEmail: 'user@example.com',
    });
    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      `${path}`.includes('trusted_contacts'),
    );
    (RNFS.readDir as jest.Mock).mockResolvedValue([
      { name: 'c1.json', path: '/mock/documents/trusted_contacts/c1.json' },
    ]);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: 'c1',
        email: 'a@example.com',
        name: 'A',
        addedAt: new Date().toISOString(),
        status: 'revoked',
      }),
    );

    const requestId = await EmergencyAccessModule.requestEmergencyAccess(
      'user@example.com',
    );

    expect(requestId).toBeNull();
    expect(SecurityModule.logSecurityEvent).toHaveBeenCalledWith(
      'emergency_request_failed',
      'failed',
      expect.objectContaining({
        reason: 'no_active_trusted_contact',
        requesterEmail: 'user@example.com',
      }),
    );
  });

  test('requestEmergencyAccess recovery baslatilamazsa null doner ve request yazmaz', async () => {
    (RecoveryModule.initiateRecovery as jest.Mock).mockResolvedValue(null);

    const result = await EmergencyAccessModule.requestEmergencyAccess('nobody@example.com');

    expect(result).toBeNull();
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });

  test('requestEmergencyAccess tek aktif kontak varsa tek onay ister', async () => {
    (RecoveryModule.initiateRecovery as jest.Mock).mockResolvedValue({
      sessionId: 'session_single',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
      verificationCode: '',
      status: 'initiated',
      userEmail: 'single@example.com',
    });
    (RNFS.exists as jest.Mock).mockImplementation(async path =>
      `${path}`.includes('trusted_contacts'),
    );
    (RNFS.readDir as jest.Mock).mockResolvedValue([
      { name: 'active.json', path: '/mock/documents/trusted_contacts/active.json' },
      { name: 'pending.json', path: '/mock/documents/trusted_contacts/pending.json' },
    ]);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('active.json')) {
        return JSON.stringify({
          id: 'active',
          email: 'active@example.com',
          name: 'Active',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return JSON.stringify({
        id: 'pending',
        email: 'pending@example.com',
        name: 'Pending',
        addedAt: new Date().toISOString(),
        status: 'pending',
      });
    });

    const requestId = await EmergencyAccessModule.requestEmergencyAccess('single@example.com');

    expect(requestId).toBe('session_single');
    const [, body] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(body)).toMatchObject({
      id: 'session_single',
      requiredApprovals: 1,
      approvedBy: [],
      requesterEmail: 'single@example.com',
      recoverySessionId: 'session_single',
      status: 'pending',
    });
  });

  test('approveRecovery does not duplicate the same approver twice', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/emergency_requests/request_dup.json')) {
        return JSON.stringify({
          id: 'request_dup',
          recoverySessionId: 'session_1',
          requesterEmail: 'user@example.com',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
          requiredApprovals: 2,
          approvedBy: ['contact_1'],
        });
      }
      if (path.endsWith('/trusted_contacts/contact_1.json')) {
        return JSON.stringify({
          id: 'contact_1',
          email: 'a@example.com',
          name: 'A',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return '';
    });

    const approved = await EmergencyAccessModule.approveRecovery(
      'request_dup',
      'contact_1',
    );

    expect(approved).toBe(false);
    const [, body] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(body).approvedBy).toEqual(['contact_1']);
  });

  test('approveRecovery request veya aktif olmayan kontakt yoksa false doner', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/emergency_requests/request_missing_contact.json')) {
        return JSON.stringify({
          id: 'request_missing_contact',
          recoverySessionId: 'session_1',
          requesterEmail: 'user@example.com',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
          requiredApprovals: 1,
          approvedBy: [],
        });
      }
      if (path.endsWith('/trusted_contacts/revoked_contact.json')) {
        return JSON.stringify({
          id: 'revoked_contact',
          email: 'revoked@example.com',
          name: 'Revoked',
          addedAt: new Date().toISOString(),
          status: 'revoked',
        });
      }
      return '';
    });

    await expect(
      EmergencyAccessModule.approveRecovery('request_missing_contact', 'revoked_contact'),
    ).resolves.toBe(false);
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });

  test('approveRecovery pending olmayan requestte mevcut status approved ise true doner', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/emergency_requests/request_already_approved.json')) {
        return JSON.stringify({
          id: 'request_already_approved',
          recoverySessionId: 'session_1',
          requesterEmail: 'user@example.com',
          status: 'approved',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
          requiredApprovals: 1,
          approvedBy: ['contact_1'],
          approvedAt: new Date().toISOString(),
        });
      }
      if (path.endsWith('/trusted_contacts/contact_1.json')) {
        return JSON.stringify({
          id: 'contact_1',
          email: 'a@example.com',
          name: 'A',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return '';
    });

    await expect(
      EmergencyAccessModule.approveRecovery('request_already_approved', 'contact_1'),
    ).resolves.toBe(true);
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });

  test('approveRecovery suresi gecmis istegi expired yapar', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/emergency_requests/request_expired.json')) {
        return JSON.stringify({
          id: 'request_expired',
          recoverySessionId: 'session_1',
          requesterEmail: 'user@example.com',
          status: 'pending',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
          requiredApprovals: 1,
          approvedBy: [],
        });
      }
      if (path.endsWith('/trusted_contacts/contact_1.json')) {
        return JSON.stringify({
          id: 'contact_1',
          email: 'a@example.com',
          name: 'A',
          addedAt: new Date().toISOString(),
          status: 'active',
        });
      }
      return '';
    });

    const approved = await EmergencyAccessModule.approveRecovery(
      'request_expired',
      'contact_1',
    );

    expect(approved).toBe(false);
    const [, body] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(body).status).toBe('expired');
  });

  test('completeApprovedRecovery marks request completed only after restore succeeds', async () => {
    (RecoveryModule.restoreFromRecovery as jest.Mock).mockResolvedValue(true);
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockImplementation(async (path: string) => {
      if (path.endsWith('/emergency_requests/request_complete.json')) {
        return JSON.stringify({
          id: 'request_complete',
          recoverySessionId: 'session_complete',
          requesterEmail: 'user@example.com',
          status: 'approved',
          requestedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
          requiredApprovals: 2,
          approvedBy: ['contact_1', 'contact_2'],
          approvedAt: new Date().toISOString(),
        });
      }
      return '';
    });

    const result = await EmergencyAccessModule.completeApprovedRecovery(
      'request_complete',
      'token-1',
      'backup-password',
    );

    expect(result).toBe(true);
    expect(RecoveryModule.restoreFromRecovery).toHaveBeenCalledWith(
      'session_complete',
      'token-1',
      'backup-password',
    );
    const [, body] = (RNFS.writeFile as jest.Mock).mock.calls[0];
    expect(JSON.parse(body).status).toBe('completed');
  });

  test('completeApprovedRecovery approved olmayan requestte false doner', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: 'request_pending',
        recoverySessionId: 'session_pending',
        requesterEmail: 'user@example.com',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        requiredApprovals: 2,
        approvedBy: [],
      }),
    );

    await expect(
      EmergencyAccessModule.completeApprovedRecovery('request_pending', 'token', 'pw'),
    ).resolves.toBe(false);
    expect(RecoveryModule.restoreFromRecovery).not.toHaveBeenCalled();
  });

  test('completeApprovedRecovery restore basarisizsa completed yapmaz', async () => {
    (RecoveryModule.restoreFromRecovery as jest.Mock).mockResolvedValue(false);
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: 'request_restore_fail',
        recoverySessionId: 'session_restore_fail',
        requesterEmail: 'user@example.com',
        status: 'approved',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        requiredApprovals: 1,
        approvedBy: ['contact_1'],
        approvedAt: new Date().toISOString(),
      }),
    );

    await expect(
      EmergencyAccessModule.completeApprovedRecovery('request_restore_fail', 'token', 'pw'),
    ).resolves.toBe(false);
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });

  test('getRecoveryApprovalStatus mevcut requestin sayaclarini doner', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        id: 'request_status',
        recoverySessionId: 'session_status',
        requesterEmail: 'user@example.com',
        status: 'approved',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        requiredApprovals: 2,
        approvedBy: ['contact_1'],
        approvedAt: new Date().toISOString(),
      }),
    );

    await expect(
      EmergencyAccessModule.getRecoveryApprovalStatus('request_status'),
    ).resolves.toEqual({
      status: 'approved',
      approvedCount: 1,
      requiredApprovals: 2,
    });
  });

  test('private loaders parse veya exists hatalarinda null donusune dusen public akislar saglam kalir', async () => {
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      path.includes('trusted_contacts') || path.includes('emergency_requests'),
    );
    (RNFS.readFile as jest.Mock).mockRejectedValue(new Error('read fail'));

    await expect(
      EmergencyAccessModule.approveRecovery('bad-request', 'bad-contact'),
    ).resolves.toBe(false);
    await expect(
      EmergencyAccessModule.completeApprovedRecovery('bad-request', 'token', 'pw'),
    ).resolves.toBe(false);
  });

  test('getRecoveryApprovalStatus returns not_found defaults for missing request', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(false);

    await expect(
      EmergencyAccessModule.getRecoveryApprovalStatus('missing'),
    ).resolves.toEqual({
      status: 'not_found',
      approvedCount: 0,
      requiredApprovals: 0,
    });
  });
});
