# Aegis Vault Android İnceleme ve Rakip Raporu

Tarih: 14 Nisan 2026

## 1. Kapsam

Bu rapor, yerel Android kod tabanının ayrıntılı incelemesine dayanır. İnceleme sırasında özellikle şu alanlar değerlendirildi:

- şifreleme ve anahtar yönetimi
- yerel veri saklama
- senkronizasyon güvenliği
- passkey / donanım anahtarı akışları
- otomatik doldurma
- yedekleme ve dışa aktarma
- ürün olgunluğu ve rakiplerle karşılaştırma

Not:

- Android incelemesi doğrudan yerel kaynak koda dayanır.
- Kullanıcının paylaştığı masaüstü GitHub repo içeriğine bu oturumda doğrudan kod düzeyinde erişemedim; masaüstü karşılaştırması için Aegis Vault resmi ürün sayfasındaki açık özellik beyanlarını kullandım.

## 2. Kısa Yönetici Özeti

Aegis Vault Android teknik olarak iddialı bir proje. Yerel-öncelikli mimari, SQLCipher kullanımı, Argon2id, Android Keystore, biyometrik açma, otomatik doldurma, TOTP, passkey, HIBP, paylaşım ve senkronizasyon gibi alanlarda rakiplerine yaklaşan zengin bir kapsam var.

Bu raporun ilk sürümünde öne çıkan 5 kritik bulgu vardı. 14 Nisan 2026 itibarıyla bunların önemli bölümü kod seviyesinde ele alındı:

1. Relay sync native köprü eksikliği giderildi.
2. `PasswordHistoryModule` audit export akışı gerçek şifrelemeye taşındı.
3. Play Integrity token’ının genel JS sinyal yüzeyine sızması kaldırıldı.
4. Autofill debug logları release build yüzeyinden düşürüldü.
5. Plaintext export için private storage tercihi ve kullanıcı uyarısı güçlendirildi.

Kısa sonuç:

- Güvenlik mimarisi niyeti güçlü
- Uygulama kapsamı etkileyici
- Uygulama olgunluğu önceki değerlendirmeye göre yükseldi
- Kritik güvenlik açıklarının önemli kısmı kapatıldı
- Kalan ana ihtiyaç, gerçek cihaz / release doğrulama kanıtının tamamlanması

## 3. Genel Puanlama

| Alan | Önceki | Güncel | Yorum |
|---|---:|---:|---|
| Kriptografi temeli | 8.5/10 | 8.9/10 | AES-256-GCM, Argon2id, SQLCipher, Keystore çizgisi güçlü; audit export tarafı da düzeltildi |
| Yerel gizlilik yaklaşımı | 8.0/10 | 8.7/10 | offline-first çizgi güçlü; plaintext export private storage öncelikli ve parola geçmişi artık SQLCipher içinde tutuluyor |
| Senkronizasyon güvenliği | 5.5/10 | 7.4/10 | tasarım iyi; native JSON köprüsü eklendi, risk artık entegrasyon yerine cihaz üstü doğrulama seviyesinde |
| Passkey / modern auth | 6.5/10 | 6.8/10 | Android tarafı var; fakat tam RP-doğrulamalı ürün olgunluğu hâlâ sınırlı |
| Özellik zenginliği | 8.7/10 | 8.8/10 | kategori, TOTP, paylaşım, sağlık raporu, kurtarma, sync, autofill güçlü |
| Ürün olgunluğu | 6.4/10 | 7.7/10 | daha önce yarım kalan bazı kritik güvenlik köşeleri kapatıldı; veri yerleşimi ile beyan da artık hizalandı |
| Rakiplere karşı toplam rekabet gücü | 7.0/10 | 7.8/10 | hâlâ niş güçlü ürün; ancak güvenlik uygulama kalitesi ve iç tutarlılık belirgin şekilde iyileşti |
| Genel not | 7.2/10 | 8.1/10 | artık “güçlü potansiyel” değil, “olgunlaşan güçlü ürün”; yine de release/device validation gerekli |

## 4. Güçlü Yönler

- Yerel kasa yaklaşımı güçlü: [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts)
- SQLCipher tabanlı veri saklama ve ayarların SQLCipher içine taşınması olumlu: [SecureAppSettings.ts](/f:/AegisAndroid_publish/src/SecureAppSettings.ts)
- Android Keystore ve biyometrik akış düşünülmüş: [SecureStorageModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/SecureStorageModule.kt)
- `FLAG_SECURE` uygulanmış: [MainActivity.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/MainActivity.kt:15)
- HIBP tarafında k-anonimlik ve cache anahtarını HMAC ile gizleme yaklaşımı iyi: [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts:19)
- Android autofill servisi ciddi emek içeriyor ve tarayıcı uyumluluğu gözetilmiş: [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt)
- Test kapsamı yüzeyde zayıf görünmüyor; örnek kritik testler geçiyor:
  - `__tests__/SyncManager.test.ts`
  - `__tests__/PasswordHistoryModule.test.ts`
  - `__tests__/HardwareKeyModule.test.ts`

## 5. Öncelikli Bulgular

### 5.1 Durum Güncellemesi: Çözüldü, cihaz üstü doğrulama bekleniyor

İlk bulgu:

- TypeScript katmanı `CloudSyncSecure.postJson` ve `CloudSyncSecure.getJson` bekliyor: [SyncManager.ts](/f:/AegisAndroid_publish/src/SyncManager.ts:101), [SyncManager.ts](/f:/AegisAndroid_publish/src/SyncManager.ts:137)
- Gerçek Android native modülde yalnızca `uploadFile` ve `downloadFile` var: [CloudSyncSecureModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/CloudSyncSecureModule.kt)
- Testler de var olmayan `postJson/getJson` metodlarını mock’layarak başarılı görünüyor: [SyncManager.test.ts](/f:/AegisAndroid_publish/__tests__/SyncManager.test.ts:17)

Yapılan düzeltme:

- Android native köprüye gerçek `postJson()` ve `getJson()` metodları eklendi: [CloudSyncSecureModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/CloudSyncSecureModule.kt)
- `SyncManager` beklentisi ile native implementasyon artık hizalı.
- İlgili Jest regresyon testi tekrar doğrulandı: [SyncManager.test.ts](/f:/AegisAndroid_publish/__tests__/SyncManager.test.ts)

Güncel etki:

- Önceki “doğrudan entegrasyon açığı” riski büyük ölçüde kapandı.
- Kalan risk, gerçek cihaz ve gerçek relay endpoint üzerinde pinning/doğrulama kanıtının tamamlanmamış olmasıdır.

Durum:

- Kod düzeyinde: `Çözüldü`
- Release / saha doğrulaması: `Bekliyor`

İlgili doğrulama planı:

- [ANDROID_GUVENLIK_DOGRULAMA_PLANI_2026_04_14_TR.md](/f:/AegisAndroid_publish/docs/ANDROID_GUVENLIK_DOGRULAMA_PLANI_2026_04_14_TR.md)

### 5.2 Durum Güncellemesi: Çözüldü

İlk bulgu:

- `encryptWithPassword()` içinde açıkça placeholder bırakılmış: [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:675)
- Kod içinde “Would use Argon2 module in production” yorumu var: [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:683)
- Bu akış, salt ile plaintext’i birleştirip base64’e çeviriyor; bu gerçek şifreleme değil.

Yapılan düzeltme:

- Audit export akışı gerçek `AES-256-GCM + Argon2id` modeline geçirildi: [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts)
- Export artık `SecurityModule.encryptAES256GCM()` üzerinden üretiliyor.
- Audit export başarı/başarısızlık logları da iyileştirildi.

Güncel etki:

- Önceki doğrudan güvenlik açığı kapandı.
- Bu alan artık yüksek risk kategorisinden çıktı.

Durum:

- `Çözüldü`

### 5.3 Durum Güncellemesi: Çözüldü

İlk bulgu:

- Native katman token’ı map içine koyuyor: [IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt:227)
- JS wrapper da bunu aynen dışarı aktarıyor: [IntegrityModule.ts](/f:/AegisAndroid_publish/src/IntegrityModule.ts:83)

Yapılan düzeltme:

- Genel integrity sinyal nesnesinden ham token kaldırıldı: [IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt), [IntegrityModule.ts](/f:/AegisAndroid_publish/src/IntegrityModule.ts)
- Token yalnızca özel attestation akışında kullanılıyor.
- Bu davranış için ayrı Jest testi eklendi: [IntegrityModule.test.ts](/f:/AegisAndroid_publish/__tests__/IntegrityModule.test.ts)

Güncel etki:

- JS yüzeyindeki gereksiz token maruziyeti kapatıldı.

Durum:

- `Çözüldü`

### 5.4 Durum Güncellemesi: Büyük ölçüde çözüldü

İlk bulgu:

- Autofill servisinde sürekli `Log.d` çağrıları var: [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt:36), [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt:48), [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt:100), [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt:162)

Yapılan düzeltme:

- Autofill logları `BuildConfig.DEBUG` arkasına alındı: [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt)
- Release yüzeyinde log gürültüsü ve metadata sızıntısı azaltıldı.

Güncel etki:

- Doğrudan parola sızmasa da kullanım metadatası, eşleşme sayısı, kasa kilit durumu gibi bilgiler logcat üzerinden görülebilir.
- Bu risk artık esasen debug build ile sınırlı.
- Release build’de cihaz üstü logcat doğrulaması yine de yapılmalı.

Durum:

- Kod düzeyinde: `Büyük ölçüde çözüldü`
- Release logcat doğrulaması: `Bekliyor`

### 5.5 Durum Güncellemesi: Çözüldü, legacy geçiş uyumluluğu korunuyor

İlk bulgu:

- Modül açıklaması SQLCipher diyordu, fakat parola geçmişi `DocumentDirectoryPath` altında dosya tabanlı tutuluyordu.
- Ayrı master seed dosyası da aktif yazma yolunun parçasıydı.
- Bu durum, ürün beyanı ile gerçek veri yerleşimi arasında tutarsızlık yaratıyordu.

Yapılan düzeltme:

- Parola geçmişi için kalıcı yazma/okuma akışı gerçek SQLCipher tablo yapısına taşındı: [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:56), [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:154), [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:739)
- Eski dosya tabanlı kayıtlar ilk okumada otomatik migrate ediliyor ve başarılı geçişten sonra legacy dosya temizleniyor: [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:547)
- Modül özeti de gerçek davranışa uyacak şekilde güncellendi; RNFS artık yalnızca legacy migration uyumluluğu için kullanılıyor: [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts:810)

Güncel etki:

- Tasarım beyanı ile gerçek veri katmanı artık hizalı.
- Güvenlik denetimi ve ürün güvenilirliği açısından daha profesyonel bir temel oluştu.
- Legacy seed/dosya mantığı yalnızca eski veriyi açıp taşımak için kaldığı için risk yüzeyi belirgin biçimde küçüldü.

Durum:

- Kod düzeyinde: `Çözüldü`
- Legacy veriden SQLCipher'a geçiş testi: `Geçti`
- Keystore ile legacy seed wrap iyileştirmesi: `Gelecek sürüm için ek sertleştirme adayı`

### 5.6 Durum Güncellemesi: Büyük ölçüde çözüldü

İlk bulgu:

- Export dizini önceliğinde `DownloadDirectoryPath` ve `ExternalDirectoryPath` var: [BackupModule.ts](/f:/AegisAndroid_publish/src/BackupModule.ts:137)
- Düz CSV ve JSON export ayrı fonksiyonlarla üretiliyor: [BackupModule.ts](/f:/AegisAndroid_publish/src/BackupModule.ts:1037), [BackupModule.ts](/f:/AegisAndroid_publish/src/BackupModule.ts:1064)

Yapılan düzeltme:

- Export tarafında private storage önceliği getirildi: [BackupModule.ts](/f:/AegisAndroid_publish/src/BackupModule.ts)
- TR/EN destekli ve koyu mod uyumlu plaintext export uyarı modalı eklendi: [BackupModal.tsx](/f:/AegisAndroid_publish/src/components/BackupModal.tsx), [tr.json](/f:/AegisAndroid_publish/src/locales/tr.json), [en.json](/f:/AegisAndroid_publish/src/locales/en.json)
- Private storage tercihi testlerle doğrulandı: [BackupModule.test.ts](/f:/AegisAndroid_publish/__tests__/BackupModule.test.ts)

Güncel etki:

- Kullanıcı bunu bilerek yapıyor olabilir, fakat varsayılan olarak daha geniş erişimli klasöre düşmesi gizlilik açısından sert bir tercih.
- Bu risk artık varsayılan davranış seviyesinde önemli ölçüde azaltıldı.
- Kalan risk, kullanıcının dosyayı daha sonra manuel olarak paylaşması veya taşımasıdır.

Durum:

- Kod düzeyinde: `Büyük ölçüde çözüldü`
- Kullanıcı davranışı kaynaklı residual risk: `Devam ediyor`

## 6. Masaüstü Sürüm ile Karşılaştırma

Masaüstü ürün sayfasında öne çıkan başlıca vaatler:

- offline breach detection
- QR code sharing
- CLI interface
- memory page locking
- BYOC sync
- browser extension ekosistemi
- FIDO2/WebAuthn ve YubiKey desteği

Kaynak:

- https://hetech-me.space/index-En.html

Öne çıkan masaüstü iddiaları:

- offline breach detection: satır 86-89
- QR code sharing: satır 102-104
- CLI: satır 115-117
- memory page locking: satır 119-121
- BYOC sync: satır 155-158

Android’de durum:

- Android’de breach kontrolü var ama offline yerel leak veritabanı yerine HIBP ağına gidiyor: [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts:177)
- Android’in güçlü olduğu alanlar:
  - autofill
  - cihaz bütünlüğü kontrolü
  - biyometrik açma
  - mobil kullanım akışları
- Android’in masaüstüne göre geride göründüğü alanlar:
  - offline breach intelligence
  - daha olgun BYOC / bridge sync
  - CLI benzeri gelişmiş yönetim
  - browser extension ile sıkı entegrasyon
  - memory hardening iddialarının uygulama düzeyinde kanıtı

Sonuç:

- Android sürümü özellik olarak güçlü ama masaüstü ürünün “ileri seviye güvenlik platformu” konumuna henüz tam erişmemiş.
- Özellikle offline breach intelligence ve sync olgunluğu tarafında masaüstü algısı daha güçlü.

## 7. Rakiplerle Karşılaştırma

### 7.1 Bitwarden

Güçlü yanları:

- passkey desteği var
- emergency access olgun
- vault health / raporlama ekosistemi güçlü
- çok platformlu olgunluk yüksek

Kaynaklar:

- Passkeys FAQ: https://bitwarden.com/resources/passkeys-faq/
- Emergency Access: https://bitwarden.com/de-de/help/emergency-access/

Android Aegis’e göre değerlendirme:

- Aegis yerel kontrol ve offline-first anlatıda daha çekici
- Bitwarden ürün olgunluğu, ekip paylaşımı, recovery ve ekosistem genişliğinde önde

### 7.2 Proton Pass

Güçlü yanları:

- uçtan uca şifreleme
- paylaşım
- autofill
- passkeys
- güvenlik izleme / Pass Monitor

Kaynak:

- https://proton.me/pass
- https://proton.me/de/pass/pass-monitor

Android Aegis’e göre değerlendirme:

- Aegis daha yerelci ve “kendi cihazında kontrol” yaklaşımında daha saf
- Proton Pass, kimlik koruma ve servis entegrasyonu tarafında daha olgun

### 7.3 1Password

Güçlü yanları:

- passkey anlatısı ve ürün olgunluğu yüksek
- Watchtower ile uzun süredir güvenlik denetimi ekosistemi var

Kaynak:

- https://1password.com/product/password-manager
- https://1password.com/blog/what-are-passkeys
- https://1password.com/blog/1password-watchtower-heartbleed-beyond

Android Aegis’e göre değerlendirme:

- Aegis açık kaynak ve yerel veri kontrolü ile ayrışıyor
- 1Password ise polish, UX, kurumsal güven, platform entegrasyonu ve operasyonel olgunlukta önde

## 8. Rakip Puan Tablosu

| Ürün | Güvenlik mimarisi | Yerel kontrol | Sync olgunluğu | Passkey | Ekip / paylaşım | Ürün olgunluğu | Toplam |
|---|---:|---:|---:|---:|---:|---:|---:|
| Aegis Vault Android | 8.9 | 9.0 | 7.4 | 6.8 | 6.2 | 7.5 | 8.0 |
| Bitwarden | 8.5 | 7.0 | 9.0 | 8.5 | 8.8 | 9.0 | 8.5 |
| Proton Pass | 8.3 | 7.2 | 8.6 | 8.0 | 8.2 | 8.7 | 8.2 |
| 1Password | 8.8 | 6.2 | 9.1 | 8.8 | 8.7 | 9.4 | 8.8 |

Yorum:

- Aegis Vault Android “privacy-first local vault” nişinde güçlü.
- Genel pazarda hâlâ Bitwarden / Proton Pass / 1Password kadar olgun değil; fakat aradaki fark önceki değerlendirmeye göre azaldı.
- En büyük farkı: kullanıcıya daha fazla yerel egemenlik sunması.
- En büyük açıkları artık “bariz uygulanmamış güvenlik iddiaları” değil; daha çok device validation, ekosistem olgunluğu ve tam RP-passkey olgunluğu.

## 9. Eksik veya Öncelikli Eklenmesi Gereken Özellikler

Öncelik sırasıyla önerim:

1. Relay sync native köprüsünü gerçekten tamamlayın ve üretimde pinning’i zorunlu doğrulayın.
2. `PasswordHistoryModule` içindeki sahte/placeholder export şifrelemesini kaldırın veya düzeltin.
3. Passkey akışını tam RP-doğrulamalı ve denetlenebilir hale getirin; “local helper” modunu daha açık etiketleyin.
4. Release build için merkezi “secure logging policy” uygulayın.
5. Masaüstündeki offline breach detection yaklaşımının Android karşılığını geliştirin.
6. Export sırasında “private storage” varsayılanını güçlendirin.
7. Donanım anahtarı ve passkey metadata’sını daha sıkı saklayın; Keystore-wrapped saklama düşünün.
8. Harici güvenlik denetimi, reproducible build ve SBOM yayınlayın.

## 10. Son Hüküm

Aegis Vault Android kötü değil; tersine, teknik iddiası yüksek ve doğru yerlere yatırım yapmış bir proje. İlk değerlendirmede görülen bazı kritik güvenlik boşlukları artık kapatılmış durumda.

Benim güncel kararım:

- kişisel / ileri seviye kullanıcı için güçlü aday
- açık kaynak / local-first segmentte dikkat çekici
- önceki sürüme kıyasla güvenlik uygulama kalitesi belirgin şekilde yükselmiş
- geniş kullanıcı kitlesine açılmadan önce hâlâ gerçek cihaz / release doğrulama kanıtı toplanmalı

Ürünü en çok yukarı taşıyan son düzeltmeler:

1. sync köprüsünün gerçek native implementasyona kavuşması
2. password history audit export’un gerçek kriptografiye taşınması
3. integrity token yüzeyinin daraltılması
4. plaintext export ve logging politikasının sertleştirilmesi

## 11. Kullanılan Kaynaklar

Yerel kod referansları:

- [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts)
- [SyncManager.ts](/f:/AegisAndroid_publish/src/SyncManager.ts)
- [PasswordHistoryModule.ts](/f:/AegisAndroid_publish/src/PasswordHistoryModule.ts)
- [HIBPModule.ts](/f:/AegisAndroid_publish/src/HIBPModule.ts)
- [CloudSyncSecureModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/CloudSyncSecureModule.kt)
- [IntegrityModule.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/IntegrityModule.kt)
- [AegisAutofillService.kt](/f:/AegisAndroid_publish/android/app/src/main/java/com/aegisandroid/AegisAutofillService.kt)
- [SyncManager.test.ts](/f:/AegisAndroid_publish/__tests__/SyncManager.test.ts)

Dış kaynaklar:

- Aegis Vault ürün sayfası: https://hetech-me.space/index-En.html
- Bitwarden Passkeys FAQ: https://bitwarden.com/resources/passkeys-faq/
- Bitwarden Emergency Access: https://bitwarden.com/de-de/help/emergency-access/
- Proton Pass: https://proton.me/pass
- Proton Pass Monitor: https://proton.me/de/pass/pass-monitor
- 1Password Password Manager: https://1password.com/product/password-manager
- 1Password Passkeys: https://1password.com/blog/what-are-passkeys
- 1Password Watchtower: https://1password.com/blog/1password-watchtower-heartbleed-beyond
