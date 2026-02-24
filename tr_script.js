const fs = require('fs');
const path = 'f:/AegisAndroid/src/components/BackupModal.tsx';
let txt = fs.readFileSync(path, 'utf8');

if (!txt.includes('useTranslation')) {
  txt = txt.replace(
    /import React, { useState, useEffect } from 'react';/,
    "import React, { useState, useEffect } from 'react';\nimport { useTranslation } from 'react-i18next';"
  );
  txt = txt.replace(/export const BackupModal = \({ visible, onClose, onImportDone }: Props\) => {/, "export const BackupModal = ({ visible, onClose, onImportDone }: Props) => {\n  const { t } = useTranslation();");
}

// Replace Strings
txt = txt.replace(/'✅ Dışa Aktarıldı'/g, "t('backup.msg_exp_ok')");
txt = txt.replace(/Dosya kaydedildi:\\n\$\{path\}/g, "t('backup.msg_saved', { path })");
txt = txt.replace(/'Dışa aktarma başarısız.'/g, "'Export failed.'");
txt = txt.replace(/'Şifre en az 8 karakter olmalıdır.'/g, "t('backup.err_len8')");
txt = txt.replace(/'Şifreler eşleşmiyor.'/g, "t('backup.err_match')");
txt = txt.replace(/'🔐 Şifreli Dışa Aktarıldı'/g, "t('backup.msg_enc_exp_ok')");
txt = txt.replace(/'Şifreli dışa aktarma başarısız.'/g, "'Encrypted export failed.'");
txt = txt.replace(/'Dosya seçilemedi.'/g, "t('backup.msg_sel_err')");
txt = txt.replace(/'Şifre giriniz.'/g, "t('backup.msg_pw_req')");
txt = txt.replace(/'Şifre çözme başarısız.'/g, "t('backup.msg_dec_err')");
txt = txt.replace(/'Hata'/g, "t('backup.msg_err')");

txt = txt.replace(/<Text style=\{st.headerTitle\}>💾 Yedekleme<\/Text>/, "<Text style={st.headerTitle}>{t('backup.title')}</Text>");
txt = txt.replace(/>📤 Dışa Aktar<\/Text>/, ">{t('backup.tab_export')}</Text>");
txt = txt.replace(/>📥 İçe Aktar<\/Text>/, ">{t('backup.tab_import')}</Text>");
txt = txt.replace(/>İşlem devam ediyor\.\.\.<\/Text>/, ">{t('backup.loading')}</Text>");
txt = txt.replace(/\{result\.imported > 0 \? '✅ İçe Aktarma Tamamlandı' : '⚠️ İçe Aktarma Sonucu'\}/, "{result.imported > 0 ? t('backup.res_success') : t('backup.res_warn')}");

txt = txt.replace(/>Toplam<\/Text>/, ">{t('backup.res_total')}</Text>");
txt = txt.replace(/>Aktarılan<\/Text>/, ">{t('backup.res_imported')}</Text>");
txt = txt.replace(/>Atlanan<\/Text>/, ">{t('backup.res_skipped')}</Text>");
txt = txt.replace(/>Hatalar:<\/Text>/, ">{t('backup.res_errors')}</Text>");
txt = txt.replace(/\.\.\. ve \{result\.errors\.length - 5\} hata daha/g, "{t('backup.err_more', { count: result.errors.length - 5 })}");
txt = txt.replace(/>Tamam<\/Text>/, ">{t('backup.btn_ok')}</Text>");

txt = txt.replace(/>\s*Kasanızdaki tüm kayıtları dışa aktarın\. Şifreli format en güvenli seçenektir\.\s*<\/Text>/, ">{t('backup.exp_note')}</Text>");
txt = txt.replace(/>\s*CSV ve JSON formatları düz metin olup şifresizdir\. Şifreli dışa aktarmayı tercih edin\.\s*<\/Text>/, ">{t('backup.warn_text')}</Text>");
txt = txt.replace(/>SON DIŞA AKTARIM<\/Text>/, ">{t('backup.last_export')}</Text>");

txt = txt.replace(/>\s*Desteklenen uygulamalardan dışa aktarılmış dosyayı seçin\. Otomatik format algılama aktif\.\s*<\/Text>/, ">{t('backup.imp_note')}</Text>");
txt = txt.replace(/>🏆 Popüler Uygulamalar<\/Text>/, ">{t('backup.grp_pop')}</Text>");
txt = txt.replace(/>🔄 Diğer Uygulamalar<\/Text>/, ">{t('backup.grp_oth')}</Text>");
txt = txt.replace(/>📄 Genel Format<\/Text>/, ">{t('backup.grp_gen')}</Text>");
txt = txt.replace(/>Otomatik algılama<\/Text>/, ">{t('backup.auto_detect')}</Text>");

txt = txt.replace(/>🔐 Şifreli Dışa Aktarma<\/Text>/, ">{t('backup.enc_exp_title')}</Text>");
txt = txt.replace(/>Bu şifre dosyanızı açmak için gerekecektir\. Güvenli bir şifre seçin\.<\/Text>/, ">{t('backup.enc_exp_desc')}</Text>");
txt = txt.replace(/placeholder="Şifre \(min\. 8 karakter\)"/, "placeholder={t('backup.pw_ph')}");
txt = txt.replace(/placeholder="Şifre Tekrar"/, "placeholder={t('backup.pw_conf_ph')}");
txt = txt.replace(/>Şifre en az 8 karakter olmalıdır\.<\/Text>/g, ">{t('backup.err_len8')}</Text>");
txt = txt.replace(/>Şifreler eşleşmiyor\.<\/Text>/g, ">{t('backup.err_match')}</Text>");
txt = txt.replace(/>İptal<\/Text>/g, ">{t('backup.btn_cancel')}</Text>");
txt = txt.replace(/>🔒 Şifrele ve Aktar<\/Text>/, ">{t('backup.btn_enc_exp')}</Text>");

txt = txt.replace(/>🔓 Şifreli Dosya<\/Text>/, ">{t('backup.dec_imp_title')}</Text>");
txt = txt.replace(/>Bu dosya şifrelidir\. Açmak için dışa aktarırken kullandığınız şifreyi girin\.<\/Text>/, ">{t('backup.dec_imp_desc')}</Text>");
txt = txt.replace(/placeholder="Şifre"/, "placeholder={t('backup.dec_pw_ph')}");
txt = txt.replace(/>🔓 Şifre Çöz ve Aktar<\/Text>/, ">{t('backup.btn_dec_imp')}</Text>");

fs.writeFileSync(path, txt, 'utf8');

const attPath = 'f:/AegisAndroid/src/components/AttachmentSection.tsx';
let att = fs.readFileSync(attPath, 'utf8');
if (!att.includes('useTranslation')) {
  att = att.replace(/import React, \{ useState \} from 'react';/, "import React, { useState } from 'react';\nimport { useTranslation } from 'react-i18next';");
  att = att.replace(/export const AttachmentSection = \(\{ itemId, attachments, onRefresh, pendingFiles, setPendingFiles \}: Props\) => \{/, "export const AttachmentSection = ({ itemId, attachments, onRefresh, pendingFiles, setPendingFiles }: Props) => {\n  const { t } = useTranslation();");
}

att = att.replace(/'Boyut Hatası'/g, "t('att.size_err_t')");
att = att.replace(/'Dosya boyutu 50 MB\\'ı aşamaz\.'/g, "t('att.size_err_m')");
att = att.replace(/'Başarılı'/g, "t('att.succ_t')");
att = att.replace(/'Dosya şifreli kasaya eklendi\.'/g, "t('att.succ_m')");
att = att.replace(/'Dosya eklenemedi\.'/g, "t('att.err_add')");
att = att.replace(/'Dosya okunamadı\.'/g, "t('att.err_read')");
att = att.replace(/'İndirildi'/g, "t('att.dl_t')");
att = att.replace(/Dosya kaydedildi:\\n\$\{path\}/g, "t('att.dl_m', { path })");
att = att.replace(/'Dosya indirilemedi\.'/g, "t('att.dl_err')");
att = att.replace(/'Eki Sil'/g, "t('att.del_t')");
att = att.replace(/"([^"]+)" silinsin mi\?/g, "t('att.del_m')");
att = att.replace(/'Sil'/g, "t('att.del_btn')");
att = att.replace(/'İptal'/g, "t('att.cancel')");
att = att.replace(/'Hata'/g, "t('att.err_t')");
att = att.replace(/>Ekler<\/Text>/g, ">{t('att.hdr')}</Text>");
att = att.replace(/\{attachments\.length \+ pendingFiles\.length\} dosya/g, "{t('att.hdr_sub', { count: attachments.length + pendingFiles.length })}");
att = att.replace(/>Dosya Ekle<\/Text>/g, ">{t('att.btn_add')}</Text>");

fs.writeFileSync(attPath, att, 'utf8');
console.log('Done');
