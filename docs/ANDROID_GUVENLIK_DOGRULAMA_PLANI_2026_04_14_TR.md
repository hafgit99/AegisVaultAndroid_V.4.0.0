# Android Güvenlik Doğrulama Planı

Tarih: 14 Nisan 2026

## 14-16 Nisan Sonrasi Kapsam Genislemesi

Bu plan artik yalnizca relay / export / integrity dogrulama plani degil; ayni zamanda roadmap gap-closure katmanlari icin staging/device smoke-test checklist'i olarak da kullanilacaktir.

Yeni zorunlu smoke-test alanlari:

1. backend dogrulamali passkey akisi
2. Validation Workspace ve cihaz matrisi guncellemesi
3. sync confidence / relay saglik sinyalleri
4. shared spaces lifecycle
5. browser extension / desktop pairing workspace

## Amaç

Bu plan, 14 Nisan 2026 tarihinde uygulanan güvenlik düzeltmelerinin gerçek Android cihazlarda doğrulanması için hazırlanmıştır.

Doğrulanacak başlıklar:

1. Relay sync native JSON köprüsü ve sertifika pinning akışı
2. Play Integrity token daraltması
3. Autofill release logging politikası
4. Plaintext export için private storage tercihi ve kullanıcı uyarısı
5. Password history audit export için gerçek şifreleme
6. backend dogrulamali passkey urun akisi
7. Validation Workspace ve saha kaniti kaydi
8. sync confidence UX
9. shared spaces lifecycle
10. pairing workspace

## Hedef Cihazlar

Minimum cihaz seti:

- Pixel 8 veya üzeri, Android 14/15
- Samsung A54 veya benzeri, Android 13/14
- Xiaomi / MIUI cihaz, Android 13/14

## Test Senaryoları

### 0. Staging / Device Smoke-Test Checklist

Bu bolum 16 Nisan 2026 urun katmanlari icin hizli gate listesi olarak kullanilmalidir.

#### 0.1 Passkey Backend Smoke

On kosul:

- staging RP backend URL
- accountId ve gerekiyorsa auth token
- Android cihazda native passkey kullanilabilir olmali

Adimlar:

1. Passkey Settings icine staging backend bilgilerini girin.
2. Backend health check calistirin.
3. Passkey formunda readiness kartinin "backend configured" ve "native available" durumlarini dogrulayin.
4. `Sunucu ile kaydet` akisini baslatin.
5. Basarili kayit sonrasi `Sunucu ile dogrula` akisini calistirin.
6. Yanlis veya eksik onkosul ile hata siniflandirmasini dogrulayin.

Beklenen:

- backend health check PASS
- register ve auth akislarinda basarili sonuclar kullaniciya net gosterilmeli
- challenge expired / rp mismatch / credential mismatch gibi hata tipleri dogru mesaja maplenmeli

Kanit:

- readiness panel ekran goruntusu
- basarili create/auth ekran goruntusu
- gerekiyorsa logcat veya backend cevap notu

#### 0.2 Validation Workspace Smoke

Adimlar:

1. Passkey formunda bir saha dogrulama kaydi olusturun.
2. Validation Workspace'i acin.
3. Yeni kaydin son kayitlar listesinde gorundugunu dogrulayin.
4. Cihaz matrisi panosunda ilgili cihaz/senaryo satirinin planli durumdan guncellendigini dogrulayin.

Beklenen:

- kayit listesi ve matrix board ayni veriyi yansitmali
- cihaz, senaryo, sonuc ve not alani dogru gorunmeli

#### 0.3 Sync Confidence Smoke

Adimlar:

1. Relay URL, session ID ve certificate pin girin.
2. `Relay Sagligini Kontrol Et` adimini calistirin.
3. Validation Workspace icindeki sync confidence kartini acin.
4. Basarili sync kosusu yapin ve son successful sync bilgisini dogrulayin.
5. Gecersiz pin ile hata kosusu yapip son hata alanini dogrulayin.

Beklenen:

- relay reachable, certificate pin, sync validated ve confidence seviyesi dogru guncellenmeli

#### 0.4 Shared Spaces Lifecycle Smoke

Adimlar:

1. Yeni bir shared space olusturun.
2. Status `pending` olan bir uye ekleyin.
3. Daveti kabul et aksiyonunu calistirin.
4. Uyenin rolunu viewer/editor arasinda degistirin.
5. Uyeyi `emergency-only` moda alin ve tekrar aktive cekin.
6. Bir pending daveti iptal edin.

Beklenen:

- uye ozeti kartlari anlik guncellenmeli
- invite code, invitedAt ve acceptedAt bilgileri gorunmeli
- kaydetme sonrasi modal ayni lifecycle durumunu korumali

#### 0.5 Pairing Workspace Smoke

Adimlar:

1. Pairing Workspace'i acin.
2. Browser extension tipi ile yeni pairing kodu olusturun.
3. Pending kaydi paired olarak isaretleyin.
4. Ayni kaydi revoke edin.
5. Desktop app tipi ile ikinci bir kayit olusturun.

Beklenen:

- paired / pending / revoked metrikleri dogru artip azalmalı
- pairing code gorunur olmali
- roadmap pairing ilerlemesi bu kayitlari hesaba katmali

### 1. Relay Sync Native Köprü

Ön koşul:

- Geçerli HTTPS relay endpoint
- Geçerli `sha256/<base64>` sertifika pini
- Aynı session ID ile iki cihaz

Adımlar:

1. Cihaz A ve B’de aynı relay URL, session ID ve certificate pin girin.
2. Her iki cihazda kasayı açın.
3. Cihaz A’da yeni kayıt oluşturun.
4. `Şimdi Senkronize Et` çalıştırın.
5. Cihaz B’de `Şimdi Senkronize Et` çalıştırın.
6. Kayıdın B’ye geldiğini doğrulayın.

Beklenen:

- Sync başarılı olmalı.
- Uygulama çökmeden `postJson/getJson` native köprüsü kullanılmalı.
- Hatalı pin girildiğinde sync başarısız olmalı.
- HTTP endpoint girildiğinde sync reddedilmeli.

Kanıt:

- ekran görüntüsü
- `adb logcat` kısa kesit

### 2. Play Integrity Token Daraltması

Adımlar:

1. Release build açın.
2. Cihaz bütünlüğü ekranını açın.
3. Görünen sinyalleri kontrol edin.
4. Debug bridge veya JS inspection ile genel integrity objesini kontrol edin.

Beklenen:

- Kullanıcıya risk skoru, nonce, token length gibi meta sinyaller görülebilir.
- Tam `playIntegrityToken` genel signal payload’ında görünmemeli.
- Relay attestation akışı yine çalışmalı.

### 3. Autofill Release Logging

Adımlar:

1. Release build kurun.
2. Autofill’i etkinleştirin.
3. Tarayıcı ve bir üçüncü parti uygulamada doldurma deneyin.
4. `adb logcat` içinde `AegisAutofill` aratın.

Beklenen:

- Release build’de ayrıntılı debug loglar görünmemeli.
- Autofill işlevi devam etmeli.

### 4. Plaintext Export Uyarısı ve Private Storage

Adımlar:

1. Ayarlar > Yedekleme > Export ekranını açın.
2. CSV export’a dokunun.
3. Uyarı modalını doğrulayın.
4. Aynı akışı JSON için tekrarlayın.
5. Dosya yolunu not edin.

Beklenen:

- Uyarı modalı Türkçe ve İngilizce dilde doğru görünmeli.
- Koyu modda okunabilir renklerle açılmalı.
- Dosya yolu uygulama private storage altında başlamalı.
- Şifreli export da private storage’a yazılmalı.

### 5. Password History Audit Export Şifreleme

Adımlar:

1. Bir kaydın parola geçmişini oluşturun.
2. Audit export üretin.
3. Export çıktısını inceleyin.

Beklenen:

- Çıktı plaintext veya salt+plaintext base64 olmamalı.
- JSON içinde `algorithm`, `kdf`, `salt`, `iv`, `authTag`, `data` alanları bulunmalı.
- `data` alanı şifreli içerik olmalı.

## Geçiş Kriteri

Bu plan PASS sayılabilmesi için:

- P0 cihazlarda tüm 5 başlık PASS olmalı
- Sync senaryosunda pin hatası ve HTTPS zorunluluğu doğrulanmalı
- Release logcat’te hassas autofill debug izi kalmamalı
- Plaintext export private storage altında kalmalı
- Password history audit export plaintext olmamalı

## Önerilen Komutlar

```powershell
adb logcat | Select-String "AegisAutofill|CloudSyncSecure|DeviceIntegrity"
```

```powershell
adb shell run-as com.aegisandroid ls files
```

```powershell
adb shell run-as com.aegisandroid cat files/<exported-file-name>
```

Not:

- Son komut yalnızca debug/uygun test kurulumlarında kullanılmalıdır.
- Release cihazlarında dosya inceleme yerine uygulama içi yol ve davranış doğrulaması tercih edilmelidir.
