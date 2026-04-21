/**
 * EmergencyAccessModule - Professional Emergency & Trusted Contact Recovery
 *
 * Acil Durum Erisimi Modulu - Guvenilir Kisi ve Acil Durum Kurtarma
 * Trusted contacts must approve a recovery request before emergency restore runs.
 */

import RNFS from 'react-native-fs';
import { SecurityModule } from './SecurityModule';
import { RecoveryModule } from './RecoveryModule';

export interface TrustedContact {
  id: string;
  email: string;
  name: string;
  addedAt: string;
  publicKey?: string;
  status: 'active' | 'pending' | 'revoked';
}

export interface EmergencyAccessRequest {
  id: string;
  recoverySessionId: string;
  requesterEmail: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'completed';
  requestedAt: string;
  expiresAt: string;
  requiredApprovals: number;
  approvedBy: string[];
  approvedAt?: string;
}

export class EmergencyAccessModule {
  private static readonly CONTACTS_DIR = `${RNFS.DocumentDirectoryPath}/trusted_contacts`;
  private static readonly REQUESTS_DIR = `${RNFS.DocumentDirectoryPath}/emergency_requests`;
  private static readonly REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

  static async addContact(
    contact: Omit<TrustedContact, 'id' | 'addedAt'>,
  ): Promise<string> {
    await RNFS.mkdir(this.CONTACTS_DIR).catch(() => {});
    const id = `tc_${Date.now()}`;
    const newContact: TrustedContact = {
      ...contact,
      id,
      addedAt: new Date().toISOString(),
      status: 'pending',
    };

    await RNFS.writeFile(
      `${this.CONTACTS_DIR}/${id}.json`,
      JSON.stringify(newContact),
      'utf8',
    );

    await SecurityModule.logSecurityEvent('trusted_contact_added', 'success', {
      email: contact.email,
    });
    return id;
  }

  static async getContacts(): Promise<TrustedContact[]> {
    try {
      const exists = await RNFS.exists(this.CONTACTS_DIR);
      if (!exists) return [];

      const files = await RNFS.readDir(this.CONTACTS_DIR);
      const contacts: TrustedContact[] = [];
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;
        const content = await RNFS.readFile(file.path, 'utf8');
        contacts.push(JSON.parse(content));
      }
      return contacts;
    } catch {
      return [];
    }
  }

  static async requestEmergencyAccess(
    requesterEmail: string,
  ): Promise<string | null> {
    const session = await RecoveryModule.initiateRecovery(requesterEmail);
    if (!session) return null;

    await RNFS.mkdir(this.REQUESTS_DIR).catch(() => {});

    const activeContacts = (await this.getContacts()).filter(
      c => c.status === 'active',
    );
    if (activeContacts.length === 0) {
      await SecurityModule.logSecurityEvent('emergency_request_failed', 'failed', {
        reason: 'no_active_trusted_contact',
        requesterEmail,
      });
      return null;
    }

    const requiredApprovals = Math.min(2, activeContacts.length);
    const request: EmergencyAccessRequest = {
      id: session.sessionId,
      recoverySessionId: session.sessionId,
      requesterEmail,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.REQUEST_TTL_MS).toISOString(),
      requiredApprovals,
      approvedBy: [],
    };

    await this.saveRequest(request);
    await SecurityModule.logSecurityEvent('emergency_request_created', 'success', {
      requestId: request.id,
      requiredApprovals,
    });

    return request.id;
  }

  static async approveRecovery(
    requestId: string,
    contactId: string,
  ): Promise<boolean> {
    const [request, contact] = await Promise.all([
      this.getRequest(requestId),
      this.getContact(contactId),
    ]);

    if (!request || !contact || contact.status !== 'active') {
      return false;
    }
    if (request.status !== 'pending') {
      return request.status === 'approved';
    }

    const now = new Date();
    if (now > new Date(request.expiresAt)) {
      request.status = 'expired';
      await this.saveRequest(request);
      return false;
    }

    if (!request.approvedBy.includes(contactId)) {
      request.approvedBy.push(contactId);
    }

    if (request.approvedBy.length >= request.requiredApprovals) {
      request.status = 'approved';
      request.approvedAt = now.toISOString();
    }

    await this.saveRequest(request);
    await SecurityModule.logSecurityEvent(
      'recovery_approved_by_contact',
      'success',
      {
        requestId,
        contactId,
        approvals: request.approvedBy.length,
        requiredApprovals: request.requiredApprovals,
      },
    );

    return request.status === 'approved';
  }

  static async getRecoveryApprovalStatus(requestId: string): Promise<{
    status: EmergencyAccessRequest['status'] | 'not_found';
    approvedCount: number;
    requiredApprovals: number;
  }> {
    const request = await this.getRequest(requestId);
    if (!request) {
      return {
        status: 'not_found',
        approvedCount: 0,
        requiredApprovals: 0,
      };
    }
    return {
      status: request.status,
      approvedCount: request.approvedBy.length,
      requiredApprovals: request.requiredApprovals,
    };
  }

  static async completeApprovedRecovery(
    requestId: string,
    recoveryToken: string,
    backupPassword: string,
  ): Promise<boolean> {
    const request = await this.getRequest(requestId);
    if (!request || request.status !== 'approved') {
      return false;
    }

    const ok = await RecoveryModule.restoreFromRecovery(
      request.recoverySessionId,
      recoveryToken,
      backupPassword,
    );
    if (!ok) return false;

    request.status = 'completed';
    await this.saveRequest(request);
    await SecurityModule.logSecurityEvent('emergency_recovery_completed', 'success', {
      requestId,
      recoverySessionId: request.recoverySessionId,
    });
    return true;
  }

  private static async getContact(contactId: string): Promise<TrustedContact | null> {
    try {
      const path = `${this.CONTACTS_DIR}/${contactId}.json`;
      if (!(await RNFS.exists(path))) return null;
      const raw = await RNFS.readFile(path, 'utf8');
      return JSON.parse(raw) as TrustedContact;
    } catch {
      return null;
    }
  }

  private static async getRequest(
    requestId: string,
  ): Promise<EmergencyAccessRequest | null> {
    try {
      const path = `${this.REQUESTS_DIR}/${requestId}.json`;
      if (!(await RNFS.exists(path))) return null;
      const raw = await RNFS.readFile(path, 'utf8');
      return JSON.parse(raw) as EmergencyAccessRequest;
    } catch {
      return null;
    }
  }

  private static async saveRequest(request: EmergencyAccessRequest): Promise<void> {
    await RNFS.mkdir(this.REQUESTS_DIR).catch(() => {});
    await RNFS.writeFile(
      `${this.REQUESTS_DIR}/${request.id}.json`,
      JSON.stringify(request),
      'utf8',
    );
  }
}

export default EmergencyAccessModule;
