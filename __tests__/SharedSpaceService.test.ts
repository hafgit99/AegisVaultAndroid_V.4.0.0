/**
 * SharedSpaceService.test.ts — Aegis Vault Android v4.02
 * Tests for shared spaces and member auditing.
 */

import { SharedSpaceService } from '../src/SharedSpaceService';
import { SecureAppSettings } from '../src/SecureAppSettings';
import { SharingAuditService } from '../src/SharingAuditService';

jest.mock('../src/SecureAppSettings', () => {
  let state = { sharedSpaces: [], sharingAuditLog: [] };
  return {
    SecureAppSettings: {
      get: jest.fn(() => state),
      update: jest.fn((patch) => {
        state = { ...state, ...patch };
      }),
    },
  };
});

describe('SharedSpaceService', () => {
  const db = {}; // Mock db object

  beforeEach(() => {
    (SecureAppSettings.get as jest.Mock).mockReturnValue({
      sharedSpaces: [],
      sharingAuditLog: [],
    });
    (SecureAppSettings.update as jest.Mock).mockImplementation((patch) => {
        const current = (SecureAppSettings.get as jest.Mock)();
        (SecureAppSettings.get as jest.Mock).mockReturnValue({ ...current, ...patch });
    });
  });

  it('saves a new shared space and records audit event', async () => {
    const space = {
      id: 'space1',
      name: 'Family',
      kind: 'family',
      members: [],
      created_at: '',
      updated_at: '',
    };

    await SharedSpaceService.saveSpace(space as any, db);
    
    const spaces = SharedSpaceService.listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].name).toBe('Family');

    const logs = SharingAuditService.getLog();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('space_created');
  });

  it('updates a member status and records audit event', async () => {
    const space = {
      id: 'space2',
      name: 'Work',
      kind: 'team',
      members: [{ id: 'mem1', name: 'John', status: 'pending' }],
      created_at: '',
      updated_at: '',
    };
    await SharedSpaceService.saveSpace(space as any, db);

    await SharedSpaceService.updateMemberStatus('space2', 'mem1', 'active', db);
    
    const updated = SharedSpaceService.listSpaces()[0];
    expect(updated.members[0].status).toBe('active');

    const logs = SharingAuditService.getLog();
    expect(logs.some(l => l.type === 'member_status_changed')).toBe(true);
  });

  it('deletes a shared space and records audit event', async () => {
    const space = { id: 'del1', name: 'Delete Me', members: [] };
    await SharedSpaceService.saveSpace(space as any, db);
    
    await SharedSpaceService.deleteSpace('del1', db);
    
    const spaces = SharedSpaceService.listSpaces();
    expect(spaces).toHaveLength(0);

    const logs = SharingAuditService.getLog();
    expect(logs.some(l => l.type === 'space_deleted')).toBe(true);
  });

  it('updates an existing shared space instead of duplicating it', async () => {
    const space = {
      id: 'space3',
      name: 'Team',
      kind: 'team',
      members: [],
      created_at: '',
      updated_at: '',
    };

    await SharedSpaceService.saveSpace(space as any, db);
    await SharedSpaceService.saveSpace(
      { ...space, name: 'Team Updated' } as any,
      db,
    );

    const spaces = SharedSpaceService.listSpaces();
    expect(spaces).toHaveLength(1);
    expect(spaces[0].name).toBe('Team Updated');
  });

  it('removes a member and records an audit event', async () => {
    const space = {
      id: 'space4',
      name: 'Ops',
      kind: 'team',
      members: [
        { id: 'mem1', name: 'John', status: 'active' },
        { id: 'mem2', name: 'Jane', status: 'active' },
      ],
      created_at: '',
      updated_at: '',
    };
    await SharedSpaceService.saveSpace(space as any, db);

    await SharedSpaceService.removeMember('space4', 'mem1', db);

    const updated = SharedSpaceService.listSpaces()[0];
    expect(updated.members).toHaveLength(1);
    expect(updated.members[0].id).toBe('mem2');

    const logs = SharingAuditService.getLog();
    expect(logs.some(l => l.type === 'member_removed')).toBe(true);
  });
});
