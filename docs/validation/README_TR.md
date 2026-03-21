# Validation Workspace

Bu klasor, gercek cihaz testlerinden gelen saha kanitlarini tek yerde toplamak icin kullanilir.

## Icerik

- [cihaz-matrisi.csv](/f:/AegisAndroid_publish/docs/validation/cihaz-matrisi.csv): ilk tur cihaz ve senaryo takip tablosu
- `kanit/`: ekran goruntusu, video, logcat ve cihaz bazli notlar
- [ILK_SAHA_TEST_KOSUSU_GOREV_LISTESI_TR.md](/f:/AegisAndroid_publish/docs/ILK_SAHA_TEST_KOSUSU_GOREV_LISTESI_TR.md): ilk fiziksel cihaz kosusu icin uygulanabilir gorev listesi
- [GUNLUK_SAHA_TEST_OPERASYON_PLANI_TR.md](/f:/AegisAndroid_publish/docs/GUNLUK_SAHA_TEST_OPERASYON_PLANI_TR.md): tek gunluk saha test zamani ve oncelik plani

## Kullanim

1. Teste baslamadan once `cihaz-matrisi.csv` icinde ilgili cihazin satirlarini bulun.
2. Her senaryodan sonra `result`, `owner`, `evidence_path` ve `notes` alanlarini doldurun.
3. Fail veya warn durumlarinda `kanit/` altina ekran goruntusu, video veya logcat koyun.
4. Tur sonunda ozet bulgulari:
   - [RELEASE_READINESS.md](/f:/AegisAndroid_publish/docs/RELEASE_READINESS.md)
   - [ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md](/f:/AegisAndroid_publish/docs/ONCELIKLI_GUVENLIK_IYILESTIRME_PLANI_TR.md)
   dosyalarina yansitin.

## Sonuc Kodlari

- `PASS`
- `PASS-WARN`
- `FAIL`
- `BLOCKED`

## Onerilen Kanit Dosya Adi

```text
YYYY-MM-DD_vendor-model_androidXX_scenario_result
```

Ornek:

```text
2026-03-21_pixel8_android15_unlock_pass.png
2026-03-21_galaxya54_android14_cloud_sync_fail.log
```
