# Öncelikli Güvenlik İyileştirme Planı

Tarih: 21 Mart 2026
Kaynak: [ANDROID_GUVENLIK_VE_RAKIP_RAPORU_TR.md](/f:/AegisAndroid_publish/docs/ANDROID_GUVENLIK_VE_RAKIP_RAPORU_TR.md)

## Amaç

Bu planın amacı, Aegis Vault Android'i kısa sürede daha güvenilir, daha savunulabilir ve daha yayınlanabilir hale getirmektir.

Odak:

1. Güvenlik iddiası ile gerçek runtime davranışını hizalamak
2. Gerçek risk oluşturan teknik borçları kapatmak
3. Release kalitesini ve doğrulanabilirliğini yükseltmek

## Öncelik Özeti

| Öncelik | İş Paketi | Etki | Zorluk | Hedef |
| --- | --- | --- | --- | --- |
| P0 | Unlock mimarisini düzelt | Çok yüksek | Orta | Tamamlandı |
| P0 | Release signing fallback kapat | Yüksek | Düşük | Tamamlandı |
| P0 | Lint error'larını sıfırla | Yüksek | Orta | Tamamlandı |
| P1 | HIBP cache'i sertleştir | Orta-yüksek | Orta | Tamamlandı |
| P1 | Placeholder testleri gerçek testlere çevir | Yüksek | Orta-yüksek | Tamamlandı |
| P1 | README ve güvenlik dokümanlarını kodla hizala | Yüksek | Düşük | Tamamlandı |
| P2 | Passkey akışını üretim modeliyle hizala | Çok yüksek | Yüksek | Repo-ici kismi tamamlandi |
| P2 | Cihaz matrisi ve kanıt seti oluştur | Yüksek | Orta | sürekli |

## Durum Güncellemesi

21 Mart 2026 itibarıyla tamamlanan başlıklar:

- Unlock akışı, biyometriyi bir "gate" ve Argon2id tabanlı açma sırrını ayrı kavramlar olarak netleştirecek şekilde sadeleştirildi.
- Public release için debug signing fallback varsayılan akıştan çıkarıldı; sadece açıkça izin verilirse lokal kullanımda açılabiliyor.
- Lint hattı temizlendi; proje `0 error / 0 warning` seviyesine getirildi.
- README ve güvenlik mimarisi metinleri gerçek implementasyona hizalandı.
- HIBP önbelleği, düz SHA-1 artefaktları yerine cihazda üretilen sır ile türetilen HMAC tabanlı anahtarlarla tutulacak şekilde sertleştirildi.
- SecurityModule içindeki placeholder güvenlik testleri gerçek regresyon testlerine çevrildi.
- Recovery akışında geçersiz e-posta, süresi dolmuş kod, geçersiz token, sıfır öğe dönen restore ve expired session cleanup senaryoları test kapsamına alındı.
- Cloud Sync akışında HTTPS zorunluluğu, certificate pin doğrulaması, upload/download fail-closed davranışı ve geçici `.aegis` dosyalarının temizlenmesi test kapsamına alındı.
- Gerçek cihaz matrisi için Türkçe saha doğrulama rehberi ve kanıt kayıt şablonu eklendi.
- `docs/validation/` altında kullanılabilir cihaz matrisi CSV'si ve kanıt klasör yapısı oluşturuldu.
- Passkey tarafinda local helper mod siniri dokumante edildi ve server-provided challenge destegi icin kod seviyesi hazirlik eklendi.
- Full WebAuthn RP mode icin ADR ve istemci-backend API sozlesmesi taslagi eklendi.
- Passkey backend implementation checklist ve ilk saha test kosusu gorev listesi eklendi.
- Gunluk saha test operasyon plani eklendi.

Açık kalan öncelikli başlıklar:

- Gerçek cihaz matrisi ve saha kanıt seti oluşturma

## P0: Hemen Yapılması Gerekenler

### 1. Unlock mimarisini tek modele indir

Problem:

- `deriveKeyFromBiometric()` ile `unlockVault()` arasında çift türetim benzeri bir akış var.
- Audit log, runtime davranışını olduğundan daha güçlü gösteriyor.

Hedef:

- Tek, açık, testlenebilir bir unlock modeli belirlemek.

Karar seçenekleri:

1. Biyometrik türetilmiş anahtar gerçekten SQLCipher anahtarı olsun.
2. Biyometri yalnızca gate olsun, asıl anahtar kullanıcı parolasından türetilsin.

Önerim:

- Kısa vadede daha düşük riskli olduğu için `biyometri = gate`, `anahtar = parola/secret tabanlı KDF` modelini netleştirin.
- Sonra istersek biyometrik türetilmiş modele kontrollü geçiş yaparız.

Yapılacaklar:

- [SecurityModule.ts](/f:/AegisAndroid_publish/src/SecurityModule.ts) içinde unlock zincirini sadeleştir
- `method: 'biometric_derived_key'` audit değerini gerçek davranışa göre düzelt
- `deriveKeyFromBiometric()` fonksiyonunun rolünü ya kaldır ya da açıkça “pre-auth gate” seviyesine indir
- Dokümanlardaki mimari diyagramı güncelle

Başarı ölçütü:

- Unlock akışı tek bir şemayla açıklanabiliyor olmalı
- Audit log ile gerçek akış birebir aynı olmalı
- Yanlış dokümantasyon kalmamalı

Doğrulama:

- birim test
- unlock smoke test
- yeni mimari için kısa ADR / teknik not

### 2. Public release için debug signing fallback'i kapat

Problem:

- Release build uygun koşullarda debug signing'e düşebiliyor.

Yapılacaklar:

- [build.gradle](/f:/AegisAndroid_publish/android/app/build.gradle) içinde public release yolunda fallback'i kapat
- CI/release komutuna `-PrequireReleaseSigning=true` zorunluluğu koy
- README üzerindeki “debug signing fallback” metnini yalnızca lokal geliştirme bağlamına çek

Başarı ölçütü:

- İmzalama bilgileri yoksa public release build fail etmeli

Doğrulama:

- signing env olmadan release build fail
- signing env ile release build pass

### 3. Lint error sayısını sıfıra indir

Problem:

- `eslint` kırmızı; bu release güvenini düşürüyor.

Yapılacaklar:

- Jest setup dosyalarında env/global tanımlarını düzelt
- kullanılmayan değişkenleri temizle
- hook dependency hatalarını çöz
- güvenlik açısından kritik dosyalarda gereksiz inline karmaşıklığı azalt

Başarı ölçütü:

- `npm run lint` hata vermeden geçmeli

Doğrulama:

- `npm run lint`
- `npm test -- --runInBand`
- `npx tsc --noEmit`

## P1: Sonraki Güvenlik Sertleştirmeleri

### 4. HIBP cache'i kasa dışı hash artefaktı bırakmayacak şekilde sertleştir

Problem:

- SHA-1 hash bazlı cache anahtarları uygulama dizininde kalıyor.

Yapılacaklar:

Seçenek A:

- Cache key = `HMAC(deviceSecret, sha1(password))`

Seçenek B:

- Cache verisini ayrı AES-GCM blob olarak sakla

Önerim:

- İlk adımda HMAC'li anahtar kullan
- İkinci adımda tam şifreli cache'e geç

Başarı ölçütü:

- Dosyada doğrudan parola hash'i kalmamalı

Doğrulama:

- birim test
- cache migration testi
- eski cache dosyasından yeni formata geçiş testi

Durum:

- Tamamlandı.
- Önbellek anahtarı `HMAC(deviceSecret, sha1(password))` modeline geçirildi.
- Eski SHA-1 tabanlı kayıtlar ilk erişimde yeni formata migrate ediliyor.
- Önbellek temizleme akışı artık hem sonuç dosyasını hem de cihaz-sırrı dosyasını siliyor.
- Kullanıcıya görünen gizlilik metinleri Türkçe ve İngilizce olarak yeni modele göre güncellendi.

### 5. Placeholder testleri gerçek regresyon testlerine dönüştür

Problem:

- Birçok test `expect(true).toBe(true)` seviyesinde.

Öncelikli test alanları:

1. unlock başarısız / başarılı akışı
2. brute-force lockout artışı
3. wrong password ile encrypted import failure
4. recovery akışı
5. passkey create/auth hata senaryoları
6. audit log kayıt doğrulaması

Başarı ölçütü:

- kritik güvenlik testlerinde placeholder kalmamalı

Doğrulama:

- coverage raporu
- kritik yol listesi için test matrisi

Durum:

- Tamamlandı.
- `SecurityModule.test.ts` içindeki placeholder testler; cihaz tuzu kalıcılığı, brute-force sayaç sıfırlama, AES-256-GCM şifre çözme başarı/başarısızlık, audit buffer retention, biyometrik anahtar yeniden kullanım, lockout bloklama ve factory reset cleanup davranışlarını doğrulayacak şekilde gerçek testlere çevrildi.
- Kritik güvenlik akışlarında `expect(true).toBe(true)` tarzı boş doğrulamalar kaldırıldı.

### 6. README ve güvenlik dokümanlarını kodla tam hizala

Problem:

- “Google Play Integrity” ve biyometrik anahtar modeli, mevcut implementasyondan daha güçlü anlatılıyor.

Yapılacaklar:

- README metnini gerçek implementasyona çek
- “Play Integrity” yerine “yerel integrity heuristics” gibi doğru terminoloji kullan
- güvenlik mimarisi dokümanında unlock akışını güncelle
- release readiness belgesindeki aşırı iddialı bölümleri yumuşat

Başarı ölçütü:

- “doküman başka, kod başka” durumu kalmamalı

## P2: Ürün Seviyesi Güvenlik Olgunluğu

### 7. Passkey akışını gerçek üretim modeline yükselt

Problem:

- Şu anki challenge üretimi yerel.
- Bu yapı tam WebAuthn relying party modelini karşılamıyor.

Hedef:

- Passkey özelliğini iki moda ayırmak:

1. `local metadata / helper mode`
2. `full webauthn integration mode`

Yapılacaklar:

- mevcut özelliğin ürün ismini netleştir
- full WebAuthn için challenge-response sözleşmesi tasarla
- native modülü server-provided challenge ile çalışacak hale getir
- response validation sınırlarını dokümante et

Başarı ölçütü:

- kullanıcı ve geliştirici, mevcut modülün neyi garanti ettiğini net anlayabilmeli

Durum:

- Kismi ilerleme saglandi.
- UI ve dokumantasyon dili, mevcut implementasyonun `local helper / local metadata` sinirina hizalandi.
- `PasskeyModule` icine server-provided challenge verildiginde bunu kullanacak kod yolu eklendi.
- [PASSKEY_WEBAUTHN_ADR_TR.md](/f:/AegisAndroid_publish/docs/PASSKEY_WEBAUTHN_ADR_TR.md) ile full RP mode icin mimari ve API kontrati tanimlandi.
- `PasskeyRpApi` istemcisi, registration/authentication options ve verify endpoint'leri icin typed fetch katmani olarak eklendi.
- `PasskeyModule` tarafinda `server options -> native request` donusum yardimcilari ve testleri eklendi.
- Repo icinde uygulanabilen kisim buyuk olcude tamamlandi.
- Hala eksik olan kisim, relying party sunucusunun gercekten yayina alinmasi, native akislarin bu endpoint'lerle baglanmasi ve fiziksel cihazlarda kanit toplanmasidir.

### 8. Gerçek cihaz matrisi ve kanıt seti oluştur

Problem:

- Release readiness belgeleri iyimser, ama kanıt deposu sınırlı.

Hedef cihaz seti:

- Pixel Android 14/15
- Samsung Android 13/14
- Xiaomi/MIUI Android 13/14
- düşük RAM bir cihaz

Mutlaka doğrulanacak akışlar:

1. unlock
2. autofill
3. passkey
4. encrypted export/import
5. recovery
6. cloud sync upload/download

Başarı ölçütü:

- her akış için cihaz, sürüm, sonuç ve kısa kanıt notu bulunmalı

Mevcut dokümantasyon:

- [CIHAZ_MATRISI_VE_SAHA_DOGRULAMA_TR.md](/f:/AegisAndroid_publish/docs/CIHAZ_MATRISI_VE_SAHA_DOGRULAMA_TR.md)
- [KANIT_KAYIT_SABLONU_TR.md](/f:/AegisAndroid_publish/docs/KANIT_KAYIT_SABLONU_TR.md)
- [docs/validation/README_TR.md](/f:/AegisAndroid_publish/docs/validation/README_TR.md)
- [docs/validation/cihaz-matrisi.csv](/f:/AegisAndroid_publish/docs/validation/cihaz-matrisi.csv)
- [ILK_SAHA_TEST_KOSUSU_GOREV_LISTESI_TR.md](/f:/AegisAndroid_publish/docs/ILK_SAHA_TEST_KOSUSU_GOREV_LISTESI_TR.md)
- [PASSKEY_BACKEND_IMPLEMENTATION_CHECKLIST_TR.md](/f:/AegisAndroid_publish/docs/PASSKEY_BACKEND_IMPLEMENTATION_CHECKLIST_TR.md)

## Sprint Bazlı Öneri

### Sprint 1

- Unlock mimarisi sadeleştirme
- Audit log doğruluğu
- Release signing sertleştirme
- Lint error cleanup
- README düzeltmeleri

Beklenen çıktı:

- Güvenlik iddiası ile implementasyon hizalanır
- Release kalitesi net biçimde artar

### Sprint 2

- HIBP cache sertleştirme
- Placeholder test dönüşümü
- kritik yol coverage artırımı
- cihaz matrisi ilk tur

Beklenen çıktı:

- Yerel gizlilik ve regresyon güveni artar

Mevcut durum:

- HIBP cache sertleştirme tamamlandı.
- Placeholder test dönüşümü tamamlandı.
- Sprint 2'nin aktif kalan ana işi kritik yol coverage derinleştirmesi ve ilk cihaz matrisi turu.
- Sprint 2'nin coverage tarafında RecoveryModule ve CloudSyncModule negatif senaryo testleri eklendi.
- Sprint 2'nin cihaz matrisi tarafında Türkçe saha doğrulama rehberi ve kanıt kayıt şablonu hazırlandı.
- Sprint 2'nin cihaz matrisi tarafında kullanılabilir validation workspace ve ilk CSV matris dosyası da oluşturuldu.
- Repo ici iyilestirme tarafi buyuk olcude tamamlandi.
- Siradaki zorunlu adim, bu sablonlarla gercek cihazlardan ilk kanit setini toplamak ve varsa backend tarafinda RP endpoint'lerini hayata gecirmektir.

### Sprint 3

- Passkey mimari netleştirme
- full WebAuthn entegrasyon tasarımı veya kapsam daraltma
- cloud sync ve recovery ek saha testleri

Beklenen çıktı:

- Rakiplerle karşılaştırmada en zayıf görünen alanlar toparlanır

## Teknik Borçtan Önce Yapılmaması Gerekenler

Şunları, P0 işler kapanmadan önermiyorum:

- yeni büyük özellik eklemek
- paylaşım/senkronizasyon kapsamını büyütmek
- güvenlik pazarlama dilini daha da iddialı hale getirmek
- geniş kullanıcı rollout'u

## En Yüksek ROI Sıralaması

En yüksek fayda / efor oranı:

1. Release signing fallback kapatma
2. README ve güvenlik dilini düzeltme
3. Lint error sıfırlama
4. Unlock modelini sadeleştirme
5. HIBP cache sertleştirme

En yüksek güvenlik etkisi:

1. Unlock modelini düzeltme
2. Passkey kapsamını doğru tanımlama
3. HIBP cache sertleştirme
4. Cihaz matrisi ile gerçek doğrulama

## Kapanış

Bu proje için en doğru yaklaşım, kısa vadede daha fazla özellik eklemek değil, mevcut güvenlik sözünü sağlamlaştırmaktır. İlk hedef “daha fazla şey yapan uygulama” olmak değil, “ne yaptığını net, doğru ve güvenilir şekilde yapan uygulama” olmaktır.
