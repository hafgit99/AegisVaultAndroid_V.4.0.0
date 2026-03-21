# Passkey Backend Implementation Checklist

Tarih: 21 Mart 2026
Baglanti:
- [PASSKEY_WEBAUTHN_ADR_TR.md](/f:/AegisAndroid_publish/docs/PASSKEY_WEBAUTHN_ADR_TR.md)
- [ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md](/f:/AegisAndroid_publish/docs/ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md)

## Amac

Bu checklist, full WebAuthn RP mode icin backend tarafinda uygulanmasi gereken minimum isleri siralar. Amaç, istemci hazirliklari tamamlanmis olan passkey akisini gercek relying-party dogrulamasina baglamaktir.

## Faz 1: Temel Altyapi

- [ ] RP ID ve origin listesi tanimlandi
- [ ] Production / staging ayrimi yapildi
- [ ] Challenge saklama katmani secildi
- [ ] Challenge TTL politikasi netlestirildi
- [ ] Tek kullanimlik challenge invalidation mantigi tanimlandi
- [ ] Audit log sarmali passkey endpoint'lerine baglandi

## Faz 2: Registration Options Endpoint

Hedef endpoint:
- `POST /api/webauthn/passkeys/register/options`

Checklist:
- [ ] Girdi semasi dogrulaniyor
- [ ] `accountId`, `username`, `displayName`, `rpId` alanlari sanitize ediliyor
- [ ] Challenge CSPRNG ile uretiliyor
- [ ] `requestId` uretiliyor
- [ ] `excludeCredentials` kullanicinin mevcut credential'larindan uretiliyor
- [ ] `pubKeyCredParams` kuruma/urun politikasina gore sabitleniyor
- [ ] Request kaydi challenge store'a yaziliyor
- [ ] TTL son kullanma zamani saklaniyor

## Faz 3: Registration Verify Endpoint

Hedef endpoint:
- `POST /api/webauthn/passkeys/register/verify`

Checklist:
- [ ] `requestId` challenge store'dan yukleniyor
- [ ] Request sure asimi kontrol ediliyor
- [ ] Native registration response parse ediliyor
- [ ] RP ID / origin dogrulaniyor
- [ ] Challenge esitligi dogrulaniyor
- [ ] Credential ID hesapla baglaniyor
- [ ] Public key ve signCount kaydediliyor
- [ ] Challenge tek kullanimlik kapatiliyor
- [ ] Basarili sonuc audit log'a dusuluyor
- [ ] Basarisiz verify durumlari audit log'a dusuluyor

## Faz 4: Authentication Options Endpoint

Hedef endpoint:
- `POST /api/webauthn/passkeys/auth/options`

Checklist:
- [ ] `accountId` veya ilgili kimlik girdisi dogrulaniyor
- [ ] RP ID normalize ediliyor
- [ ] Challenge uretiliyor
- [ ] `allowCredentials` kullanici credential'larindan dolduruluyor
- [ ] Request challenge store'a TTL ile kaydediliyor
- [ ] `requestId` donuluyor

## Faz 5: Authentication Verify Endpoint

Hedef endpoint:
- `POST /api/webauthn/passkeys/auth/verify`

Checklist:
- [ ] `requestId` challenge store'dan yukleniyor
- [ ] Request sure asimi kontrol ediliyor
- [ ] Authentication response parse ediliyor
- [ ] RP ID / origin / challenge kontrolu yapiliyor
- [ ] Credential ID kayitli kullaniciyla eslesiyor
- [ ] Sign count replay kontrolu yapiliyor
- [ ] Yeni sign count kaydediliyor
- [ ] Challenge tek kullanimlik kapatiliyor
- [ ] Basarili auth audit log'a dusuluyor
- [ ] Replay / mismatch / invalid response olaylari audit log'a dusuluyor

## Faz 6: Veri Modeli

Backend tarafinda tutulmasi beklenen minimum alanlar:

### Challenge Store

- [ ] `requestId`
- [ ] `challenge`
- [ ] `accountId`
- [ ] `flowType` (`registration` / `authentication`)
- [ ] `rpId`
- [ ] `expiresAt`
- [ ] `usedAt`
- [ ] `createdAt`

### Credential Store

- [ ] `credentialId`
- [ ] `accountId`
- [ ] `rpId`
- [ ] `publicKey`
- [ ] `signCount`
- [ ] `transports`
- [ ] `createdAt`
- [ ] `lastUsedAt`
- [ ] `deviceLabel`
- [ ] `revokedAt`

## Faz 7: Guvenlik Kontrolleri

- [ ] Challenge reuse engelleniyor
- [ ] Expired challenge reddediliyor
- [ ] Origin allowlist kontrolu var
- [ ] RP ID allowlist kontrolu var
- [ ] User/account baglantisi zorunlu
- [ ] Sign count dususunde risk olayi uretiliyor
- [ ] Rate limit / abuse korumasi ekli
- [ ] Hata mesajlari bilgi sizdirmiyor

## Faz 8: Gozlenebilirlik

- [ ] Registration options hit sayisi
- [ ] Registration verify basari / basarisizlik
- [ ] Authentication options hit sayisi
- [ ] Authentication verify basari / basarisizlik
- [ ] Replay/expired/origin mismatch metrikleri
- [ ] Kritik hata alarmlari

## Faz 9: Testler

Unit:
- [ ] Challenge uretiliyor
- [ ] TTL dogru setleniyor
- [ ] Expired challenge reddediliyor
- [ ] Wrong RP ID reddediliyor
- [ ] Reused challenge reddediliyor
- [ ] Sign count downgrade alarmi calisiyor

Integration:
- [ ] Register options -> verify zinciri
- [ ] Auth options -> verify zinciri
- [ ] Wrong origin
- [ ] Wrong challenge
- [ ] Wrong account binding

Pre-release:
- [ ] Staging endpoint ile Android istemci smoke test
- [ ] Pixel cihazda register/auth
- [ ] Samsung cihazda register/auth

## Faz 10: Cikis Kriteri

Bu checklist ancak su durumda tamamlanmis sayilmali:
- [ ] Dort endpoint production/staging ortaminda canli
- [ ] Challenge lifecycle log ve metrics ile izleniyor
- [ ] Android istemci staging backend ile smoke test geciyor
- [ ] En az iki fiziksel cihazda create/auth basarili
