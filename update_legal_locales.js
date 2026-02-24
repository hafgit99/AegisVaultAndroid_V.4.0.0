const fs = require('fs');

const trPath = 'f:/AegisAndroid/src/locales/tr.json';
const enPath = 'f:/AegisAndroid/src/locales/en.json';

let tr = JSON.parse(fs.readFileSync(trPath, 'utf8'));
let en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

tr.legal = {
  terms: "Kullanım Koşulları",
  privacy: "Gizlilik Politikası",
  legal_and_privacy: "Kullanım Koşulları & Gizlilik",
  disclaimer: "Bu uygulamayı kullanarak {{terms}} ve {{privacy}} şartlarını kabul etmiş sayılırsınız."
};

en.legal = {
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  legal_and_privacy: "Terms & Privacy",
  disclaimer: "By using this application, you agree to the {{terms}} and {{privacy}}."
};

fs.writeFileSync(trPath, JSON.stringify(tr, null, 2), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2), 'utf8');
