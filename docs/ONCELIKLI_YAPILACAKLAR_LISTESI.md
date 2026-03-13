# Aegis Vault Android - Oncelikli Yapilacaklar Listesi

Bu belge, mevcut guvenlik ve ozellik incelemesinin dogrudan uygulanabilir aksiyon listesine donusturulmus halidir.

## 1. Kritik Oncelik

### 1.1 Sifreli yedekleme KDF'sini Argon2id'e gecir [x]

- Mevcut durumda kasa acilisinda `Argon2id`, sifreli yedeklerde ise `PBKDF2-SHA256` kullaniliyor.
- Hedef: yedekleme sifrelemesinde de `Argon2id` kullanmak.
- Beklenen kazanim:
  - modern brute-force direnci artar
  - urun ici kriptografik tutarlilik saglanir
  - teknik denetimlerde daha guclu gorunur
- Etkilenen alanlar:
  - `src/SecurityModule.ts`
  - `src/BackupModule.ts`
- [x] Durum: Tamamlandi (yeni export KDF: Argon2id, legacy PBKDF2 import uyumlulugu korundu)

### 1.2 Parola saglik denetimi ekle [x]

- Su kontroller eklenmeli:
  - zayif parola tespiti
  - tekrar kullanilan parola tespiti
  - benzer/ufak varyasyonlu parola tespiti
  - bos veya eksik giris tespiti
- Hedef: kasa ici guvenlik puani ve aksiyon onerileri uretmek.
- Beklenen kazanim:
  - kullanici davranis kaynakli riskleri azaltir
  - Bitwarden / 1Password / Proton Pass seviyesine yaklastirir
- [x] Durum: Tamamlandi (zayif/reuse/benzer/bos-eksik tespiti + skor/risk/aksiyon raporu eklendi)

### 1.3 Tehdit modeli ve guvenlik mimarisi dokumani hazirla [x]

- En azindan su basliklar dokumante edilmeli:
  - veri akisi
  - anahtar turetme modeli
  - cihaz uzerindeki saldiri yuzeyi
  - biyometrik akis
  - yedekleme ve bulut senkron guvenligi
  - root/malware varsayimlari
- Cikti olarak su dosyalar eklenmeli:
  - `docs/THREAT_MODEL.md`
  - `docs/SECURITY_ARCHITECTURE.md`
- [x] Durum: Tamamlandi (`docs/THREAT_MODEL.md` ve `docs/SECURITY_ARCHITECTURE.md` eklendi)

## 2. Yuksek Oncelik

### 2.1 Passkey / WebAuthn destegi ekle [x]

- Hedef:
  - passkey saklama
  - passkey ile giris verilerini yonetme
  - Android tarafinda uyumlu autofill/credential akislariyla entegrasyon
- Beklenen kazanim:
  - 2026 standartlarina uyum
  - modern kimlik guvenligi beklentisini karsilar
- [x] Durum: Tamamlandi (passkey kayit formu, detay gorunumu, kategori filtresi ve Android autofill entegrasyonu eklendi)

### 2.2 Root / cihaz butunluk kontrolleri ekle [x]

- Eklenmesi onerilen kontroller:
  - root/jailbreak tespiti
  - debug/tamper tespiti
  - Play Integrity veya benzeri cihaz guven sinyalleri
- Not:
  - bunlar tek basina koruma saglamaz, ama risk gorunurlugunu artirir.
- [x] Durum: Tamamlandi (Android native integrity modulu + lock ekrani ve ayarlar ekraninda risk sinyalleri)

### 2.3 Parola gecmisi ekle [x]

- Her kayit icin onceki parola versiyonlari sifreli sekilde tutulmali.
- Hedef kullanimlar:
  - yanlis degisiklik geri alma
  - parola rotasyon denetimi
  - reuse analizi
- [x] Durum: Tamamlandi (DB migration + history API + detay ekraninda gecmis goruntuleme ve geri yukleme)

### 2.4 Guvenlik olay kaydi (audit trail) ekle [x]

- Kayit altina alinabilecek olaylar:
  - kasa acilis basarili/basarisiz denemeler
  - biyometrik reset
  - export/import islemleri
  - cloud sync upload/download
  - kritik ayar degisiklikleri
- Bu log yerel, kullaniciya gorunur ve opsiyonel sifreli olmali.
- [x] Durum: Tamamlandi (DB audit tablosu + guvenlik olay API'leri + settings ekraninda audit log gorunumu/temizleme)

## 3. Orta Oncelik

### 3.1 Acil erisim veya kurtarma senaryosu tasarla

- Ornekler:
  - guvenilir kisiye gecikmeli erisim
  - acil durum export paketi
  - kurtarma anahtari modeli
- Dikkat:
  - zero-knowledge mantigi bozulmamalidir.

### 3.2 Guvenli paylasim mekanizmasi ekle

- En azindan asagidaki senaryolar desteklenmeli:
  - tek oge paylasimi
  - gecici paylasim baglantisi
  - sifrelenmis aktarim paketi
- Bu alan rakiplerle farki ciddi sekilde kapatir.

### 3.3 Import / export uyumlulugunu genislet

- Hedef formatlar:
  - Bitwarden
  - KeePass/KeePassDX
  - 1Password CSV/JSON siniflari
  - Proton Pass export yapilari
- Beklenen kazanim:
  - gecis bariyerini azaltir
  - benimsenmeyi artirir

### 3.4 Clipboard ve gorunur veri sertlestirmesi yap

- Mevcut otomatik clipboard temizleme iyi durumda.
- Eklenebilecekler:
  - hassas alanlarda copy warning
  - TOTP ve sifre kopyalarinda daha agresif timeout
  - uygulama arka plana gidince hassas gorunumleri maskeleme

## 4. Dusuk / Stratejik Oncelik

### 4.1 Masaustu ve tarayici ekosistemi planla

- Android guclu ama tek basina sinirli kaliyor.
- Uzun vadede:
  - desktop companion
  - browser extension
  - platformlar arasi sifreli senkron

### 4.2 Harici guvenlik denetimi yaptir

- Bagimsiz audit raporu, guvenilirligi ciddi sekilde artirir.
- Ozellikle su alanlar denetlenmeli:
  - key derivation
  - SQLCipher entegrasyonu
  - biometric + keystore flow
  - backup / cloud sync tasarimi

### 4.3 Guvenlik beyaz kagidi yayinla

- Teknik kullanicilar, F-Droid toplulugu ve guvenlik odakli kullanicilar icin faydalidir.

## 5. Rakiplere Yetismek Icin Minimum Hedef Seti

Asagidaki 6 madde tamamlanirsa urun, modern sifre yoneticisi standartlarina anlamli olcude yaklasir:

1. Yedeklerde Argon2id
2. Parola saglik denetimi
3. Passkey destegi
4. Root / integrity kontrolleri
5. Parola gecmisi
6. Tehdit modeli + guvenlik dokumani

## 6. Onerilen Uygulama Sirasi

### Asama 1 - Guvenlik temeli

1. Backup KDF gecisi (`PBKDF2` -> `Argon2id`)
2. Threat model ve security architecture belgeleri
3. Root / integrity kontrolleri

### Asama 2 - Kullanici guvenligi

4. Parola saglik denetimi
5. Parola gecmisi
6. Audit trail

### Asama 3 - Rekabet gucu

7. Passkey/WebAuthn
8. Guvenli paylasim
9. Import/export uyumluluk genisletme

### Asama 4 - Olgunlasma

10. Harici guvenlik auditi
11. Whitepaper
12. Coklu platform stratejisi

## 7. Kisa Yonetici Ozeti

- Proje guvenli bir offline Android sifre yoneticisi temeline sahip.
- En buyuk eksikler: passkey, parola denetimi, parola gecmisi, audit izi, olgun paylasim ve guvenlik dokumani.
- En hizli deger uretecek isler:
  - Argon2id backup gecisi
  - parola saglik denetimi
  - root/integrity kontrolleri
  - guvenlik mimarisi dokumani
