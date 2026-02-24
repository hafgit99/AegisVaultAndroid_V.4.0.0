import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import RNFS from 'react-native-fs';

import tr from './locales/tr.json';
import en from './locales/en.json';

const LANG_FILE = `${RNFS.DocumentDirectoryPath}/aegis_lang.json`;

const resources = {
  tr: { translation: tr },
  en: { translation: en }
};

export const initI18n = async () => {
  let lang = 'tr';
  try {
    const exists = await RNFS.exists(LANG_FILE);
    if (exists) {
      lang = JSON.parse(await RNFS.readFile(LANG_FILE, 'utf8')).lang;
    }
  } catch (e) {
    console.error('Error reading language config:', e);
  }

  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v3' // Fix for React Native
    });
};

export const switchLanguage = async (lang: string) => {
  await i18n.changeLanguage(lang);
  try {
    await RNFS.writeFile(LANG_FILE, JSON.stringify({ lang }), 'utf8');
  } catch (e) {
    console.error('Error saving language config:', e);
  }
};

export default i18n;
