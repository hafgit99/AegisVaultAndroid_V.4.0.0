/**
 * SharedSpaceService — Aegis Vault Android v4.02
 * Manages shared space CRUD operations and member lifecycles.
 * Ported from desktop SharedSpaceService.ts.
 *
 * Paylaşılan Alan Servisi — Paylaşılan alan CRUD ve üye yaşam döngüsünü yönetir.
 */

import { SecureAppSettings, type SharedSpace, type SharedMember } from './SecureAppSettings';
import { SharingAuditService } from './SharingAuditService';

export class SharedSpaceService {
  /**
   * List all shared spaces.
   */
  static listSpaces(): SharedSpace[] {
    return SecureAppSettings.get().sharedSpaces;
  }

  /**
   * Save or update a shared space.
   */
  static async saveSpace(space: SharedSpace, db: any): Promise<void> {
    const settings = SecureAppSettings.get();
    const existingIdx = settings.sharedSpaces.findIndex(s => s.id === space.id);
    
    let updatedSpaces: SharedSpace[];
    if (existingIdx !== -1) {
      updatedSpaces = [...settings.sharedSpaces];
      updatedSpaces[existingIdx] = { ...space, updated_at: new Date().toISOString() };
    } else {
      updatedSpaces = [...settings.sharedSpaces, { ...space, created_at: new Date().toISOString() }];
    }

    await SecureAppSettings.update({ sharedSpaces: updatedSpaces }, db);
    await SharingAuditService.recordEvent({
        type: existingIdx !== -1 ? 'space_updated' : 'space_created',
        spaceId: space.id,
        detail: space.name
    }, db);
  }

  /**
   * Deletes a shared space.
   */
  static async deleteSpace(spaceId: string, db: any): Promise<void> {
    const settings = SecureAppSettings.get();
    const space = settings.sharedSpaces.find(s => s.id === spaceId);
    if (!space) return;

    const updatedSpaces = settings.sharedSpaces.filter(s => s.id !== spaceId);
    await SecureAppSettings.update({ sharedSpaces: updatedSpaces }, db);
    await SharingAuditService.recordEvent({
        type: 'space_deleted',
        spaceId,
        detail: space.name
    }, db);
  }

  /**
   * Updates a member's status (e.g. approve a pending member).
   */
  static async updateMemberStatus(
    spaceId: string,
    memberId: string,
    status: SharedMember['status'],
    db: any
  ): Promise<void> {
    const settings = SecureAppSettings.get();
    const space = settings.sharedSpaces.find(s => s.id === spaceId);
    if (!space) return;

    const updatedMembers = space.members.map(m => 
      m.id === memberId ? { ...m, status } : m
    );

    const updatedSpace = { ...space, members: updatedMembers };
    await this.saveSpace(updatedSpace, db);
    
    await SharingAuditService.recordEvent({
        type: 'member_status_changed',
        spaceId,
        detail: `${memberId} -> ${status}`
    }, db);
  }

  /**
   * Removes a member from a shared space.
   */
  static async removeMember(spaceId: string, memberId: string, db: any): Promise<void> {
    const settings = SecureAppSettings.get();
    const space = settings.sharedSpaces.find(s => s.id === spaceId);
    if (!space) return;

    const updatedMembers = space.members.filter(m => m.id !== memberId);
    const updatedSpace = { ...space, members: updatedMembers };
    await this.saveSpace(updatedSpace, db);
    
    await SharingAuditService.recordEvent({
        type: 'member_removed',
        spaceId,
        detail: memberId
    }, db);
  }
}
