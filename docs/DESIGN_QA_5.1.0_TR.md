# Aegis Vault Android 5.1.0 Tasarım ve Cihaz QA Kontrol Listesi

Tarih: 2026-05-13
Kapsam: Android 5.1.0 tasarım yenilemesi, iki dil desteği, koyu/açık mod, büyük kasa kullanımı ve release öncesi görsel kalite kontrolü.

## Özet

5.1.0 tasarım turunda ana kullanıcı yüzeyleri aynı görsel dile taşındı: Dashboard, kilit ekranı, ayarlar, Security Center, parola sağlık raporu, yedekleme/içe aktarma, parola üretici, kayıt ekleme/detay, sync, paylaşım, pairing, çöp kutusu, bağış ve yasal metin ekranları.

Bu belge, APK gerçek cihazda kurulduktan sonra hızlı ama sistematik görsel QA yapmak için kullanılır.

## Zorunlu Geçiş Kriterleri

- Türkçe ve İngilizce metinlerde buton taşması, okunmayan başlık veya kırılan satır olmamalı.
- Koyu modda arama alanı, form alanları, kart içerikleri ve kritik butonlar yeterli kontrasta sahip olmalı.
- 600+ kayıt içeren kasada Dashboard üst alanı sabit kalmalı ve liste akıcı kaymalı.
- Yedekleme, içe aktarma, sync, paylaşım ve silme gibi riskli işlemler açık bağlam/uyarı göstermeli.
- Kilit ekranında biyometrik giriş alanı ekrana göre dengeli kalmalı, uygulama ikonu boş görünmemeli.
- Security Center ve parola sağlık raporu skorları, risk rengi ve aksiyon kuyruğu kolay anlaşılmalı.

## Ekran Kontrol Listesi

### 1. Kilit Ekranı

- Açık/koyu modda uygulama ikonu, başlık ve biyometrik buton görünür.
- Türkçe ve İngilizce modda güven çipleri taşmaz.
- Biyometrik buton aşırı büyük veya ekrandan taşmış görünmez.

### 2. Dashboard

- 600+ kayıtla liste kaydırılırken üst hero/arama/filtre alanı sabit kalır.
- Arama metni koyu modda okunur.
- Boş durum, filtrelenmiş durum ve büyük liste durumları tutarlı görünür.

### 3. Kayıt Ekleme ve Detay

- Yeni kayıt ve düzenleme ekranında kategori ve zorunlu alan kartı görünür.
- Detay ekranında kategori, dosya ve geçmiş özetleri doğru görünür.
- Gizli alanlar kullanıcı özellikle göstermeden maskeli kalır.

### 4. Security Center ve Parola Sağlığı

- Genel skor, risk rozeti ve ilerleme çubukları açık/koyu modda okunur.
- Türkçe risk/özet etiketleri kısa kalır.
- Bulgu kartlarında aksiyon butonları kolay seçilir.

### 5. Yedekleme ve İçe Aktarma

- Şifreli yedeğin önerilen seçenek olduğu net görünür.
- Düz metin export seçenekleri açık uyarı arkasında kalır.
- Şifreli yedek `Downloads/AegisVault` altında bulunabilir.
- Şifreli yedeği içe aktarma sonrası kayıt sayısı doğru görünür.

### 6. Sync, Paylaşım ve Pairing

- Cloud Sync ekranında HTTPS, sertifika pinleme ve E2E bağlamı görünür.
- Shared Vault ekranında alan/üye/bekleyen özetleri görünür.
- Pairing Workspace ekranında masaüstü/tarayıcı köprüsü durumu anlaşılır.

### 7. Yardımcı Modallar

- Çöp kutusunda geri yükleme ve kalıcı silme ayrımı net.
- Bağış ekranında adres/QR/kopyalama alanı koyu modda okunur.
- Yasal metinler kart içinde rahat okunur.

## README/GitHub Görselleri

GitHub için önerilen ekran görüntüleri:

- Dashboard açık mod
- Dashboard koyu mod
- Security Center
- Backup/Import
- Lock Screen
- Settings control center

Önerilen klasör: `docs/screenshots/`

Mevcut README görselleri güncel tasarımı temsil etmiyorsa aynı dosya adlarıyla yenilenebilir:

- `docs/screenshots/mobile-vault.png`
- `docs/screenshots/mobile-security.png`
- `docs/screenshots/mobile-login.png`
- `docs/screenshots/aegis_android_banner.png`

## Sonuç

5.1.0 için tasarım tarafında kritik açık görünmüyor. Geniş rollout öncesi son adım, bu checklist ile en az bir fiziksel cihazda Türkçe/İngilizce ve koyu/açık mod geçişlerini doğrulamaktır.
