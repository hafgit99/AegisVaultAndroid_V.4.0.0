# Aegis Vault Android Güvenlik, Özellik ve Rakip Karşılaştırma Raporu

Tarih: 21 Mart 2026

## 1. Yönetici Özeti

Bu inceleme, `Aegis Vault Android` uygulamasının Android sürümünü yerel kod incelemesi, statik doğrulama, test çıktıları ve güncel rakip araştırması ile değerlendirmek için hazırlanmıştır.

Genel sonuç:

- Ürün, **yerel-öncelikli ve güvenlik odaklı** bir Android kasası olma yönünde güçlü bir temel atmış.
- **AES-256-GCM şifreli yedekleme, Argon2id, SQLCipher, clipboard temizleme, `FLAG_SECURE`, sertifika pinleme ve geniş import/export desteği** güçlü taraflar.
- Buna karşılık **belgelenen güvenlik modeli ile gerçek runtime davranışı arasında farklar**, **passkey akışının üretim seviyesinde tamamlanmamış görünmesi**, **lint/release disiplini eksikleri** ve **tam cihaz matrisi doğrulamasının henüz kanıtlanmamış olması** ürünü üst sınıf rakiplerin gerisine düşürüyor.

Önerilen genel puan:

- Güvenlik mimarisi: **7.6/10**
- Özellik seti: **8.1/10**
- Operasyonel olgunluk: **6.2/10**
- Genel toplam: **7.4/10**

Karar:

- Bugünkü haliyle ürün **iddialı bir açık kaynak Android vault prototipi / erken aşama ürün** seviyesinde.
- Doğrudan 1Password, Bitwarden veya Proton Pass seviyesinde “ana uygulama” olarak önermek için henüz erken.
- **Offline-first Android nişinde** ise dikkat çekici; özellikle import/export, yerel denetim ve paylaşım fikri bakımından potansiyeli yüksek.

## 2. İnceleme Kapsamı ve Yöntem

Yerel doğrulama kapsamında şunlar incelendi:

- React Native ve Android native kaynak kodu
- Manifest, Gradle, native modüller ve güvenlik ayarları
- Birim testleri ve TypeScript doğrulaması
- Güvenlik ve tehdit modeli dokümantasyonu

Çalıştırılan yerel doğrulamalar:

- `npm test -- --runInBand` -> **8/8 test paketi geçti, 69/69 test geçti**
- `npx tsc --noEmit` -> **başarılı**
- `npm run lint` -> **başarısız**, toplam **477 problem / 66 error / 411 warning**

Not:

- Bu değerlendirme ortamında fiziksel Android cihaz veya emülatör üstünde canlı E2E çalıştırma yapılmadı.
- Bu yüzden rapor, **kod + test + yapılandırma + doküman + resmi rakip kaynakları** temellidir.

## 3. Güçlü Yönler

### 3.1 Yerel veri koruma ve temel sertleştirme

Kod tabanında aşağıdaki olumlu kontroller doğrulandı:

- Android yedekleme kapalı: `android:allowBackup="false"` ([AndroidManifest.xml](/f:/AegisAndroid_publish/android/app/src/main/AndroidManifest.xml:46))
- Ekran görüntüsü / recents sızıntısına karşı `FLAG_SECURE` açık ([MainActivity.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/MainActivity.kt:15))
- Cleartext trafik kapalı ([network_security_config.xml](/f:/AegisAndroid_publish/android/app/src/main/res/xml/network_security_config.xml:3))
- Cloud Sync tarafında HTTPS zorunlu ve certificate pin kontrolü var ([CloudSyncModule.ts](/f:/AegisAndroid_publish/src/CloudSyncModule.ts:37), [CloudSyncSecureModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/CloudSyncSecureModule.kt:97))

### 3.2 Kriptografi yaklaşımı

Öne çıkan taraflar:

- Yedeklerde `AES-256-GCM` kullanımı var ([SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:2893))
- Yeni export akışında Argon2id zorunlu, eski PBKDF2 yalnızca geriye dönük import için tutulmuş ([SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:2922), [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:2997))
- Vault açılışında Argon2id ile türetilmiş SQLCipher anahtarı kullanılıyor ([SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:807), [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:825))

### 3.3 Android’e özgü kullanışlı güvenlik özellikleri

- Biyometrik kapı / device credential fallback mevcut ([SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:634))
- Brute-force denemelerine karşı artan lockout mantığı var
- Clipboard temizleme akışları uygulanmış ([Dashboard.tsx](/f:/AegisAndroid_publish/src/Dashboard.tsx:1141), [TOTPDisplay.tsx](/f:/AegisAndroid_publish/src/components/TOTPDisplay.tsx:71))
- Yerel crash logging var, üretimde gürültülü console çıktıları baskılanıyor ([AppMonitoring.ts](/f:/AegisAndroid_publish/src/AppMonitoring.ts:117))
- Audit log, password health report, sharing overview ve account hardening gibi iyi düşünülmüş yerel denetim katmanları var

### 3.4 Özellik kapsamı

Rakiplerle yarışabilecek güçlü alanlar:

- Çok sayıda rakipten import desteği
- Şifreli `.aegis` export/import
- TOTP desteği
- Android Autofill servisi
- Paylaşımlı alan / aile-ekip modeli
- Passkey metadata ve native Credential Manager entegrasyon başlangıcı

## 4. Kritik ve Orta Seviye Bulgular

### 4.1 Yüksek önem: Belgelenen biyometrik anahtar modeli ile gerçek unlock akışı birebir örtüşmüyor

Dokümanlar, biyometrik doğrulama sonrası Android Keystore temelli deterministik anahtar türetimini ana güvenlik modeli gibi anlatıyor. Kodda gerçekten böyle bir yardımcı akış var:

- biyometrik prompt: [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:634)
- saklı public key materyali: [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:647)
- public key + salt ile Argon2id: [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:675)

Ancak gerçek unlock akışı:

- UI önce `deriveKeyFromBiometric()` çağırıyor ([Dashboard.tsx](/f:/AegisAndroid_publish/src/Dashboard.tsx:315))
- sonra çıkan değeri `unlockVault(vaultKey)` içine parola gibi veriyor ([Dashboard.tsx](/f:/AegisAndroid_publish/src/Dashboard.tsx:322))
- `unlockVault()` ise biyometrik türetilmiş anahtarı doğrudan kullanmak yerine gelen girdiyi tekrar `Argon2Fn(password, salt...)` ile işliyor ([SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:807))
- buna rağmen audit log içine yöntem `biometric_derived_key` diye yazılıyor ([SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts:914))

Sonuç:

- Mimari niyet ile gerçek runtime davranışı arasında fark var.
- Bu, dış denetim veya güvenlik pazarlaması açısından sorun yaratır.
- Çözüm: unlock zinciri tek bir net modele indirilmeli ve dokümanlar bununla tam hizalanmalı.

### 4.2 Orta-yüksek önem: Passkey akışı tam üretim düzeyi WebAuthn entegrasyonu gibi görünmüyor

Passkey tarafında native Android Credential Manager köprüsü bulunuyor; bu olumlu. Ancak JS tarafındaki istek üretimi incelendiğinde challenge değeri yerel olarak üretiliyor:

- registration challenge: [PasskeyModule.ts](/f:/AegisAndroid_publish/src/PasskeyModule.ts:59)
- authentication challenge: [PasskeyModule.ts](/f:/AegisAndroid_publish/src/PasskeyModule.ts:92)

Bu yapı, gerçek sunucu tabanlı WebAuthn doğrulama akışının yerini tutmaz. Üretim kalitesinde passkey desteğinde normalde:

- challenge sunucudan gelir
- kayıt/assertion cevabı sunucuda doğrulanır
- relying party ile oturum zinciri tamamlanır

Bu nedenle mevcut modül:

- yerel passkey metadata yönetimi ve Android API köprülemesi açısından umut verici
- fakat tam anlamıyla “rakipler seviyesinde passkey platformu” olarak değerlendirilemez

### 4.3 Orta önem: HIBP önbelleği, şifreli kasanın dışında parola özetleri bırakıyor

HIBP modülü opsiyonel ve k-anonimlik kullanıyor; bu iyi. Fakat önbellek dosyası app documents altında tutuluyor:

- cache dosyası: [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts:19)
- SHA-1 türetimi: [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts:22)
- hash’in doğrudan cache anahtarı olarak kullanımı: [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts:75), [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts:150)

Bu doğrudan parolayı yazmaz; ancak:

- zayıf parolalar için sözlük eşleştirmesi yapılabilir
- kasadan bağımsız ek artefakt bırakır

Öneri:

- cache anahtarları ayrıca cihaz anahtarı ile HMAC’lenmeli
- mümkünse cache de kasanın içinde veya ayrı şifreli blob içinde tutulmalı

### 4.4 Orta önem: Release imzalama disiplini gevşek

Release build, varsayılan durumda debug signing’e düşebiliyor:

- README uyarısı: [README.md](/f:/AegisAndroid_publish/README.md:106)
- Gradle fallback: [build.gradle](/f:/AegisAndroid_publish/android/app/build.gradle:129)

Bu geliştirici kolaylığı sağlar; fakat kamuya açık dağıtım disiplininde risklidir. Üretim CI hattında `-PrequireReleaseSigning=true` zorunlu hale getirilmeli.

### 4.5 Orta önem: Test paketi geçiyor ama kapsamın önemli kısmı placeholder

Testler geçti; bu olumlu. Fakat güvenlik test dosyasında birçok test gerçek davranışı doğrulamak yerine placeholder:

- örnek placeholder satırları: [SecurityModule.test.ts](/f:/AegisAndroid_publish/__tests__/SecurityModule.test.ts:121), [SecurityModule.test.ts](/f:/AegisAndroid_publish/__tests__/SecurityModule.test.ts:452), [SecurityModule.test.ts](/f:/AegisAndroid_publish/__tests__/SecurityModule.test.ts:585)

Bu şu anlama geliyor:

- test sayısı yüksek görünse de kritik yolun bir kısmı henüz sentetik
- gerçek cihaz / native / dosya sistemi / WebAuthn / autofill / recovery regresyonları için ek kanıt gerekli

### 4.6 Orta önem: Lint kapısı kırmızı, release hijyeni zayıf

`npm run lint` başarısız oldu:

- 66 error
- 411 warning

Hata sınıfları arasında:

- kullanılmayan değişkenler
- Jest ortamında global tanım eksikleri
- hook dependency sorunları

Bu doğrudan kriptografi açığı değildir; ama bakım, refactor güvenliği ve release kalitesi için olumsuz sinyaldir.

### 4.7 Düşük-orta önem: Integrity katmanı “Play Integrity” değil, yerel heuristic tespit

README ve bazı metinlerde “Google Play Integrity” vurgusu güçlü. Kod tarafında ise native modül:

- root artifact taraması
- `test-keys`
- ADB açık mı
- emulator kontrolleri

yapıyor ([IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt:20), [IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt:24), [IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt:36)).

Bu yararlı bir katmandır; fakat gerçek Google Play Integrity / hardware-backed attestation ile aynı şey değildir. Pazarlama dili buna göre düzeltilmelidir.

## 5. Özellik ve Güvenlik Puan Kartı

| Başlık | Puan | Değerlendirme |
| --- | --- | --- |
| Kriptografi | 8.0/10 | Argon2id + AES-256-GCM + SQLCipher iyi |
| Anahtar yönetimi | 7.0/10 | Fikir güçlü, gerçek akış daha netleştirilmeli |
| Android sertleştirme | 8.0/10 | `allowBackup=false`, `FLAG_SECURE`, cleartext kapalı |
| Ağ güvenliği | 8.5/10 | Cloud Sync için HTTPS + pinning güçlü |
| Yerel gizlilik | 7.0/10 | Clipboard temizliği iyi, HIBP cache zayıflatıyor |
| Passkey | 5.5/10 | Native köprü var, uçtan uca WebAuthn olgunluğu eksik |
| Import/Export | 9.0/10 | Çok güçlü ve rakiplerden daha esnek |
| Autofill/TOTP | 8.0/10 | Android odaklı güçlü pratik özellikler |
| Test / QA | 6.0/10 | Testler geçiyor ama placeholder ve lint borcu var |
| Operasyonel yayın olgunluğu | 6.0/10 | Device matrix kanıtı ve signing disiplini güçlenmeli |

Toplam önerilen skor: **7.4/10**

## 6. Rakip Karşılaştırması

Karşılaştırma 21 Mart 2026 itibarıyla güncel resmi kaynaklar baz alınarak hazırlanmıştır.

### 6.1 Aegis Vault vs 1Password

1Password güçlü tarafları:

- Android’de olgun autofill ve passkey kullanımı var
- Watchtower güvenlik denetimleri güçlü
- Travel Mode gibi benzersiz kurumsal/seyahat güvenliği özellikleri var
- Güvenlik modeli ve operasyonel olgunluk çok daha kanıtlanmış

Aegis üstün olduğu alanlar:

- Daha “offline-first” yaklaşım
- Yerel import/export esnekliği
- Potansiyel olarak daha şeffaf ve özelleştirilebilir açık kaynak yönelim

Sonuç:

- **1Password genel olarak açık ara daha olgun ve güvenilir**
- **Aegis**, internet bağımlılığını en aza indiren yerel kullanım senaryolarında daha felsefi olarak çekici

Puan:

- 1Password: **9.2/10**
- Aegis Vault: **7.4/10**

### 6.2 Aegis Vault vs Bitwarden

Bitwarden güçlü tarafları:

- Zero-knowledge mimari ve uzun süredir oturmuş ekosistem
- Android autofill ve passkey provider akışı olgun
- Çok geniş platform ve kurumsal entegrasyon desteği
- Güçlü import ekosistemi

Aegis üstün olduğu alanlar:

- Yerel Android güvenlik merkezi yaklaşımı daha görünür
- Şifreli export/import formatı ve offline-first hissi daha belirgin
- Yerel paylaşımlı alan ve denetim yaklaşımı yenilikçi

Sonuç:

- **Bitwarden daha dengeli, daha yaygın ve güvenli seçim**
- **Aegis**, tamamen Android odaklı özel deneyim ve lokal kontrol isteyenler için ilgi çekici

Puan:

- Bitwarden: **8.8/10**
- Aegis Vault: **7.4/10**

### 6.3 Aegis Vault vs Proton Pass

Proton Pass güçlü tarafları:

- Güçlü uçtan uca şifreleme modeli
- Metadata’yı da şifreleme iddiası
- Android’de offline erişim ve passkey desteği
- Açık kaynak ve denetim vurgusu güçlü

Aegis üstün olduğu alanlar:

- Sunucusuz kullanım felsefesi daha net
- Çok daha zengin manuel import/export mantığı

Sonuç:

- **Gizlilik ve modern ekosistem entegrasyonu için Proton Pass önde**
- **Tamamen yerel Android kasası arayan nişte Aegis hâlâ anlamlı**

Puan:

- Proton Pass: **8.7/10**
- Aegis Vault: **7.4/10**

### 6.4 Aegis Vault vs KeePassDX

KeePassDX güçlü tarafları:

- Gerçek anlamda offline, dosya tabanlı, Android’de uzun süredir oturmuş bir model
- KeePass format uyumluluğu yüksek
- Biometric, TOTP, autofill, passkey ve çok algoritmalı veritabanı desteği var

Aegis üstün olduğu alanlar:

- Modern arayüz ve “ürünleşmiş” güvenlik merkezi yaklaşımı
- Cloud Sync pinning, crash log, audit log, sharing overview gibi ek katmanlar

KeePassDX zayıf tarafı:

- Açık issue geçmişi, Android autofill ve bazı biyometrik senaryolarda kırılganlık sinyalleri veriyor

Sonuç:

- **Sıkı offline ve KeePass uyumu için KeePassDX daha olgun**
- **Ürün vizyonu ve modern Android güvenlik ekranları açısından Aegis daha yenilikçi**

Puan:

- KeePassDX: **8.4/10**
- Aegis Vault: **7.4/10**

### 6.5 Aegis Vault vs Enpass

Enpass güçlü tarafları:

- Yerel/kişisel bulut temelli model
- Android’de passkey desteği ve 26 Şubat 2026 itibarıyla PRF geliştirmeleri
- Geniş platform desteği ve ticari bakım

Aegis üstün olduğu alanlar:

- Açık kaynak yönelim
- Yerel güvenlik denetim ekranları ve daha sıkı Android güvenlik anlatısı

Sonuç:

- **Enpass bugün daha olgun ticari ürün**
- **Aegis**, açık kaynak ve saf Android güvenlik yaklaşımıyla farklılaşıyor

Puan:

- Enpass: **8.1/10**
- Aegis Vault: **7.4/10**

## 7. Genel Sıralama

Bu çalışmanın kriterlerine göre genel sıralama:

1. 1Password - **9.2/10**
2. Bitwarden - **8.8/10**
3. Proton Pass - **8.7/10**
4. KeePassDX - **8.4/10**
5. Enpass - **8.1/10**
6. Aegis Vault Android - **7.4/10**

Not:

- Eğer kıstas yalnızca **tam offline ve Android yerel kontrol** ise sıralama değişebilir; o durumda KeePassDX ile Aegis birbirine daha çok yaklaşır.
- Eğer kıstas **kurumsal kullanım, passkey olgunluğu, platformlar arası güvenilirlik** ise Aegis geriye düşer.

## 8. Sonuç ve Yol Haritası Önerisi

Öncelik sırası:

1. `unlockVault()` ve biyometrik anahtar modelini tek, doğrulanabilir bir akışta birleştirin.
2. Passkey modülünü gerçek sunucu tabanlı WebAuthn kayıt/doğrulama modeli ile hizalayın.
3. HIBP cache’i şifreli veya HMAC’li hale getirin.
4. Release signing fallback davranışını public dağıtım hattında kapatın.
5. `eslint` hatalarını sıfırlayın ve lint’i release gate yapın.
6. Placeholder testleri gerçek cihaz / native / autofill / recovery / passkey E2E testlerine dönüştürün.
7. Pixel, Samsung, Xiaomi ve düşük RAM cihazlardan oluşan cihaz matrisini gerçek sonuçlarla doldurun.
8. README ve güvenlik dokümanlarında “Play Integrity” ve “biometric-derived key” ifadelerini kodla tam uyumlu hale getirin.

Son söz:

`Aegis Vault Android`, doğru yönde ilerleyen ve güçlü fikirler barındıran bir proje. Bugün için en büyük fark yaratan şey yeni özellik eklemekten çok, **mevcut güvenlik iddialarını gerçek runtime davranışıyla birebir hizalamak ve yayın kalitesini sertleştirmek** olacaktır. Bu yapıldığında proje, Android offline vault nişinde ciddi bir aday haline gelebilir.

## 9. Kaynaklar

Yerel kaynaklar:

- [README.md](/f:/AegisAndroid_publish/README.md)
- [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts)
- [CloudSyncModule.ts](/f:/AegisAndroid_publish/src/CloudSyncModule.ts)
- [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts)
- [PasskeyModule.ts](/f:/AegisAndroid_publish/src/PasskeyModule.ts)
- [IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt)
- [AndroidManifest.xml](/f:/AegisAndroid_publish/android/app/src/main/AndroidManifest.xml)

Güncel resmi rakip kaynakları:

- Bitwarden Encryption Protocols: https://bitwarden.com/help/what-encryption-is-used/
- Bitwarden Offline Usage: https://bitwarden.com/help/using-bitwarden-offline/
- Bitwarden Android Autofill / Passkeys: https://bitwarden.com/help/auto-fill-android/
- 1Password Security: https://1password.com/security/
- 1Password Android Autofill: https://support.1password.com/android-autofill/
- 1Password Travel Mode: https://support.1password.com/travel-mode/
- 1Password Passkey Unlock Beta: https://support.1password.com/passkeys/
- Proton Pass Security: https://proton.me/pass/security
- Proton Pass Security Model: https://proton.me/blog/proton-pass-security-model
- Proton Pass Offline Access: https://proton.me/support/pass-offline-access
- Proton Pass Passkeys: https://proton.me/pass/passkeys
- KeePassDX GitHub README: https://github.com/Kunzisoft/KeePassDX
- Enpass Pricing / Features: https://www.enpass.io/pricing/
- Enpass Release Notes, Android 6.11.19 (26 Şubat 2026): https://www.enpass.io/blog/release-notes/version-5-6-0-4/
