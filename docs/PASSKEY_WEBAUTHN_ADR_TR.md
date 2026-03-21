# Passkey WebAuthn Uretim Entegrasyonu ADR

Tarih: 21 Mart 2026
Durum: Onerilen
Kapsam: Android passkey helper modundan full relying-party WebAuthn modeline gecis

## 1. Problem

Mevcut Android passkey akisi:
- Native Credential Manager koprusunu kullaniyor
- RP ID, credential ID ve user handle metadata'sini yerelde normalize ediyor
- Server challenge verilmezse yerel fallback challenge ile calisabiliyor

Bu faydali bir `helper / local metadata` modu sagliyor; ancak tek basina su garantileri vermez:
- server tarafli challenge dogrulamasi
- relying party oturum zinciri
- replay korumasi icin merkezi challenge yasam dongusu
- credential kayit ve auth sonucunun server tarafinda baglayici dogrulanmasi

Bu nedenle uretim seviyesi passkey destegi icin istemci, native kopru ve relying party backend arasinda net bir sozlesme gerekir.

## 2. Karar

Aegis Vault iki ayri mod tanimlamalidir:

1. `Local Helper Mode`
2. `Full WebAuthn RP Mode`

Karar:
- Varsayilan offline deneyim `Local Helper Mode` olarak kalabilir
- Ancak uretim / kurumsal / hesap tabanli passkey iddialari sadece `Full WebAuthn RP Mode` icin kullanilmalidir

## 3. Hedef Mimari

### 3.1 Kayit Akisi

1. Kullanici passkey kaydi baslatir
2. Uygulama backend'den registration options alir
3. Backend challenge, rp, user, timeout, excludeCredentials ve policy alanlarini dondurur
4. Android istemci bunu Credential Manager uyumlu request'e cevirir
5. Native create sonucu backend'e geri gonderilir
6. Backend attestation/registration response'u dogrular
7. Backend credential kaydini hesabin kimligine baglar
8. Istemci yalnizca gerekli metadata'yi kasaya kaydeder

### 3.2 Dogrulama Akisi

1. Kullanici auth baslatir
2. Uygulama backend'den authentication options alir
3. Backend challenge, rpId, allowCredentials, timeout ve UV policy dondurur
4. Android istemci native auth akisini calistirir
5. Native response backend'e gonderilir
6. Backend assertion response'u dogrular
7. Backend challenge'i tek kullanimlik kapatir
8. Istemci sonucu sadece durum/metadata notu olarak gunceller

## 4. API Sozlesmesi

### 4.1 Registration Options

`POST /api/webauthn/passkeys/register/options`

Request:

```json
{
  "accountId": "acc_123",
  "username": "user@example.com",
  "displayName": "User Example",
  "rpId": "example.com",
  "deviceLabel": "Pixel 8"
}
```

Response:

```json
{
  "requestId": "req_reg_123",
  "publicKey": {
    "challenge": "BASE64URL_SERVER_CHALLENGE",
    "rp": {
      "id": "example.com",
      "name": "Example"
    },
    "user": {
      "id": "BASE64URL_USER_ID",
      "name": "user@example.com",
      "displayName": "User Example"
    },
    "pubKeyCredParams": [
      { "type": "public-key", "alg": -7 },
      { "type": "public-key", "alg": -257 }
    ],
    "timeout": 180000,
    "attestation": "none",
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "residentKey": "required",
      "userVerification": "preferred"
    },
    "excludeCredentials": []
  }
}
```

### 4.2 Registration Verify

`POST /api/webauthn/passkeys/register/verify`

Request:

```json
{
  "requestId": "req_reg_123",
  "credentialResponseJson": "{...native registration response...}",
  "deviceLabel": "Pixel 8"
}
```

Response:

```json
{
  "verified": true,
  "credentialId": "BASE64URL_CREDENTIAL_ID",
  "rpId": "example.com",
  "signCount": 0
}
```

### 4.3 Authentication Options

`POST /api/webauthn/passkeys/auth/options`

Request:

```json
{
  "accountId": "acc_123",
  "rpId": "example.com"
}
```

Response:

```json
{
  "requestId": "req_auth_123",
  "publicKey": {
    "challenge": "BASE64URL_SERVER_CHALLENGE",
    "rpId": "example.com",
    "timeout": 180000,
    "userVerification": "preferred",
    "allowCredentials": [
      {
        "id": "BASE64URL_CREDENTIAL_ID",
        "type": "public-key",
        "transports": ["internal"]
      }
    ]
  }
}
```

### 4.4 Authentication Verify

`POST /api/webauthn/passkeys/auth/verify`

Request:

```json
{
  "requestId": "req_auth_123",
  "credentialResponseJson": "{...native authentication response...}"
}
```

Response:

```json
{
  "verified": true,
  "accountId": "acc_123",
  "credentialId": "BASE64URL_CREDENTIAL_ID",
  "signCount": 42
}
```

## 5. Istemci Tarafinda Gerekli Degisiklikler

### 5.1 PasskeyModule

Eklenmeli:
- `buildRegistrationRequestFromServer(publicKeyOptions)`
- `buildAuthenticationRequestFromServer(publicKeyOptions)`
- `parseServerOptions()` benzeri dogrulama yardimcilari

Korunmali:
- Mevcut local helper fallback

Ama sinirlandirilmali:
- Local fallback sadece offline/local helper modunda kullanilmali
- Full RP modunda server challenge yoksa akis baslamamali

### 5.2 UI

Passkey ekraninda mod net gorunmeli:
- `Local Helper Mode`
- `Connected RP Mode`

Gosterilmesi gereken bilgiler:
- RP ID
- challenge kaynagi: `server` veya `local helper`
- son kayit / son auth durumu
- bu kaydin sadece metadata mi yoksa server-verified mi oldugu

### 5.3 Vault Metadata

Kasa icinde su alanlar tutulabilir:

```json
{
  "rp_id": "example.com",
  "credential_id": "BASE64URL",
  "user_handle": "BASE64URL",
  "transport": "internal",
  "display_name": "Example Passkey",
  "mode": "local_helper",
  "server_verified": false,
  "last_registration_at": "2026-03-21T12:00:00.000Z",
  "last_auth_at": "2026-03-21T12:10:00.000Z"
}
```

Full RP modunda:
- `mode = "rp_connected"`
- `server_verified = true`

## 6. Backend Tarafinda Zorunlu Kontroller

Backend asagidaki kontrolleri yapmalidir:
- challenge tek kullanimlik olmali
- challenge TTL kisitli olmali
- rpId ve origin dogrulanmali
- credential replay engellenmeli
- signCount mantigi uygulanmali
- hesap-kimlik baglantisi net tutulmali
- basarisiz verify olaylari audit log'a dusmeli

## 7. Guvenlik Sinirlari

Bu mimari ile:
- Android Credential Manager kullanimi tek basina yeterli sayilmaz
- Guven, ancak server challenge ve response verify ile tamamlanir
- Yerel metadata, kimlik dogrulamanin yerine gecmez

Bu nedenle pazarlama ve dokumantasyon dili:
- `local helper`
- `server-verified passkey`

ayrimini korumalidir.

## 8. Gecis Plani

### Faz 1

- Mevcut helper modu koru
- Server challenge alan request builder'lari ekle
- UI'da mod bilgisini goster

### Faz 2

- Backend options/verify endpoint'lerini tanimla
- Android istemciyi endpoint'lerle bagla
- Server verified metadata yaz

### Faz 3

- Release readiness icin gercek cihaz matrisi doldur
- Pixel ve Samsung uzerinde create/auth/regression kanitlarini topla
- Local helper ve RP mode farklarini kullanici dokumanina islet

## 9. Test Stratejisi

Unit:
- server challenge varsa local fallback kullanilmamali
- malformed options reddedilmeli

Integration:
- options al -> native create/auth -> verify gonder zinciri
- verify fail durumlarinda metadata yanlis pozitif olmamali

Device:
- Pixel Android 15
- Samsung Android 14
- Xiaomi Android 14

Mutlaka dogrulanacak:
- native sheet cancel
- expired challenge
- wrong rpId
- allowCredentials mismatch
- server verify fail

## 10. Basari Olcutu

Bu ADR ancak su durumda tamamlanmis sayilmali:
- istemci local helper ve RP mode ayrimini kodda acikca tasiyor
- backend challenge/verify sozlesmesi uygulanmis oluyor
- UI server-verified durumu gosterebiliyor
- gercek cihazlarda create/auth akisi kanitlarla dogrulaniyor
