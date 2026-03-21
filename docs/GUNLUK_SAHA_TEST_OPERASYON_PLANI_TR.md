# Gunluk Saha Test Operasyon Plani

Tarih: 21 Mart 2026
Sure: 1 is gunu
Baglanti:
- [ILK_SAHA_TEST_KOSUSU_GOREV_LISTESI_TR.md](/f:/AegisAndroid_publish/docs/ILK_SAHA_TEST_KOSUSU_GOREV_LISTESI_TR.md)
- [docs/validation/cihaz-matrisi.csv](/f:/AegisAndroid_publish/docs/validation/cihaz-matrisi.csv)
- [KANIT_KAYIT_SABLONU_TR.md](/f:/AegisAndroid_publish/docs/KANIT_KAYIT_SABLONU_TR.md)

## Amac

Bu planin amaci, tek gun icinde en yuksek riskli bilinmeyenleri azaltacak minimum ama etkili saha dogrulamasini yapmaktir.

## Baslangic Ciktisi

Gun sonunda su uc cikti hazir olmali:
- guncellenmis [cihaz-matrisi.csv](/f:/AegisAndroid_publish/docs/validation/cihaz-matrisi.csv)
- en az 3 cihazdan kanit dosyalari
- release blocker veya acik risk ozeti

## 09:00 - 09:30 Hazirlik

- Test build'ini kesinlestir
- Commit hash'i not et
- Her cihaz icin bir kanit sablonu ac
- Cloud Sync test endpoint ve certificate pin degerini kontrol et
- `docs/validation/cihaz-matrisi.csv` icinde owner alanlarini doldur

Beklenen sonuc:
- Teste baslamaya hazir cihaz listesi
- Dogru build / dogru endpoint / dogru pin

## 09:30 - 11:00 Pixel 8 / Android 15

Odak:
- unlock
- passkey_create
- passkey_auth
- encrypted_export_import

Yapilacaklar:
- ilk unlock ve biyometri prompt davranisini not et
- passkey create/auth akisini calistir
- challenge kaynagini not et: `local_helper` veya `server`
- encrypted export/import sonucu ve oge sayisini kaydet

Mutlaka kanit al:
- passkey create sonucu
- passkey auth sonucu
- export/import sonuc notu

Fail olursa:
- hemen `adb logcat` kesiti al
- `cihaz-matrisi.csv` icinde `FAIL` veya `PASS-WARN` olarak isaretle

## 11:00 - 12:30 Samsung Galaxy A54 / Android 14

Odak:
- unlock
- autofill_browser
- autofill_third_party
- recovery_restore

Yapilacaklar:
- autofill servis etkinlestirme adimini dogrula
- browser ve 3. parti uygulamada doldurma akislarini dene
- recovery session -> code/token -> restore zincirini kaydet

Mutlaka kanit al:
- autofill secim ekrani
- bir browser autofill sonucu
- recovery restore sonucu

## 13:30 - 15:00 Xiaomi Redmi Note / Android 14

Odak:
- unlock
- background_auto_lock
- file_picker_backup
- cloud_sync_upload_download

Yapilacaklar:
- uygulamayi arka plana atip auto-lock davranisini kontrol et
- backup dosya secici akisini dene
- cloud upload/download sonucunu kaydet
- temp dosya veya beklenmeyen dosya kalmis mi kontrol et

Mutlaka kanit al:
- auto-lock sonucu
- file picker davranisi
- cloud sync sonucu

## 15:00 - 16:00 Dusuk RAM veya Biyometri Kapali Cihaz

Odak:
- unlock_fallback
- encrypted_export_import_large
- passkey_prereq_failure

Yapilacaklar:
- biyometri kapaliysa fallback davranisini test et
- daha buyuk veri setiyle export/import dene
- passkey onkosul eksikken kontrollu hata verip vermedigini kaydet

Mutlaka kanit al:
- fallback unlock
- passkey prereq failure mesaji

## 16:00 - 17:00 Sonuc Toplama

- Tum cihazlar icin `cihaz-matrisi.csv` guncelle
- Kanit dosyalarini ilgili klasorlere koy
- Her cihaz sablonunda genel sonucu yaz
- Release blocker var mi kontrol et

Bu saat diliminde su karar verilmeli:
- `Yayina yaklasabilir`
- `Ek cihaz testi gerekir`
- `Kritik blocker var`

## Hemen Blocker Sayilacak Durumlar

- unlock veya recovery sirasinda crash
- yanlis sifre ile importta veri bozulmasi
- cloud sync sonrasi temp sifreli dosyanin kalmasi
- kilitliyken autofill'in veri gostermesi
- passkey akisinin geri donulemez sekilde kitlenmesi

## Gun Sonu Ozet Formati

Asagidaki 5 satirlik ozet yeterlidir:

```text
Build:
Test edilen cihazlar:
PASS sayisi / FAIL sayisi / BLOCKED sayisi:
Kritik blocker:
Yarin icin onerilen aksiyon:
```

## Ertesi Gun Onceligi

Eger blocker yoksa:
- ikinci tur cihaz matrisi genisletme
- passkey ve cloud sync tekrar kosusu

Eger blocker varsa:
- blocker'i yeniden uret
- log ve kaniti issue/plan dokumanina bagla
- sadece blocker kapaninca yeni cihaza gec
