export const LegalTexts = {
  tr: {
    terms: `Aegis Vault - Kullanım Koşulları (Terms of Service)

Son Güncelleme: 23 Şubat 2026

1. KABUL VE KAPSAM
Bu uygulamayı ("Aegis Vault") indirerek, kurarak veya kullanarak, işbu Kullanım Koşulları'nı (Sözleşme) okuduğunuzu, anladığınızı ve bağlayıcılığını kabul ettiğinizi beyan edersiniz. Kabul etmiyorsanız lütfen uygulamayı derhal kaldırın.

2. AÇIK KAYNAK VE YEREL VERİBANI (OFFLINE FIRST)
Aegis Vault; yerel (offline) çalışan, SQLCipher destekli, sıfır bilgi (zero-knowledge) prensibiyle inşa edilmiş açık kaynaklı bir şifre yöneticisidir. Verileriniz, uygulamanın kurulu olduğu cihazda şifrelenerek (AES-256-GCM) saklanır. Aegis Vault veya üçüncü şahıslar, şifreleme anahtarınıza (Master Password / Biyometrik Anahtar) veya kasanızın içeriğine kesinlikle erişemez.

3. KULLANICI SORUMLULUĞU
a) Kasa Şifresi: Master parolanızı (Ana Şifrenizi) hatırlamak tamamen kullanıcının sorumluluğundadır. Yazılımın doğası gereği şifrenizi unutursanız verilerinizin kurtarılması kriptografik olarak imkansızdır.
b) Cihaz Güvenliği: Aegis Vault, cihazınız bağlamında ne kadar güvenliyse verileriniz o kadar güvendedir. Kötü amaçlı yazılım bulaşmış (malware/root/jailbreak) cihazlarda verileriniz risk altında olabilir.
c) Yedekleme: Aegis Vault'un bir bulut yedeklemesi kullanılmadığı sürece tüm verilerinizin (Export) manuel olarak yedeğini almak sizin sorumluluğunuzdadır.

4. GARANTİ REDDİ
Bu yazılım, herhangi bir "açık" veya "zımni" garanti olmaksızın, olduğu gibi (AS IS) sağlanmaktadır. Geliştiriciler, kullanımından doğacak doğrudan, dolaylı, arızi veya netice kabilinden doğan veri kayıpları veya maddi zararlar için hiçbir hukuki ve cezai sorumluluk taşımaz. 

5. DEĞİŞİKLİKLER
Geliştirici, bu Kullanım Koşulları'nı ve uygulamanın kaynak kodunu önceden haber vermeksizin güncelleme veya değiştirme hakkını saklı tutar. Uygulamayı kullanmaya devam etmeniz, değiştirilmiş sözleşmeyi kabul ettiğiniz anlamına gelir.
`,
    privacy: `Aegis Vault - Gizlilik Politikası (Privacy Policy)

Son Güncelleme: 23 Şubat 2026

Aegis Vault ("Biz", "Uygulama"), gizliliğinizi temel bir insan hakkı olarak kabul eder. Aegis Vault, tasarım gereği bir "Sıfır Bilgi" (Zero-Knowledge) mimarisine sahiptir.

1. TOPLANAN VERİLER
Hiçbir kişisel veri, analitik verisi, kullanım istatistiği, konum veya reklam takip bilgisi TOPLAMIYORUZ. Aegis Vault tamamen çevrimdışı (offline) çalışacak şekilde dizayn edilmiştir. Tüm parolalarınız, notlarınız, kart bilgileriniz cihazınızda bulunan ve sadece sizin anahtarlarınızla çözülebilen şifreli (AES-256-GCM / SQLCipher) bir veritabanında (%100 yerel) tutulmaktadır.

2. SUNUCU İLETİŞİMİ
a) Bulut Senkronizasyonu (İsteğe Bağlı): Kullanıcı ayarlarından kendi "Cloud Sync" (WebDAV/NextCloud vb.) bağlantısını aktif edip kendi sunucu bilgilerini girerse, ağ bağlantısı sadece o sunucuyla kurulur. Kasanız yine "Aegis Şifreli" (Encrypted JSON) olarak karşıya iletilir. Sunucu sahibi dahil hiç kimse kasa içeriğini okuyamaz.
b) HIBP (Have I Been Pwned): İsteğe bağlı olarak ihlal sorgulaması yapıldığında, Aegis Vault şifreli hashelenmiş verinin sadece ilk 5 karakterini (kAnonimity yöntemiyle) pwnedpasswords.com adresine anonim HTTPS sorgusuyla (K-Anonymity) gönderir. Şifrenizin tam metni dışarı ASLA aktarılmaz.

3. ÜÇÜNCÜ TARAF PAYLAŞIMI
Hiçbir verinizi (çünkü bizde yok) hiçbir reklam şirketi, hükümet otoriteleri, analiz araçları (Crashlytics vb.) veya servis sağlayıcılar ile paylaşmıyoruz, takas etmiyoruz ve satmıyoruz. Uygulamada tracker/reklam bulunmamaktadır.

4. İLETİŞİM
Yazılımın şeffaflığı ve açık kaynak yapısı ile alakalı merak ettiğiniz tüm güvenlik prosedürlerini GitHub sayfamızdan inceleyebilir, denetim (audit) yapabilirsiniz.`
  },
  en: {
    terms: `Aegis Vault - Terms of Use (Terms of Service)

Last Updated: February 23, 2026

1. ACCEPTANCE AND SCOPE
By downloading, installing, or using this application ("Aegis Vault"), you acknowledge that you have read, understood, and agree to be bound by these Terms of Use (Agreement). If you do not agree, please uninstall the application immediately.

2. OPEN SOURCE AND LOCAL DATABASE (OFFLINE FIRST)
Aegis Vault is an offline, SQLCipher-supported, open-source password manager built strictly on a zero-knowledge principle. Your data is encrypted (AES-256-GCM) and kept locally on the device where the application is installed. Aegis Vault or third parties can absolutely not access your encryption key (Master Password / Biometric Key) or the contents of your vault.

3. USER RESPONSIBILITY
a) Vault Password: It is solely the user's responsibility to remember their master password. Due to the nature of the software, recovering your data is cryptographically impossible if you forget your password.
b) Device Security: Aegis Vault is exactly as secure as your device. If your device is compromised by malware (or rooted/jailbroken), your data may be at risk.
c) Backups: Unless using cloud synchronization, manually backing up all your data (Export) is solely your responsibility.

4. DISCLAIMER OF WARRANTY
This software is provided "AS IS" without any express or implied warranty. The developers assume no legal or penal liability for any direct, indirect, incidental, or consequential data loss or financial damages arising from its use.

5. MODIFICATIONS
The developer reserves the right to update or modify these Terms of Use and the application's source code without prior notice. Continued use of the application constitutes acceptance of the modified terms.
`,
    privacy: `Aegis Vault - Privacy Policy

Last Updated: February 23, 2026

Aegis Vault ("We", "Application") considers your privacy a fundamental human right. Aegis Vault inherently features a "Zero-Knowledge" architecture by design.

1. COLLECTED DATA
We DO NOT collect any personal data, analytics data, usage statistics, location, or ad tracking information. Aegis Vault is completely designed to work offline. All your passwords, notes, card details are kept strictly on your device in a 100% local encrypted database (AES-256-GCM / SQLCipher) which can only be decrypted by your keys.

2. SERVER COMMUNICATION
a) Cloud Synchronization (Optional): If the user activates their own "Cloud Sync" (WebDAV/NextCloud, etc.) from the settings and enters their server credentials, the network connection is established solely with that server. Your vault is still uploaded as an "Aegis Encrypted" (Encrypted JSON) bundle. Nobody, not even the server owner, can read the vault contents.
b) HIBP (Have I Been Pwned): When optionally executing a breach query, Aegis Vault utilizes the K-Anonymity model and only securely sends the first 5 characters of a hashed string to pwnedpasswords.com via an anonymous HTTPS request. The full plaintext password is NEVER exported.

3. THIRD-PARTY SHARING
We do not share, trade, or sell any of your data (because we don't have it) with any advertising agency, government authority, analytics tools (e.g., Crashlytics), or service providers. The application contains zero trackers or ads.

4. CONTACT
For transparency regarding the software and open-source nature, you are welcome to audit procedures or inspect the source code hosted on our GitHub page at any time.`
  }
};
