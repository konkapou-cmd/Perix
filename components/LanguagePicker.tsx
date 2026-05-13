import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
];

interface LanguagePickerProps {
  visible: boolean;
  onClose: () => void;
}

export const LanguagePicker: React.FC<LanguagePickerProps> = ({ visible, onClose }) => {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;

  const handleChangeLanguage = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
    // Save to localStorage if available
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('preferredLanguage', languageCode);
      }
    } catch (e) {
      // localStorage might not be available in React Native
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile.selectLanguage', 'Select Language')}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
        </View>

        {/* Language List */}
        <ScrollView style={styles.scrollContainer}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              style={[
                styles.languageItem,
                currentLanguage === lang.code && styles.languageItemSelected,
              ]}
              onPress={() => handleChangeLanguage(lang.code)}
            >
              <View style={styles.languageContent}>
                <Text style={styles.languageName}>{lang.nativeName}</Text>
                <Text style={styles.languageSubtitle}>{lang.name}</Text>
              </View>
              {currentLanguage === lang.code && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark-circle" size={24} color="#000000" />
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 8,
  },
  scrollContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 8,
    marginVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  languageItemSelected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#000000',
  },
  languageContent: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  languageSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  checkmark: {
    marginLeft: 12,
  },
});
