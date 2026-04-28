/**
 * EmergencyAccessModule - Professional Emergency & Trusted Contact Recovery
 *
 * Acil Durum Erisimi Modulu - Guvenilir Kisi ve Acil Durum Kurtarma
 * Trusted contacts must approve a recovery request before emergency restore runs.
 */

import RNFS from 'react-native-fs';
import { NativeModules } from 'react-native';
import { SecurityModule } from './SecurityModule';
import { RecoveryModule } from './RecoveryModule';
import { writeSecureJson } from './security/SecureJsonStorage';

const { SecureStorage } = NativeModules as {
  SecureStorage?: {
    getItem?: (key: string) => Promise<string | null>;
    setItem?: (key: string, value: string) => Promise<boolean>;
  };
};

const CONTACTS_SECURE_KEY = 'aegis_trusted_contacts_v2';
const REQUESTS_SECURE_KEY = 'aegis_emergency_requests_v2';
const SAFE_EMERGENCY_ID = /^[a-zA-Z0-9_-]{8,128}$/;

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
    const id = `tc_${Date.now()}`;
    const newContact: TrustedContact = {
      ...contact,
      id,
      addedAt: new Date().toISOString(),
      status: 'pending',
    };

    const contacts = await this.loadContactsMap();
    contacts[id] = newContact;
    await this.saveContactsMap(contacts);

    await SecurityModule.logSecurityEvent('trusted_contact_added', 'success', {
      email: contact.email,
    });
    return id;
  }

  static async getContacts(): Promise<TrustedContact[]> {
    try {
      return Object.values(await this.loadContactsMap());
    } catch {
      return [];
    }
  }

  static async requestEmergencyAccess(
    requesterEmail: string,
  ): Promise<string | null> {
    const session = await RecoveryModule.initiateRecovery(requesterEmail);
    if (!session) return null;

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

    const requests = await this.loadRequestsMap();
    requests[request.id] = request;
    await this.saveRequestsMap(requests);

    await SecurityModule.logSecurityEvent('emergency_request_created', 'success', {
      id: request.id,
      requestId: request.id,
      requesterEmail,
      requiredApprovals,
    });
    return request.id;
  }

  static async getActiveRequest(
    requestId: string,
  ): Promise<EmergencyAccessRequest | null> {
    if (!this.isSafeId(requestId)) return null;
    const requests = await this.loadRequestsMap();
    const request =
      requests[requestId] ||
      (await this.readLegacyRecord<EmergencyAccessRequest>(
        this.REQUESTS_DIR,
        requestId,
      ));
    if (!request) return null;

    if (
      request.status === 'pending' &&
      new Date(request.expiresAt) < new Date()
    ) {
      request.status = 'expired';
      await this.saveRequestsMap(requests);
    }
    return request;
  }

  static async approveRequest(
    requestId: string,
    contactEmail: string,
  ): Promise<boolean> {
    return this.approveRecovery(requestId, contactEmail);
  }

  static async approveRecovery(
    requestId: string,
    contactId: string,
  ): Promise<boolean> {
    if (!this.isSafeId(requestId) || !this.isSafeId(contactId)) return false;
    const requests = await this.loadRequestsMap();
    const request =
      requests[requestId] ||
      (await this.readLegacyRecord<EmergencyAccessRequest>(
        this.REQUESTS_DIR,
        requestId,
      ));
    if (!request) return false;
    requests[requestId] = request;
    if (request.status === 'approved') return true;
    if (request.status !== 'pending') return false;

    if (new Date(request.expiresAt) < new Date()) {
      request.status = 'expired';
      await this.saveRequestsMap(requests);
      return false;
    }

    const contacts = await this.loadContactsMap();
    const contact =
      contacts[contactId] ||
      (await this.readLegacyRecord<TrustedContact>(this.CONTACTS_DIR, contactId));
    if (!contact || contact.status !== 'active') return false;

    if (!request.approvedBy.includes(contactId)) {
      request.approvedBy.push(contactId);
      if (request.approvedBy.length >= request.requiredApprovals) {
        request.status = 'approved';
        request.approvedAt = new Date().toISOString();
      }
      await this.saveRequestsMap(requests);
      await SecurityModule.logSecurityEvent('emergency_request_approved', 'success', {
        requestId,
        contactId,
        contactEmail: contact.email,
        status: request.status,
      });
      return true;
    }
    await this.saveRequestsMap(requests);
    return false;
  }

  static async completeRecovery(requestId: string): Promise<boolean> {
    return this.completeApprovedRecovery(requestId, '', '');
  }

  static async completeApprovedRecovery(
    requestId: string,
    recoveryToken: string,
    backupPassword: string,
  ): Promise<boolean> {
    if (!this.isSafeId(requestId)) return false;
    const requests = await this.loadRequestsMap();
    const request =
      requests[requestId] ||
      (await this.readLegacyRecord<EmergencyAccessRequest>(
        this.REQUESTS_DIR,
        requestId,
      ));
    if (!request || request.status !== 'approved') return false;
    requests[requestId] = request;

    const ok = await RecoveryModule.restoreFromRecovery(
      request.recoverySessionId,
      recoveryToken,
      backupPassword,
    );
    if (ok) {
      request.status = 'completed';
      await this.saveRequestsMap(requests);
      await SecurityModule.logSecurityEvent('emergency_recovery_completed', 'success', {
        requestId,
      });
    }
    return ok;
  }

  static async getRecoveryApprovalStatus(
    requestId: string,
  ): Promise<{
    status: EmergencyAccessRequest['status'] | 'not_found';
    approvedCount: number;
    requiredApprovals: number;
  }> {
    if (!this.isSafeId(requestId)) {
      return { status: 'not_found', approvedCount: 0, requiredApprovals: 0 };
    }
    const request = await this.getActiveRequest(requestId);
    if (!request) {
      return { status: 'not_found', approvedCount: 0, requiredApprovals: 0 };
    }
    return {
      status: request.status,
      approvedCount: request.approvedBy.length,
      requiredApprovals: request.requiredApprovals,
    };
  }

  private static async readSecureMap<T>(
    key: string,
    legacyDir: string,
  ): Promise<Record<string, T>> {
    const legacyFile = `${legacyDir}/index.json`;
    if (SecureStorage?.getItem) {
      try {
        const secureValue = await SecureStorage.getItem(key);
        if (secureValue) return this.normalizeMap<T>(JSON.parse(secureValue));
      } catch {}
    }

    try {
      if (await RNFS.exists(legacyFile)) {
        const parsed = JSON.parse(await RNFS.readFile(legacyFile, 'utf8'));
        let legacyMap: Record<string, T>;
        if (parsed?.id) {
          legacyMap = await this.readLegacyDirectoryMap<T>(legacyDir);
        } else {
          legacyMap = this.normalizeMap<T>(parsed);
        }
        return this.migrateLegacyMap(key, legacyDir, legacyMap);
      }
    } catch {}

    const legacyMap = await this.readLegacyDirectoryMap<T>(legacyDir);
    return this.migrateLegacyMap(key, legacyDir, legacyMap);
  }

  private static async writeSecureMap<T>(
    key: string,
    legacyDir: string,
    value: Record<string, T>,
  ): Promise<boolean> {
    await writeSecureJson(key, `${legacyDir}/index.json`, value, {
      secureStorage: SecureStorage,
    });
    return true;
  }

  private static async loadContactsMap(): Promise<Record<string, TrustedContact>> {
    return this.readSecureMap<TrustedContact>(CONTACTS_SECURE_KEY, this.CONTACTS_DIR);
  }

  private static async saveContactsMap(
    contacts: Record<string, TrustedContact>,
  ): Promise<boolean> {
    return this.writeSecureMap(CONTACTS_SECURE_KEY, this.CONTACTS_DIR, contacts);
  }

  private static async loadRequestsMap(): Promise<Record<string, EmergencyAccessRequest>> {
    return this.readSecureMap<EmergencyAccessRequest>(REQUESTS_SECURE_KEY, this.REQUESTS_DIR);
  }

  private static async saveRequestsMap(
    requests: Record<string, EmergencyAccessRequest>,
  ): Promise<boolean> {
    return this.writeSecureMap(REQUESTS_SECURE_KEY, this.REQUESTS_DIR, requests);
  }

  private static normalizeMap<T>(value: unknown): Record<string, T> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, any>;
    if (typeof record.id === 'string') {
      return { [record.id]: record as T };
    }
    return record as Record<string, T>;
  }

  private static async readLegacyDirectoryMap<T>(
    legacyDir: string,
  ): Promise<Record<string, T>> {
    try {
      if (!(await RNFS.exists(legacyDir))) return {};
      const files = await RNFS.readDir(legacyDir);
      const out: Record<string, T> = {};
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;
        try {
          const parsed = JSON.parse(await RNFS.readFile(file.path, 'utf8'));
          if (parsed?.id) out[parsed.id] = parsed as T;
        } catch {}
      }
      return out;
    } catch {
      return {};
    }
  }

  private static async migrateLegacyMap<T>(
    key: string,
    legacyDir: string,
    legacyMap: Record<string, T>,
  ): Promise<Record<string, T>> {
    if (!Object.keys(legacyMap).length || !SecureStorage?.setItem) {
      return legacyMap;
    }
    try {
      await this.writeSecureMap(key, legacyDir, legacyMap);
      await this.deleteLegacyJsonFiles(legacyDir);
      await SecurityModule.logSecurityEvent('emergency_legacy_storage_migrated', 'success', {
        recordCount: Object.keys(legacyMap).length,
      });
    } catch (e) {
      await SecurityModule.logSecurityEvent('emergency_legacy_storage_migrated', 'failed', {
        reason: e instanceof Error ? e.message : String(e),
      });
    }
    return legacyMap;
  }

  private static async deleteLegacyJsonFiles(legacyDir: string): Promise<void> {
    try {
      if (!(await RNFS.exists(legacyDir))) return;
      const files = await RNFS.readDir(legacyDir);
      await Promise.all(
        files
          .filter(file => file.name.endsWith('.json'))
          .map(file => RNFS.unlink(file.path).catch(() => {})),
      );
    } catch {}
  }

  private static async readLegacyRecord<T>(
    legacyDir: string,
    id: string,
  ): Promise<T | null> {
    if (!this.isSafeId(id)) return null;
    try {
      const path = `${legacyDir}/${id}.json`;
      if (!(await RNFS.exists(path))) return null;
      return JSON.parse(await RNFS.readFile(path, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private static isSafeId(value: string): boolean {
    return SAFE_EMERGENCY_ID.test(value);
  }
}

export default EmergencyAccessModule;
