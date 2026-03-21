# Cihaz Matrisi ve Saha Dogrulama Rehberi

Tarih: 21 Mart 2026
Kaynaklar:
- [ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md](/f:/AegisAndroid_publish/docs/ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md)
- [DEVICE_MATRIX_TEST_PLAN.md](/f:/AegisAndroid_publish/docs/DEVICE_MATRIX_TEST_PLAN.md)

## Amac

Bu rehberin amaci, Aegis Vault Android icin gercek cihazlarda tekrarlanabilir, kanitlanabilir ve yayin oncesi karar vermeyi kolaylastiran bir test matrisi olusturmaktir.

Bu dokuman:
- Hangi cihazlarda test yapilacagini netlestirir
- Hangi kritik akislarda kanit toplanacagini listeler
- Basarisiz sonuclarda hangi minimum notun tutulacagini standartlastirir
- Release readiness kararini daha savunulabilir hale getirir

## Kapsam

Bu turda odaklanan alanlar:
- unlock ve brute-force lockout
- biyometrik gate davranisi
- autofill
- encrypted export/import
- recovery
- cloud sync upload/download
- passkey
- crash monitoring ve audit

Bu rehber, unit test yerine gercek cihaz davranisini hedefler.

## Hedef Cihaz Seti

Ilk tur icin minimum cihaz seti:

| Oncelik | Cihaz Sinifi | Android | Odak |
| --- | --- | --- | --- |
| P0 | Pixel 8/9 veya benzeri Pixel | 14 veya 15 | Credential Manager, passkey, biometrik unlock |
| P0 | Samsung Galaxy A/S serisi | 13 veya 14 | Autofill, One UI davranisi, dosya secici, arka plan |
| P0 | Xiaomi / Redmi / POCO | 13 veya 14 | MIUI/HyperOS arka planlama, izinler, modal akislar |
| P1 | Motorola / Nokia / near-stock | 11 veya 12 | Genel uyumluluk ve import/export |
| P1 | Dusuk RAM cihaz | 11-14 | Buyuk yedek, recovery, modal ve bellek dayanikliligi |
| P1 | Biyometri kapali cihaz | 11-15 | Fallback davranisi, hata mesajlari |

Opsiyonel ama degerli ek kapsama:
- Work profile veya secondary user olan cihaz
- Debug options / ADB aktif cihaz
- Root/Magisk izi olan test cihaz

## Test Ortami Standardi

Her cihaz icin su bilgiler kaydedilmeli:
- cihaz markasi ve model kodu
- Android surumu ve guvenlik patch seviyesi
- build tipi: debug / locally signed release / production release
- uygulama versiyonu ve commit hash
- biyometri durumu: acik / kapali
- ADB durumu: acik / kapali
- baglanti tipi: Wi-Fi / mobil veri

## Zorunlu Akislar

### 1. Unlock ve Oturum Guvenligi

Her cihazda dogrulanacak:
- ilk kurulum sonrasi unlock
- biyometrik prompt iptali
- yanlis giris sonrasi lockout birikimi
- arka plana atinca auto-lock
- tekrar acilista unlock

Kanit:
- ekran goruntusu veya kisa not
- lockout mesajinda gorulen sure
- beklenmedik hata varsa `adb logcat` ozeti

### 2. Autofill

Her desteklenen cihazda:
- sistemde autofill servisini etkinlestirme
- tarayicida login doldurma
- ucuncu parti uygulamada login doldurma
- kasa kilitliyken autofill bloklama

Kanit:
- servisin secili oldugunu gosteren ekran
- doldurma onerisi cikti / cikmadi
- kilitliyken bloklama notu

### 3. Encrypted Export / Import

Zorunlu senaryolar:
- sifreli export olusturma
- ayni cihazda import
- yanlis sifre ile import ve kontrollu hata
- bozuk dosya ile import ve crash olmamasi
- buyuk veri seti ile export/import

Kanit:
- olusan dosya adi veya yol notu
- basarili importta oge sayisi
- basarisiz importta hata metni ozeti

### 4. Recovery

Zorunlu senaryolar:
- recovery baslatma
- kod dogrulama
- gecersiz kod
- suresi dolmus kod
- recovery backup olusturma
- recovery ile geri yukleme
- gecersiz token ile restore bloklama

Kanit:
- oturum adimi
- beklenen durum gecisi
- restore basarisinda geri gelen oge sayisi

### 5. Cloud Sync

Zorunlu senaryolar:
- gecerli HTTPS + certificate pin ile upload
- download ve import
- yanlis pin veya yanlis endpoint ile kontrollu hata
- gecici `.aegis` dosyasinin temizlenmesi

Kanit:
- endpoint tipi
- upload/download sonucu
- hata durumunda kullaniciya gorunen mesaj

### 6. Passkey

Zorunlu senaryolar:
- cihazda passkey olusturma
- cihazda passkey dogrulama
- passkey sheet iptali
- onkosullar eksikken akisin kontrollu durmasi
- kayit metadata'sinin yeniden acilinca korunmasi

Kanit:
- Android surumu
- Credential Manager sheet davranisi
- basarili / basarisiz sonuc notu

### 7. Crash Monitoring ve Audit

Zorunlu senaryolar:
- handled error tetikleme
- crash raporunun yerelde listelenmesi
- rapor temizleme
- unlock / cloud / recovery olaylarinin audit ekranina dusmesi

Kanit:
- rapor sayisi once/sonra
- audit event isimleri

## Sonuc Siniflandirmasi

Her senaryo icin tek bir sonuc kullanin:
- `PASS`: beklenen davranis tam olarak saglandi
- `PASS-WARN`: ana akis calisti ama not dusulmesi gereken bir purluluk var
- `FAIL`: akis tamamlanmadi, veri kaybi oldu veya guvenlik beklentisi bozuldu
- `BLOCKED`: cihaz/hesap/altyapi eksikligi nedeniyle senaryo kosulamadi

## Kritik Fail Kriterleri

Asagidaki bulgulardan biri varsa o cihaz/senaryo kritik kabul edilmeli:
- unlock sonrasinda beklenmeyen crash
- yanlis sifre ile importta veri bozulmasi
- recovery restore sonrasi veri eksigi
- cloud sync sonrasi sifresiz veri sizintisi veya temp dosya kalmasi
- kilitliyken autofill'in veri gostermesi
- passkey akisinin uygulamayi kilitlemesi veya geri donulemez hata yaratmasi

## Kanit Toplama Kurali

Her fail veya warn icin en az biri kaydedilmeli:
- ekran goruntusu
- kisa video
- `adb logcat` kesiti
- 2-3 cumlelik gozlem notu

Kanit dosyalari icin onerilen isimlendirme:

```text
YYYY-MM-DD_vendor-model_androidXX_scenario_result
```

Ornek:

```text
2026-03-21_pixel8_android15_passkey_create_pass
2026-03-21_galaxya54_android14_autofill_locked_fail
```

## Onerilen Klasor Yapisi

```text
docs/
  validation/
    README_TR.md
    cihaz-matrisi.csv
    kanit/
      pixel8/
      samsung-a54/
      xiaomi-note/
```

## Release Exit Kriterleri

Yaygin kullanima gecmeden once:
- tum P0 cihazlarda unlock, backup/import, recovery ve cloud sync `PASS` olmali
- en az bir P0 cihazda passkey create/auth `PASS` olmali
- autofill en az iki vendor'da `PASS` olmali
- kritik veri kaybi veya fatal native crash kalmamali
- fail kalan maddelerin risk notu release readiness dokumanina islenmeli

## Operasyonel Notlar

- Cloud Sync testlerinde gercek production endpoint yerine test endpoint kullanin
- Passkey testlerinde ayni hesapla tekrarli denemelerde metadata tutarliligini not edin
- Xiaomi/MIUI cihazlarda arka plan kisitlari ayri not olarak yazilmali
- Samsung cihazlarda keyboard/autofill cakisiyorsa cihaz-spesifik not dusulmeli

## Sonraki Adim

Bu rehberle birlikte her fiziksel cihaz icin bir kayit acin ve her tur sonrasinda bulgulari:
- [RELEASE_READINESS.md](/f:/AegisAndroid_publish/docs/RELEASE_READINESS.md)
- [ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md](/f:/AegisAndroid_publish/docs/ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md)

dosyalarina ozetleyin.
