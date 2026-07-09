import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGES, setStoredLanguage } from "../../i18n";
import { COLORS } from "../../lib/designTokens";

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { login, user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  useEffect(() => {
    if (user) {
      router.replace("/(tabs)/home");
    }
  }, [user, router]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = async (langCode: string) => {
    await setStoredLanguage(langCode);
    setLanguageModalVisible(false);
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      setLoading(true);
      setErrorMessage("");
      await login(email.trim(), password);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("auth.checkCredentials");
      setErrorMessage(message);
      Alert.alert(t("auth.signInFailed"), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.backgroundPage }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.innerContainer}>
            {/* Language Selector */}
            <Pressable
              style={styles.languageSelector}
              onPress={() => setLanguageModalVisible(true)}
              data-testid="language-selector"
            >
              <Ionicons name="globe-outline" size={18} color={COLORS.primaryDark} />
              <Text style={styles.languageSelectorText}>{currentLanguage.nativeName}</Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </Pressable>

            <View style={styles.logoCard}>
              <Image
                source={require("../../assets/images/prx-adaptive-icon.png")}
                style={styles.logo}
              />
              <Text style={styles.brandTitle}>{t("brand.title")}</Text>
              <Text style={styles.subtitle}>{t("brand.subtitle")}</Text>
            </View>

          <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>{t("auth.signInTitle")}</Text>
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
              testID="login-email"
              accessibilityLabel="login-email"
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
              testID="login-password"
              accessibilityLabel="login-password"
              style={styles.input}
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />
          </View>

          <Pressable
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            testID="login-submit"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{t("auth.signIn")}</Text>
            )}
          </Pressable>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.securedByContainer}>
            <Ionicons name="shield-checkmark" size={14} color="#10b981" />
            <Text style={styles.securedByText}>LOG IN SECURED BY</Text>
            <Text style={styles.securedByBrand}>PERIX</Text>
          </View>

          <Text style={styles.footerText}>
            {t("auth.newHere")}{" "}
            <Link href="/register" replace style={styles.footerLink}>
              {t("auth.createAccount")}
            </Link>
          </Text>
          </View>
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
                  data-testid={`language-option-${lang.code}`}
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
                    <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingVertical: 24,
    paddingHorizontal: 24,
    backgroundColor: COLORS.backgroundPage,
    justifyContent: "center",
    alignItems: "center",
  },
  innerContainer: {
    width: "100%",
    ...Platform.select({
      web: {
        maxWidth: 440,
      },
      default: {},
    }),
  },
  logoCard: {
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 8,
    borderRadius: 70,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6b7280",
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: COLORS.textPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 16,
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
    color: COLORS.textPrimary,
    ...Platform.select({ web: { pointerEvents: "auto" } }),
  },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: "#ef4444",
    marginTop: 10,
    textAlign: "center",
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
    color: COLORS.primaryDark,
    fontWeight: "600",
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
    color: COLORS.primaryDark,
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
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surfaceSoft,
  },
  languageOptionSelected: {
    backgroundColor: "#eef2ff",
  },
  languageOptionText: {
    fontSize: 16,
    color: "#374151",
  },
  languageOptionTextSelected: {
    color: COLORS.primaryDark,
    fontWeight: "600",
  },
  securedByContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 6,
  },
  securedByText: {
    fontSize: 11,
    color: "#10b981",
    fontWeight: "600",
    letterSpacing: 1,
  },
  securedByBrand: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
