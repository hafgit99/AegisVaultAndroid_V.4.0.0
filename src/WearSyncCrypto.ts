import { Buffer } from 'buffer';
import { SyncCryptoService, type SyncCryptoPackage } from './SyncCryptoService';

export interface WearFavoritePayload {
  id?: number;
  title: string;
  secret: string;
  issuer: string;
}

export interface WearEncryptedEnvelope {
  schema: 'wear_sync_e2e_v1';
  encrypted: true;
  alg: 'AES-256-GCM+HMAC-SHA256';
  package: SyncCryptoPackage;
}

export class WearSyncCrypto {
  static createEnvelope(
    favorites: WearFavoritePayload[],
    rootSecret: Buffer,
  ): WearEncryptedEnvelope {
    const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(
      rootSecret,
      Buffer.from('aegis_wear_sync_salt_v1'),
    );

    return {
      schema: 'wear_sync_e2e_v1',
      encrypted: true,
      alg: 'AES-256-GCM+HMAC-SHA256',
      package: SyncCryptoService.encryptAndSign(favorites, encryptionKey, authKey),
    };
  }

  static decryptEnvelope(
    envelopeJson: string,
    rootSecret: Buffer,
  ): WearFavoritePayload[] | null {
    try {
      const parsed = JSON.parse(envelopeJson) as WearEncryptedEnvelope;
      if (
        parsed?.schema !== 'wear_sync_e2e_v1' ||
        parsed?.encrypted !== true ||
        parsed?.alg !== 'AES-256-GCM+HMAC-SHA256' ||
        !parsed?.package
      ) {
        return null;
      }

      const { encryptionKey, authKey } = SyncCryptoService.deriveSubKeys(
        rootSecret,
        Buffer.from('aegis_wear_sync_salt_v1'),
      );

      const decrypted = SyncCryptoService.verifyAndDecrypt<WearFavoritePayload[]>(
        parsed.package,
        encryptionKey,
        authKey,
      );
      if (!Array.isArray(decrypted)) return null;
      return decrypted;
    } catch {
      return null;
    }
  }
}

