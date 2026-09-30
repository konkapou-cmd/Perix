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
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const handleLanguageChange = async (langCode: string) => {
    await setStoredLanguage(langCode);
    setLanguageModalVisible(false);
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    if (!acceptedTerms) {
      setErrorMessage(t("auth.acceptTermsRequired", "You must accept the Terms of Service and confirm that you are at least 16 years old."));
      return;
    }
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }}>
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
              <Ionicons name="globe-outline" size={18} color="#59ABE3" />
              <Text style={styles.languageSelectorText}>{currentLanguage.nativeName}</Text>
              <Ionicons name="chevron-down" size={16} color="#264348" />
            </Pressable>

            <View style={styles.logoCard}>
              <View style={styles.brandWrap}>
                <Text style={styles.brandTitle}>Perıx</Text>
                <Ionicons name="sunny" size={14} color="#FFC93C" style={styles.brandSun} />
              </View>
              <Text style={styles.subtitle}>{t("brand.subtitle")}</Text>
            </View>

          <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>{t("auth.signInTitle")}</Text>

          {/* Login / Register choice comes first - before any input */}
          <View style={styles.modeToggle}>
            <Pressable style={[styles.modeOption, styles.modeOptionActive]} disabled>
              <Text style={[styles.modeOptionText, styles.modeOptionTextActive]}>
                {t("auth.signIn")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.modeOption}
              onPress={() => router.push("/register" as any)}
              data-testid="goto-register"
            >
              <Text style={styles.modeOptionText}>{t("auth.createAccount")}</Text>
            </Pressable>
          </View>

          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={20} color="#264348" />
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
            <Ionicons name="lock-closed-outline" size={20} color="#264348" />
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

          <Pressable
            style={styles.termsRow}
            onPress={() => setAcceptedTerms((v) => !v)}
            testID="login-terms-checkbox"
          >
            <Ionicons
              name={acceptedTerms ? "checkbox" : "square-outline"}
              size={20}
              color={acceptedTerms ? "#59ABE3" : "#6b7280"}
            />
            <Text style={styles.termsText}>
              {t("auth.termsAcceptance")}{" "}
              <Text
                style={styles.termsLink}
                onPress={(e) => {
                  (e as any).stopPropagation?.();
                  router.push("/terms-of-service" as any);
                }}
              >
                {t("auth.termsLink", "Terms of Service")}
              </Text>
              {" " + t("common.and", "and") + " "}
              <Text
                style={styles.termsLink}
                onPress={(e) => {
                  (e as any).stopPropagation?.();
                  router.push("/privacy-policy" as any);
                }}
              >
                {t("auth.privacyLink", "Privacy Policy")}
              </Text>
            </Text>
          </Pressable>

          <Link href="/forgot-password" style={styles.forgotLink}>
            {t("auth.forgotPassword", "Passwort vergessen?")}
          </Link>

          <View style={styles.securedByContainer}>
            <Ionicons name="shield-checkmark" size={14} color="#10b981" />
            <Text style={styles.securedByText}>{t("auth.securedBy", "LOG IN SECURED BY")}</Text>
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
                    <Ionicons name="checkmark" size={20} color="#59ABE3" />
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
    backgroundColor: "#ffffff",
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
  brandWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  brandSun: {
    position: "absolute",
    right: 16,
    top: 0,
  },
  brandTitle: {
    fontSize: 44,
    fontWeight: "800",
    color: "#096BFF",
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#264348",
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
    color: "#264348",
    marginBottom: 16,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  modeOption: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modeOptionActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  modeOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  modeOptionTextActive: {
    color: "#264348",
    fontWeight: "700",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#4b5563",
  },
  termsLink: {
    color: "#59ABE3",
    fontWeight: "700",
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
    color: "#264348",
    ...Platform.select({ web: { pointerEvents: "auto" } }),
  },
  primaryButton: {
    backgroundColor: "#59ABE3",
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
    color: "#264348",
  },
  footerLink: {
    color: "#59ABE3",
    fontWeight: "600",
  },
  languageSelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(89,171,227,0.12)",
    borderRadius: 20,
    marginBottom: 20,
  },
  languageSelectorText: {
    color: "#59ABE3",
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
    color: "#264348",
  },
  languageOptionTextSelected: {
    color: "#59ABE3",
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
  forgotLink: {
    textAlign: "center",
    color: "#59ABE3",
    fontSize: 14,
    fontWeight: "500",
    marginTop: 16,
  },
});
