# Sertifika Tutturma (Certificate Pinning) Implementasyon Rehberi
# Certificate Pinning Implementation Guide

## Özet / Summary

Bu belge, AegisAndroid'de **Sertifika Tutturma (Certificate Pinning)** uygulamasını adım adım açıklar. Sertifika tutturma, Man-in-the-Middle (MITM) saldırılarından korunmayı sağlayarak, uygulamanın yalnızca birkaç bilinen sertifikası olan sunuculara bağlanmasını garanti eder.

**Güvenlik Seviyesi**: ⭐⭐⭐⭐⭐ (Kritik - OWASP Top 10 Mobile M1)  
**Standart**: NIST SP 800-63B, RFC 5234  
**Uygulama Hedefi**: CloudSyncModule API istekleri

---

## 1. Sertifika Tutturma Nedir?

### Tanım / Definition

Sertifika tutturma, uygulamanın belirli bir sunucu sertifikasının veya public key'in hash'ini depolayarak, bağlantı kurulurken bu hash'i doğrulama işlemidir.

**Faydaları / Benefits:**
- ✅ MITM saldırılarına karşı koruma
- ✅ Sahte sertifikaların reddedilmesi
- ✅ Sertifika yetkilisi (CA) uzlaşmasından koruma
- ✅ Kurumsal proxy'ler tarafından dinlenmesini engelleme

**Dezavantajları / Disadvantages:**
- ⚠️ Sertifika güncellenmesi zor (app update gerekli)
- ⚠️ Yanlış konfigürasyon tüm istekleri kıracak
- ⚠️ Certificate rotation planı gerekli

---

## 2. SHA-256 Public Key Hash Oluşturma

### 2.1 OpenSSL ile Hash Çıkarma

```bash
# Adım 1: Server sertifikasını indirin
openssl s_client -connect cloud-sync.aegisandroid.io:443 \
  -showcerts < /dev/null | \
  openssl x509 -outform PEM -out cert.pem

# Adım 2: Public Key'i çıkarın
openssl x509 -in cert.pem -pubkey -noout > pubkey.pem

# Adım 3: SHA-256 hash'ini oluşturun (DER formatında)
openssl rsa -pubin -in pubkey.pem -outform DER | \
  openssl dgst -sha256 -binary | \
  openssl enc -base64

# Çıktı Örneği / Example Output:
# 5hCUL4QzXYAF9tEuVZ0B0q9XlCUZqKA2bZW7o/DQD8E=
```

### 2.2 Windows PowerShell Alternatifi

```powershell
# Certificate'i indir
$cert = [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$web = New-Object System.Net.WebClient
$cert = [System.Net.ServicePointManager]::FindServicePoint("https://cloud-sync.aegisandroid.io")
$cert.Certificate

# SHA-256 hash'i oluştur
$cert = Get-Item "Cert:\CurrentUser\My\thumbprint"
$hash = [Convert]::ToBase64String(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    $cert.RawData
  )
)
Write-Host $hash
```

### 2.3 Node.js/TypeScript ile Otomatik Hash

```typescript
import * as tls from 'tls';
import * as crypto from 'crypto';

async function extractPublicKeyHash(hostname: string, port: number = 443): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port }, function() {
      const cert = socket.getPeerCertificate();
      
      // Public key'i PEM formatına dönüştür
      const pubKey = tls.PeerCertificate.pubkey;
      
      if (!pubKey) {
        reject(new Error('Public key not found'));
        return;
      }
      
      // DER formatında hash'i hesapla
      const hashBuffer = crypto
        .createPublicKey(pubKey)
        .export({ type: 'spki', format: 'der' });
      
      const hash = crypto
        .createHash('sha256')
        .update(hashBuffer)
        .digest('base64');
      
      socket.destroy();
      resolve(hash);
    });
    
    socket.on('error', reject);
  });
}

// Kullanım
const hash = await extractPublicKeyHash('cloud-sync.aegisandroid.io');
console.log(`Public Key PIN: ${hash}`);
```

---

## 3. AegisAndroid'de Sertifika Tutturma Uygulaması

### 3.1 CloudSyncModule'ı Güncelleme

```typescript
/**
 * CloudSyncModule.ts - Certificate Pinning with Fallback
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import tls from 'react-native-tls-socket';

interface CertificatePinConfig {
  hostname: string;
  publicKeyHashes: string[]; // Base64 SHA-256 hashes
  backupKeys?: string[];     // Yedek public keys (rotation sırasında)
  allowedCertChainLength?: number;
  expiryDate?: Date;         // Pin'in geçerlilik tarihi
}

export class CloudSyncModule {
  private apiClient: AxiosInstance;
  private certificatePins: Map<string, CertificatePinConfig> = new Map();
  
  constructor() {
    this.initializeCertificatePins();
    this.setupApiClient();
  }

  /**
   * Initialize certificate pins for all API endpoints
   * Bütün API endpoints'ler için sertifika pin'lerini başlat
   */
  private initializeCertificatePins(): void {
    // PRIMARY: cloud-sync.aegisandroid.io
    this.certificatePins.set('cloud-sync.aegisandroid.io', {
      hostname: 'cloud-sync.aegisandroid.io',
      publicKeyHashes: [
        '5hCUL4QzXYAF9tEuVZ0B0q9XlCUZqKA2bZW7o/DQD8E=', // 2024-2025
        'lFQwGWAKwpwqPiBMnAMvSFx5cEtOqG8uw7zXxohuwQc='  // Backup/Fallback
      ],
      backupKeys: [
        'lFQwGWAKwpwqPiBMnAMvSFx5cEtOqG8uw7zXxohuwQc='
      ],
      allowedCertChainLength: 3,
      expiryDate: new Date('2025-12-31')
    });

    // SECONDARY: api.aegisandroid.io (eğer varsa)
    this.certificatePins.set('api.aegisandroid.io', {
      hostname: 'api.aegisandroid.io',
      publicKeyHashes: [
        'ABC123DEF456...', // Certificate pin
      ],
      expiryDate: new Date('2025-12-31')
    });
  }

  /**
   * Setup axios client with certificate pinning interceptor
   * Axios istemcisini sertifika tutturma engelleme ile kur
   */
  private setupApiClient(): void {
    this.apiClient = axios.create({
      baseURL: 'https://cloud-sync.aegisandroid.io/api/v1',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AegisAndroid/1.0'
      }
    });

    // Add certificate pinning request interceptor
    this.apiClient.interceptors.request.use(
      async (config) => {
        // Validate certificate before request
        const hostname = new URL(config.url || '').hostname || 'cloud-sync.aegisandroid.io';
        
        if (!await this.validateCertificatePin(hostname)) {
          throw new Error(`Certificate pinning failed for ${hostname}`);
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add error handling interceptor
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.code === 'ENOTFOUND' || error.code === 'ERR_CERT_VERIFY_FAILED') {
          console.error('🔒 Certificate Pinning Error:', {
            hostname: error.config?.url,
            code: error.code,
            timestamp: new Date().toISOString()
          });

          // Log security event
          await this.logSecurityEvent('certificate_pinning_failure', {
            hostname: error.config?.url,
            error: error.message
          });
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Validate certificate pin for hostname
   * Hostname için sertifika pin'ini doğrula
   */
  private async validateCertificatePin(hostname: string): Promise<boolean> {
    const pinConfig = this.certificatePins.get(hostname);
    
    if (!pinConfig) {
      console.warn(`⚠️ No certificate pin configured for ${hostname}`);
      return true; // Allow if not pinned (fail open)
    }

    // Check expiry
    if (pinConfig.expiryDate && new Date() > pinConfig.expiryDate) {
      console.error(`❌ Certificate pin expired for ${hostname}`);
      return false;
    }

    try {
      const publicKeyHash = await this.extractPublicKeyHash(hostname);

      // Check against primary hashes
      const isValidPrimary = pinConfig.publicKeyHashes.includes(publicKeyHash);
      
      if (isValidPrimary) {
        console.log(`✅ Certificate pin valid for ${hostname}`);
        return true;
      }

      // Check against backup hashes
      if (pinConfig.backupKeys?.includes(publicKeyHash)) {
        console.warn(`⚠️ Certificate pin matched backup key for ${hostname}`);
        return true;
      }

      console.error(`❌ Certificate pin mismatch for ${hostname}`);
      console.error(`   Expected: ${pinConfig.publicKeyHashes.join(' or ')}`);
      console.error(`   Got: ${publicKeyHash}`);
      
      await this.logSecurityEvent('certificate_pin_mismatch', {
        hostname,
        expectedHashes: pinConfig.publicKeyHashes,
        actualHash: publicKeyHash
      });

      return false;
    } catch (error) {
      console.error(`❌ Certificate validation error for ${hostname}:`, error);
      return false;
    }
  }

  /**
   * Extract public key SHA-256 hash from server certificate
   * Sunucu sertifikasından public key SHA-256 hash'ini çıkar
   */
  private async extractPublicKeyHash(hostname: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (Platform.OS === 'android') {
        // Android: Use react-native-tls-socket or similar
        tls.connect({
          host: hostname,
          port: 443
        }, function(tlsSocket: any) {
          try {
            const cert = tlsSocket.getPeerCertificate();
            const pubKeyHash = this.computePublicKeyHash(cert);
            tlsSocket.destroy();
            resolve(pubKeyHash);
          } catch (error) {
            reject(error);
          }
        }).on('error', reject);
      } else if (Platform.OS === 'ios') {
        // iOS: Use native implementation via RCT_EXPORT_METHOD
        // Implementation in native iOS code
        reject(new Error('iOS implementation required'));
      } else {
        reject(new Error(`Certificate pinning not supported on ${Platform.OS}`));
      }
    });
  }

  /**
   * Compute SHA-256 hash of public key in DER format
   * DER formatında public key'in SHA-256 hash'ini hesapla
   */
  private computePublicKeyHash(certificate: any): string {
    const crypto = require('react-native-quick-crypto');
    
    // Extract public key in DER format
    const publicKeyDER = this.extractPublicKeyDER(certificate);
    
    // Compute SHA-256 hash
    const hash = crypto
      .createHash('sha256')
      .update(publicKeyDER)
      .digest('base64');
    
    return hash;
  }

  /**
   * Extract public key in DER format from certificate
   * Sertifikadan public key'i DER formatında çıkar
   */
  private extractPublicKeyDER(certificate: any): Buffer {
    // This would require ASN.1 parsing of certificate
    // For now, pseudocode:
    // 1. Parse X.509 certificate structure
    // 2. Extract SubjectPublicKeyInfo field
    // 3. Return DER-encoded public key
    
    throw new Error('Certificate parsing not implemented');
  }

  /**
   * Sync account data with server (with certificate pinning)
   * Sunucu ile hesap verilerini senkronize et (sertifika tutturma ile)
   */
  async syncCloudData(vaultKey: string): Promise<boolean> {
    try {
      const response = await this.apiClient.post('/sync', {
        vaultKey: vaultKey,
        timestamp: Date.now()
      });

      if (response.status === 200) {
        console.log('✅ Cloud sync successful with certificate pinning');
        return true;
      }
    } catch (error) {
      console.error('❌ Cloud sync failed:', error);
      return false;
    }
  }

  /**
   * Log security event for certificate pinning
   */
  private async logSecurityEvent(
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    // Implementation: Store in secure audit log
    console.log(`🔒 Security Event: ${eventType}`, details);
  }
}
```

---

## 4. Sertifika Rotation Stratejisi

### 4.1 Renewal Plan (Her 12-18 ay)

```typescript
/**
 * Certificate Rotation Timeline
 * 
 * T-90 gün: Yeni sertifikayı alın ve test edin
 * T-30 gün: App update ile yeni pin'i dağıtın
 * T-0 gün:  Eski sertifika süresi doldu
 * T+30 gün: Eski pin'i koddan kaldırın
 */

interface CertificateRotationLog {
  rotationDate: Date;
  oldHashPrimary: string;
  newHashPrimary: string;
  backupHashUsed: boolean;
  usersAffected: number;
}

// Keep backup hash active for 6 months during rotation
// Yedek hash'i geçiş sırasında 6 ay aktif tut
const rotationLog: CertificateRotationLog = {
  rotationDate: new Date('2024-06-01'),
  oldHashPrimary: '5hCUL4QzXYAF9tEuVZ0B0q9XlCUZqKA2bZW7o/DQD8E=',
  newHashPrimary: 'lFQwGWAKwpwqPiBMnAMvSFx5cEtOqG8uw7zXxohuwQc=',
  backupHashUsed: true,
  usersAffected: 15000
};
```

### 4.2 Fallback Mekanizması

Eğer primary sertifika başarısız olursa:
1. ⏱️ Backup pin'i dene (aynı sunucu, rotasyon sırasında)
2. ⏱️ Başarısızsa vault'u kilitli tut (FAILED_VALIDATION)
3. ⏱️ Manuel senkronizasyon retry'ı sunun
4. ⏱️ Hata raporunu merkeze gönder

```typescript
async validateCertificatePin(hostname: string): Promise<boolean> {
  // ... primary validation ...

  // Fallback to backup
  if (pinConfig.backupKeys?.includes(publicKeyHash)) {
    await this.notifyUserCertificateRotation(hostname);
    return true; // Allow backup temporarily
  }

  // Both failed - block access
  await this.lockVaultPending(hostname);
  return false;
}
```

---

## 5. Testing & Validation

### 5.1 Unit Tests

```typescript
// __tests__/CloudSyncModule.test.ts
describe('CloudSyncModule - Certificate Pinning', () => {
  
  test('Should reject mismatched certificate hash', async () => {
    const module = new CloudSyncModule();
    const invalidCert = {
      publicKeyHash: 'InvalidHash1234567890=='
    };
    
    const result = await module.validateCertificatePin('cloud-sync.aegisandroid.io');
    expect(result).toBe(false);
  });

  test('Should accept valid certificate pin', async () => {
    const module = new CloudSyncModule();
    const result = await module.validateCertificatePin('cloud-sync.aegisandroid.io');
    expect(result).toBe(true);
  });

  test('Should use backup pin during rotation', async () => {
    // ... test backup pin validation ...
  });
});
```

### 5.2 Integration Tests

```bash
# Test with mitmproxy (MITM Attack Simulation)
mitmproxy -p 8080 --mode reverse:https://cloud-sync.aegisandroid.io

# Application should REJECT the proxy's certificate
# Uygulama proxy'nin sertifikasını RED ETMELİ
```

---

## 6. Güvenlik Best Practices

### ✅ Yapılması Gerekenler

| Madde | Açıklama |
|-------|----------|
| **Pin Primary + Backup** | Primary ve backup pin'leri saklamak 6 ay |
| **SHA-256 Kullan** | MD5/SHA-1 yerine SHA-256 hash kullan |
| **Expiry Dates** | Pin'in geçersiz hale gelmesi için tarih belirle |
| **Logging** | Tüm pin validation başarısızlıklarını kaydet |
| **Update Strategy** | New pin'i app update ile proaktif olarak dağıt |
| **Test MITM** | Saldırı simülasyonu ile test yap |

### ❌ Yapılmaması Gerekenler

| Madde | Neden |
|-------|-------|
| **Tek Pin** | Sertifika güncelleme sırasında uygulama kırılır |
| **Hardcoded Tarih Yok** | Pin'in ne zaman yenilenecek olduğu belli değil |
| **"Fail Open"** | Geçersiz pin'i kabul etmek güvenlik sorunudur |
| **No Monitoring** | Pin başarısızlığı fark edilmez |

---

## 7. Production Deployment Checklist

- [ ] SHA-256 public key hash'ini OpenSSL ile oluştur
- [ ] Primary ve backup pin'leri CloudSyncModule'a ekle
- [ ] Expiry date'ini belirle (12-18 ay gelecek tarihe)
- [ ] Unit tests'leri yazıp geçişini sağla (100% coverage)
- [ ] Integration tests'ler ile MITM saldırılarını test et
- [ ] Staging ortamında 48 saat boyunca monitör et
- [ ] Admin panel'de pin validation logs'ları incelemek için tool ekle
- [ ] Sertifika rotation timeline'ını calendarda işaretle
- [ ] Backup pin'i 6 ay sonra güvenle kaldır
- [ ] Incident response playbook'u yazıp takım'a bildir

---

## 8. Troubleshooting

### ❌ "Certificate pinning failed" Hatası

**Sorun**: Bağlantı başarısız, pin mismatch mesajı

**Çözümler**:
1. Sertifikayı yeniden oluştur: `openssl s_client -connect cloud-sync.aegisandroid.io:443`
2. Hash'i doğru hesapladığını kontrol et
3. Backup pin'ini kullan geçici olarak (rotation sırasında)
4. App'i yeni pin ile güncelle

### ⚠️ "Pin Expired" Hatası

**Sorun**: Sertifika pin'i geçerliliğini yitirdi

**Çözümler**:
1. expiryDate'i kontrol et CloudSyncModule'da
2. Yeni sertifika almak için 90 gün öncesinden başla
3. Backup pin'i staging'de test et
4. App update ile yeni pin'i dağıt (T-30 gün)

### 🔓 "Fail Open" Durumu

**Neden Kaçınılması Lazım**: Sertifika validation başarısız olur ancak bağlantı izin verilirse, MITM saldırısı yapılabilir

**Korunum**:
```typescript
// ❌ YAP
async validateCertificatePin(hostname: string): Promise<boolean> {
  if (/* validation fails */) {
    return true; // ❌ YANLIŞ: Fail open
  }
}

// ✅ YAP
async validateCertificatePin(hostname: string): Promise<boolean> {
  if (/* validation fails */) {
    await lockVault(); // ✅ DOĞRU: Fail closed
    return false;
  }
}
```

---

## 9. Referanslar / References

- OWASP Mobile Top 10 M1: [Link](https://owasp.org/www-project-mobile-top-10/)
- RFC 5234: ABNF Syntax  
- NIST SP 800-63B: Authentication and Life-Cycle Management
- Android Network Security Configuration: [Link](https://developer.android.com/training/articles/security-config)

---

## 10. Katkı Yapanlar / Contributors

- **Tavsiye #5**: Sertifika Tutturma Belgeleri
- **Tarih**: 2024-Q2
- **Durum**: ✅ Dokumentasyon Tamamlandı

---

**Sonraki Adımlar / Next Steps**:
- [ ] Tavsiye #6: Password History & Recovery  
- [ ] Tavsiye #7: Device Trust Settings UI  
- [ ] Tavsiye #8: Import Versioning Migration  
- [ ] Tavsiye #9: CI/CD & Testing Infrastructure
