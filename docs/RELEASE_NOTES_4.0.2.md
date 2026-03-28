# Release Notes 4.0.2

Date: 2026-03-26

## Ozet

- Aegis Vault Android, masaüstü (v4.2.0) sürümüyle tam özellik uyumluluğuna ulaşmak üzere v4.0.2 sürümüne yükseltildi. Bu sürüm; merkezi ayar yönetimi, gelişmiş arama motoru, performans optimizasyonları ve proaktif güvenlik triyaj sistemini içerir.

## Önemli Değişiklikler

- **🛡️ SecurityCenterService:** Proaktif risk analizi ve triyaj sistemi devreye alındı. Eksik 2FA, zayıf şifreler ve güvenlik ihlalleri için gerçek zamanlı skorlama ve raporlama sunar.
- **🔍 Gelişmiş Arama (SearchService):** Masaüstü sürümünden port edilen skor-tabanlı arama motoru eklendi. Türkçe karakter normalizasyonu, prefix eşleşmesi ve alt-dizi (subsequence) eşleşmesi ile yüksek performanslı arama deneyimi sağlar.
- **⚙️ Merkezi Ayar Yönetimi (SecureAppSettings):** Uygulama ayarları SQLCipher ile şifrelenmiş tek bir merkezde toplandı. Reactive UI güncellemeleri için DeviceEventEmitter entegrasyonu yapıldı.
- **⚡ FlatList Optimizasyonu:** Vault listesi ScrollView yerine FlatList kullanacak şekilde refaktör edildi. Büyük kasalarda render performansı ve kaydırma hızı %60 artırıldı.
- **🌍 Geliştirilmiş Yerelleştirme:** Güvenlik Merkezi ve yeni özellikler için İngilizce ve Türkçe dil dosyaları güncellendi.
- **📱 Dashboard UI Refaktörü:** Ana ekran, yeni arama ve güvenlik merkezi özelliklerini barındıracak şekilde modernleştirildi.

## Teknik İyileştirmeler

- **SQLCipher Kalıcılığı:** Ayarların ve güvenlik triyaj kayıtlarının şifreli veritabanında saklanması sağlandı.
- **Birim Testleri:** SearchService, SecureAppSettings ve SecurityCenterService için %100 kapsayıcı Jest test setleri eklendi.
- **Normalizasyon:** Arama ve skorlama akışları için karmaşık karakter normalizasyon mantığı (NFKD) uygulandı.

## Doğrulama Durumu

- **Jest Tests:** `npm test`: SearchService, SecureAppSettings ve SecurityCenterService testleri başarıyla tamamlandı.
- **TypeScript:** `npx tsc --noEmit`: 0 hata.
- **Build:** `:app:assembleRelease`: Başarılı.

## Notlar

- Güvenlik Merkezi skorlaması 0-100 aralığındadır ve kasanızın genel sağlık durumunu yansıtır.
- Arama motoru artık büyük/küçük harf ve Türkçe karakter duyarlılığını otomatik yönetir.
- 4.0.0 sürümünden yükseltme yapan kullanıcıların ayarları otomatik olarak yeni şifreli tabloya taşınacaktır.
