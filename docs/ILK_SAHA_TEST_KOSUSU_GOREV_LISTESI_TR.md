# Ilk Saha Test Kosusu Gorev Listesi

Tarih: 21 Mart 2026
Baglanti:
- [CIHAZ_MATRISI_VE_SAHA_DOGRULAMA_TR.md](/f:/AegisAndroid_publish/docs/CIHAZ_MATRISI_VE_SAHA_DOGRULAMA_TR.md)
- [KANIT_KAYIT_SABLONU_TR.md](/f:/AegisAndroid_publish/docs/KANIT_KAYIT_SABLONU_TR.md)
- [docs/validation/cihaz-matrisi.csv](/f:/AegisAndroid_publish/docs/validation/cihaz-matrisi.csv)

## Hedef

Bu ilk kosunun amaci, en kritik akislardan gercek cihaz kaniti toplamaya baslamak ve release readiness acisindan bilinmeyen alanlari hizla azaltmaktir.

## Once Yapilacaklar

- [ ] Test build'i sec
- [ ] Commit hash not al
- [ ] Build tipini not al
- [ ] Cloud Sync icin test endpoint hazirla
- [ ] Certificate pin test degerini dogrula
- [ ] `docs/validation/cihaz-matrisi.csv` icinde test edilecek satirlari sahiplerine ata
- [ ] Her cihaz icin `KANIT_KAYIT_SABLONU_TR.md` kopyasi ac

## P0 Cihazlar

### Pixel 8 / Android 15

- [ ] unlock
- [ ] passkey_create
- [ ] passkey_auth
- [ ] encrypted_export_import
- [ ] recovery_restore
- [ ] cloud_sync_upload_download

### Samsung Galaxy A54 / Android 14

- [ ] unlock
- [ ] autofill_browser
- [ ] autofill_third_party
- [ ] encrypted_export_import
- [ ] recovery_restore
- [ ] cloud_sync_upload_download

### Xiaomi Redmi Note / Android 14

- [ ] unlock
- [ ] background_auto_lock
- [ ] file_picker_backup
- [ ] cloud_sync_upload_download

## Kanit Kurali

Her `FAIL` veya `PASS-WARN` icin:
- [ ] en az bir ekran goruntusu
- [ ] kisa not
- [ ] gerekiyorsa `adb logcat` kesiti

Her `PASS` icin minimum:
- [ ] sonuc notu
- [ ] varsa ekran goruntusu veya satir bazli kanit yolu

## Senaryo Bazli Minimum Notlar

### Unlock

- [ ] biyometri prompt acildi mi
- [ ] iptal akisi kontrollu mu
- [ ] lockout suresi dogru mu

### Passkey

- [ ] challenge kaynagi local helper mi server mi
- [ ] native sheet beklendigi gibi acildi mi
- [ ] create/auth sonucu ne oldu

### Export / Import

- [ ] dosya olustu mu
- [ ] import edilen oge sayisi
- [ ] yanlis sifrede crash var mi

### Recovery

- [ ] session olustu mu
- [ ] code/token gecisleri beklendigi gibi mi
- [ ] restore sonrasi oge sayisi

### Cloud Sync

- [ ] upload durum kodu veya sonuc notu
- [ ] download/import sonucu
- [ ] temp dosya kaldi mi

### Autofill

- [ ] servis secilebildi mi
- [ ] browser dolumu calisti mi
- [ ] kilitliyken bloklandi mi

## Kosu Sonrasi

- [ ] `docs/validation/cihaz-matrisi.csv` guncellendi
- [ ] kanit dosyalari ilgili cihaz klasorlerine kondu
- [ ] release blocker varsa [RELEASE_READINESS.md](/f:/AegisAndroid_publish/docs/RELEASE_READINESS.md) icine yazildi
- [ ] plan dokumaninda acik riskler guncellendi

## Cikis Kriteri

Bu ilk kosu tamamlandi sayilmasi icin:
- [ ] Tum P0 cihazlarda en az birer kanit kaydi olusmali
- [ ] Pixel ve Samsung icin en az bir passkey sonucu kayda gecmeli
- [ ] Cloud Sync ve Recovery icin en az bir fail/success kaniti bulunmali
- [ ] Bilinmeyen kalan basliklar net olarak `BLOCKED` veya `FAIL` diye etiketlenmis olmali
