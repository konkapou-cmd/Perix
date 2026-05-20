import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGES, setStoredLanguage } from "../../i18n";
import CityAutocompleteInput from "../../components/CityAutocompleteInput";

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const { register, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user) {
      router.replace("/(tabs)/home");
    }
  }, [user, router]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [cityLat, setCityLat] = useState<number | undefined>(undefined);
  const [cityLng, setCityLng] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = async (langCode: string) => {
    await setStoredLanguage(langCode);
    setLanguageModalVisible(false);
  };

  const handleCitySelect = (cityName: string, lat: number, lng: number) => {
    setCityLat(lat || undefined);
    setCityLng(lng || undefined);
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password || !city) return;
    if (password.length < 4) {
      setErrorMessage(t("auth.passwordTooShort", "Password must be at least 4 characters"));
      return;
    }
    try {
      setLoading(true);
      setErrorMessage("");
      await register(
        firstName.trim(),
        lastName.trim(),
        email.trim(),
        password,
        city.trim(),
        cityLat,
        cityLng
      );
      if (city.trim()) await AsyncStorage.setItem("@onboarding_city", city.trim());
      const done = await AsyncStorage.getItem("@onboarding_complete");
      router.replace(done === "true" ? "/(tabs)/home" : "/onboarding");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth.checkCredentials");
      console.error("[Register] Failed:", message, error);
      setErrorMessage(message);
      Alert.alert(t("auth.signUpFailed"), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Language Selector */}
          <Pressable
            style={styles.languageSelector}
            onPress={() => setLanguageModalVisible(true)}
            data-testid="language-selector-register"
          >
            <Ionicons name="globe-outline" size={18} color="#000000" />
            <Text style={styles.languageSelectorText}>{currentLanguage.nativeName}</Text>
            <Ionicons name="chevron-down" size={16} color="#6b7280" />
          </Pressable>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t("auth.createAccount")}</Text>
            <Text style={styles.subtitle}>{t("brand.subtitle")}</Text>

            <View style={styles.nameRow}>
              <View style={[styles.inputRow, styles.nameInput]}>
                <Ionicons name="person-outline" size={20} color="#6b7280" />
                <TextInput
                  value={firstName}
                  onChangeText={(value) => {
                    setFirstName(value);
                    setErrorMessage("");
                  }}
                  placeholder={t("auth.firstName", "First Name")}
                  testID="register-first-name"
                  accessibilityLabel="register-first-name"
                  style={styles.input}
                />
              </View>
              <View style={[styles.inputRow, styles.nameInput]}>
                <Ionicons name="person-outline" size={20} color="#6b7280" />
                <TextInput
                  value={lastName}
                  onChangeText={(value) => {
                    setLastName(value);
                    setErrorMessage("");
                  }}
                  placeholder={t("auth.lastName", "Last Name")}
                  testID="register-last-name"
                  accessibilityLabel="register-last-name"
                  style={styles.input}
                />
              </View>
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={20} color="#6b7280" />
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setErrorMessage("");
                }}
                placeholder={t("auth.email")}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="register-email"
                accessibilityLabel="register-email"
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={20} color="#6b7280" />
              <TextInput
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setErrorMessage("");
                }}
                placeholder={t("auth.password")}
                secureTextEntry
                testID="register-password"
                accessibilityLabel="register-password"
                style={styles.input}
              />
            </View>

            <CityAutocompleteInput
              value={city}
              onChangeText={(value) => {
                setCity(value);
                if (!value) {
                  setCityLat(undefined);
                  setCityLng(undefined);
                }
                setErrorMessage("");
              }}
              onSelectCity={handleCitySelect}
              placeholder={t("auth.city", "City")}
            />

            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              testID="register-submit"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("auth.signUp")}</Text>
              )}
            </Pressable>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Text style={styles.footerText}>
              {t("auth.alreadyHaveAccount")}{" "}
              <Link href="/login" replace style={styles.footerLink}>
                {t("auth.signIn")}
              </Link>
            </Text>
          </View>
        </ScrollView>

        {/* Language Selection Modal */}
        <Modal
          visible={languageModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguageModalVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setLanguageModalVisible(false)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t("auth.selectLanguage")}</Text>
              {LANGUAGES.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[
                    styles.languageOption,
                    i18n.language === lang.code && styles.languageOptionSelected,
                  ]}
                  onPress={() => handleLanguageChange(lang.code)}
                  data-testid={`register-language-option-${lang.code}`}
                >
                  <Text
                    style={[
                      styles.languageOptionText,
                      i18n.language === lang.code && styles.languageOptionTextSelected,
                    ]}
                  >
                    {lang.nativeName}
                  </Text>
                  {i18n.language === lang.code && (
                    <Ionicons name="checkmark" size={20} color="#000000" />
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: "#f5f6fb",
    justifyContent: "center",
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#111827",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 18,
  },
  nameRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  nameInput: {
    flex: 1,
    marginBottom: 0,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 4 }),
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    ...Platform.select({ web: { pointerEvents: "auto" } }),
  },
  primaryButton: {
    backgroundColor: "#000000",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    marginTop: 6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  footerText: {
    textAlign: "center",
    marginTop: 16,
    color: "#6b7280",
  },
  footerLink: {
    color: "#000000",
    fontWeight: "600",
  },
  errorText: {
    color: "#ef4444",
    marginTop: 10,
    textAlign: "center",
  },
  languageSelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#eef2ff",
    borderRadius: 20,
    marginBottom: 20,
  },
  languageSelectorText: {
    color: "#000000",
    fontWeight: "600",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "80%",
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
  languageOptionSelected: {
    backgroundColor: "#eef2ff",
  },
  languageOptionText: {
    fontSize: 16,
    color: "#374151",
  },
  languageOptionTextSelected: {
    color: "#000000",
    fontWeight: "600",
  },
});
