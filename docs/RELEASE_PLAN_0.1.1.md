# Release Plan 0.1.1

Date: 2026-03-15

## 1) Imza Dogrulama Sonucu

Checked artifact:
- `android/app/build/outputs/apk/release/app-release.apk`

Verification (`apksigner verify --print-certs`) result:
- APK signature valid: Yes
- Signer DN: `C=US, O=Android, CN=Android Debug`
- Meaning: This APK is signed with the debug keystore, not a production release key.

Decision:
- USB/manual install for personal testing: OK
- Public release (Play Store/open beta distribution): NOT recommended with debug signing.

Required action for production distribution:
- Configure release signing credentials:
  - `RELEASE_STORE_FILE`
  - `RELEASE_STORE_PASSWORD`
  - `RELEASE_KEY_ALIAS`
  - `RELEASE_KEY_PASSWORD`
- Rebuild release APK/AAB with release key.

## 2) Yayin Notu Taslagi (0.1.1)

Baslik:
- Aegis Vault Android v0.1.1 (Security & Reliability Update)

Ozet:
- Bu surum guvenlik sertlestirmesi, yedekleme/kurtarma guvenilirligi ve test altyapisinda buyuk iyilestirmeler icerir.

Degisiklikler:
- Recovery akisinda kritik guvenlik duzeltmeleri:
  - Guvenli rastgelelik kullanimi
  - Dogrulama/log sızıntisi risklerinin kapatilmasi
  - Dosya path/icerik hatalarinin duzeltilmesi
  - Gercek SHA-256 butunluk kontrolu
- Sifreli yedekleme guclendirildi:
  - Yeni export akisi Argon2id zorunlu hale getirildi
  - Sessiz PBKDF2 geri dusus davranisi kaldirildi
- Duz metin export akisina risk onay adimi eklendi.
- Clipboard temizleme davranisi hassas kopyalama akislarinda iyilestirildi.
- Test altyapisi modernize edildi:
  - 6 aktif suite, 56/56 test geciyor
  - App smoke testi stabilize edildi (timer hang sorunu giderildi)

Not:
- Bu surumde davranis degisikligi olarak sifreli export icin Argon2id destegi zorunludur.

## 3) Rollout Yuzdesi Onerisi

Recommended staged rollout (production key ile imzali build icin):
1. Internal testing: %100 (ekip/cihaz havuzu), 24 saat
2. Closed beta: %10, 24 saat
3. Closed beta: %25, 24 saat
4. Closed beta: %50, 24-48 saat
5. Production: %100 (major crash/security issue yoksa)

Rollback trigger:
- Crash-free sessions < %99.5
- Backup/restore/recovery alaninda kritik hata bildirimi
- Data loss veya unlock failure raporlari

Go criteria:
- Crash/fatal yok
- Backup + restore + recovery smoke test tam
- Biometric unlock and autofill temel akislar saglam
