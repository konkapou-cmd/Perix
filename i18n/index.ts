import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import en from './locales/en.json';
import de from './locales/de.json';
import el from './locales/el.json';
import es from './locales/es.json';
import sq from './locales/sq.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import sr from './locales/sr.json';
import pl from './locales/pl.json';
import ru from './locales/ru.json';

export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'sr', name: 'Serbian', nativeName: 'Srpski' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
];

const resources = {
  en: { translation: en },
  de: { translation: de },
  el: { translation: el },
  es: { translation: es },
  sq: { translation: sq },
  fr: { translation: fr },
  it: { translation: it },
  sr: { translation: sr },
  pl: { translation: pl },
  ru: { translation: ru },
};

const LANGUAGE_KEY = 'user_language';

export const getStoredLanguage = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredLanguage = async (language: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
    await i18n.changeLanguage(language);
  } catch (error) {
    console.error('Failed to save language:', error);
  }
};

export const initI18n = async () => {
  let savedLanguage = await getStoredLanguage();
  
  // If no saved language, try to get device language
  if (!savedLanguage) {
    const locales = Localization.getLocales?.();
    const deviceLocale = (locales?.[0]?.languageCode || 'en') as string;
    // Only use device language if it's one of our supported languages
    savedLanguage = ['en', 'de', 'el', 'es', 'sq', 'fr', 'it', 'sr', 'pl', 'ru'].includes(deviceLocale) ? deviceLocale : 'en';
  }

  await i18n.use(initReactI18next).init({
    compatibilityJSON: 'v3' as const,
    resources,
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  } as any);
};

// Initialize immediately
initI18n();

export default i18n;
