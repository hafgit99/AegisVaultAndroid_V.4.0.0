# Release Notes 0.1.1

Date: 2026-03-15

## Ozet

- Bu surum guvenlik sertlestirmesi, yedekleme ve kurtarma guvenilirligi, Android passkey entegrasyonu, paylasim/aile-ekip alanlari ve test altyapisinda buyuk iyilestirmeler icerir.

## One Cikan Degisiklikler

- Recovery akisinda kritik guvenlik duzeltmeleri yapildi.
- Sifreli export akisi Argon2id zorunlu olacak sekilde sertlestirildi.
- Duz metin export akisina risk onayi eklendi.
- Hassas kopyalama akislarinda clipboard temizleme iyilestirildi.
- Native Android Credential Manager tabanli passkey olusturma ve dogrulama destegi eklendi.
- Passkey formuna hazirlik kontrolleri, durum bilgisi ve daha net kullanici yonlendirmeleri eklendi.
- Password health, account hardening ve opsiyonel breach check katmanlari eklendi.
- Yerel crash monitoring ve release log hijyeni iyilestirildi.
- Offline-first aile / ekip alanlari, uye rolleri ve kayit bazli paylasim atamalari eklendi.

## Teknik Olarak Neler Degisti

- Recovery token ve dogrulama sureci guvenli rastgelelik ve SHA-256 ile guclendirildi.
- Backup ve restore akislarindaki dosya yol/icerik hatalari giderildi.
- Passkey kayitlari icin RP ID, credential ID ve user handle dogrulama/normalize mantigi guclendirildi.
- Android tarafinda Credential Manager bagimliliklari ve native kopru eklendi.
- Password health raporu, account hardening analizi ve gizlilik dostu HIBP k-anonimity sorgu altyapisi eklendi.
- Shared space metadata'si export/import akislarina baglandi.
- Test altyapisi modernize edildi ve paylasim/backup regresyonlari eklendi.

## Dogrulama Durumu

- `npm test -- --runInBand`: 8 suite, 69/69 test gecti
- `npx tsc --noEmit`: gecti
- `:app:assembleRelease`: gecti
- Native passkey create ve verify smoke test: gecti
- Aile / ekip alanlari smoke test: gecti
- Release APK USB uzerinden cihaza kuruldu ve acildi

## Notlar

- Sifreli export icin Argon2id destegi zorunludur.
- Native passkey akisi Android Credential Manager destekleyen cihazlarda etkindir.
- Breach check varsayilan olarak kapalidir ve yalnizca kullanici isterse ag kullanir.
- Aile / ekip alanlari cekirdek kasayi buluta baglamaz; paylasim modeli yerel metadata ve erisim hijyeni uzerinden calisir.
