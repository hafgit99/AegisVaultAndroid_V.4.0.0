const fs = require('fs');

const trPath = 'f:/AegisAndroid/src/locales/tr.json';
const enPath = 'f:/AegisAndroid/src/locales/en.json';

let tr = JSON.parse(fs.readFileSync(trPath, 'utf8'));
let en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

tr.cloud = {
  title: "☁️ Bulut Senkronizasyon (Opsiyonel)",
  url_label: "WebDAV / API URL",
  token_label: "Auth Token",
  pw_label: "Kasa Şifreleme/Çözme Parolası",
  pw_ph: "Bulut yedek şifresi",
  info: "💡 Kasanız buluta aktarılırken cihazdaki veritabanınızdan bağımsız AES-256-GCM ile şifrelenir. Sıfır-bilgi (Zero-Knowledge) prensibi gereği kimse sunucudaki datayı okuyamaz.",
  btn_up: "↑ Gönder",
  btn_down: "↓ İndir",
  err_url: "Lütfen geçerli bir URL girin (http:// veya https://)",
  err_len: "Cloud senkronizasyon şifresi en az 6 karakter olmalıdır.",
  success_up: "Kasa güvenli bir şekilde buluta yüklendi.",
  success_down: "Kasa senkronize edildi. {{imported}} kayıt içe aktarıldı, {{skipped}} atlandı.",
  err_sync: "Senkronizasyon Hatası",
  success: "Başarılı",
  error: "Hata"
};

en.cloud = {
  title: "☁️ Cloud Synchronization (Optional)",
  url_label: "WebDAV / API URL",
  token_label: "Auth Token",
  pw_label: "Vault Encryption/Decryption Password",
  pw_ph: "Cloud backup password",
  info: "💡 Your vault is encrypted independently from the device database using AES-256-GCM before uploading. Following the Zero-Knowledge principle, nobody can read the data on the server.",
  btn_up: "↑ Upload",
  btn_down: "↓ Download",
  err_url: "Please enter a valid URL (http:// or https://)",
  err_len: "Cloud sync password must be at least 6 characters.",
  success_up: "Vault has been securely uploaded to the cloud.",
  success_down: "Vault synchronized. {{imported}} items imported, {{skipped}} skipped.",
  err_sync: "Synchronization Error",
  success: "Success",
  error: "Error"
};

tr.backup = {
  title: "💾 Yedekleme",
  tab_export: "📤 Dışa Aktar",
  tab_import: "📥 İçe Aktar",
  loading: "İşlem devam ediyor...",
  res_success: "✅ İçe Aktarma Tamamlandı",
  res_warn: "⚠️ İçe Aktarma Sonucu",
  res_total: "Toplam",
  res_imported: "Aktarılan",
  res_skipped: "Atlanan",
  res_errors: "Hatalar:",
  err_more: "... ve {{count}} hata daha",
  btn_ok: "Tamam",
  exp_note: "Kasanızdaki tüm kayıtları dışa aktarın. Şifreli format en güvenli seçenektir.",
  warn_text: "CSV ve JSON formatları düz metin olup şifresizdir. Şifreli dışa aktarmayı tercih edin.",
  last_export: "SON DIŞA AKTARIM",
  imp_note: "Desteklenen uygulamalardan dışa aktarılmış dosyayı seçin. Otomatik format algılama aktif.",
  grp_pop: "🏆 Popüler Uygulamalar",
  grp_oth: "🔄 Diğer Uygulamalar",
  grp_gen: "📄 Genel Format",
  auto_detect: "Otomatik algılama",
  enc_exp_title: "🔐 Şifreli Dışa Aktarma",
  enc_exp_desc: "Bu şifre dosyanızı açmak için gerekecektir. Güvenli bir şifre seçin.",
  pw_ph: "Şifre (min. 8 karakter)",
  pw_conf_ph: "Şifre Tekrar",
  err_len8: "Şifre en az 8 karakter olmalıdır.",
  err_match: "Şifreler eşleşmiyor.",
  btn_cancel: "İptal",
  btn_enc_exp: "🔒 Şifrele ve Aktar",
  dec_imp_title: "🔓 Şifreli Dosya",
  dec_imp_desc: "Bu dosya şifrelidir. Açmak için dışa aktarırken kullandığınız şifreyi girin.",
  dec_pw_ph: "Şifre",
  btn_dec_imp: "🔓 Şifre Çöz ve Aktar",
  msg_exp_ok: "✅ Dışa Aktarıldı",
  msg_saved: "Dosya kaydedildi:\\n{{path}}",
  msg_err: "Hata",
  msg_enc_exp_ok: "🔐 Şifreli Dışa Aktarıldı",
  msg_pw_req: "Şifre giriniz.",
  msg_sel_err: "Dosya seçilemedi.",
  msg_dec_err: "Şifre çözme başarısız."
};

en.backup = {
  title: "💾 Backup",
  tab_export: "📤 Export",
  tab_import: "📥 Import",
  loading: "Processing...",
  res_success: "✅ Import Completed",
  res_warn: "⚠️ Import Result",
  res_total: "Total",
  res_imported: "Imported",
  res_skipped: "Skipped",
  res_errors: "Errors:",
  err_more: "... and {{count}} more error(s)",
  btn_ok: "OK",
  exp_note: "Export all items from your vault. The encrypted format is the safest option.",
  warn_text: "CSV and JSON formats are plain text. Prefer the encrypted export.",
  last_export: "LAST EXPORT",
  imp_note: "Select an exported file from supported apps. Automatic format detection is active.",
  grp_pop: "🏆 Popular Apps",
  grp_oth: "🔄 Other Apps",
  grp_gen: "📄 Generic formats",
  auto_detect: "Auto detection",
  enc_exp_title: "🔐 Encrypted Export",
  enc_exp_desc: "This password will be required to open the file. Choose a secure password.",
  pw_ph: "Password (min. 8 chars)",
  pw_conf_ph: "Confirm Password",
  err_len8: "Password must be at least 8 characters.",
  err_match: "Passwords do not match.",
  btn_cancel: "Cancel",
  btn_enc_exp: "🔒 Encrypt & Export",
  dec_imp_title: "🔓 Encrypted File",
  dec_imp_desc: "This file is encrypted. Enter the password you used during export.",
  dec_pw_ph: "Password",
  btn_dec_imp: "🔓 Decrypt & Import",
  msg_exp_ok: "✅ Exported",
  msg_saved: "File saved:\\n{{path}}",
  msg_err: "Error",
  msg_enc_exp_ok: "🔐 Encrypted Export Successful",
  msg_pw_req: "Please enter a password.",
  msg_sel_err: "Could not select file.",
  msg_dec_err: "Decryption failed."
};

tr.att = { size_err_t: "Boyut Hatası", size_err_m: "Dosya boyutu 50 MB'ı aşamaz.",
          succ_t: "Başarılı", succ_m: "Dosya şifreli kasaya eklendi.",
          err_t: "Hata", err_add: "Dosya eklenemedi.", err_read: "Dosya okunamadı.",
          dl_t: "İndirildi", dl_m: "Dosya kaydedildi:\\n{{path}}",
          dl_err: "Dosya indirilemedi.",
          del_t: "Eki Sil", del_m: "Silinsin mi?", del_btn: "Sil", cancel: "İptal",
          hdr: "Ekler", hdr_sub: "{{count}} dosya", btn_add: "Dosya Ekle" };

en.att = { size_err_t: "Size Error", size_err_m: "File size cannot exceed 50 MB.",
          succ_t: "Success", succ_m: "File added to the encrypted vault.",
          err_t: "Error", err_add: "Could not add file.", err_read: "Could not read file.",
          dl_t: "Downloaded", dl_m: "File saved:\\n{{path}}",
          dl_err: "File could not be downloaded.",
          del_t: "Delete Attachment", del_m: "Delete this file?", del_btn: "Delete", cancel: "Cancel",
          hdr: "Attachments", hdr_sub: "{{count}} files", btn_add: "Add File" };
          
tr.lock_screen.biometric_prompt = "Aegis Kasasını Aç";
tr.lock_screen.biometric_fallback = "PIN Kullan";
en.lock_screen.biometric_prompt = "Unlock Aegis Vault";
en.lock_screen.biometric_fallback = "Use PIN";

fs.writeFileSync(trPath, JSON.stringify(tr, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2), 'utf8');
