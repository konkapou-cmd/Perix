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
import { useAuth } from "../../context/AuthContext";
import { LANGUAGES, setStoredLanguage } from "../../i18n";
import { COLORS } from "../../lib/designTokens";
import { apiRequest, CategoryGroup } from "../../lib/api";
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
  const [role, setRole] = useState<"user" | "business">("user");
  const [rootCategory, setRootCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [businessName, setBusinessName] = useState("");

  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [pickerStep, setPickerStep] = useState<"root" | "sub">("root");
  const [selectedRoot, setSelectedRoot] = useState<CategoryGroup | null>(null);

  useEffect(() => {
    apiRequest<{ categories: CategoryGroup[] }>("/businesses/category-tree", "GET", null)
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  const getSubsForRoot = (root: CategoryGroup) =>
    root.subcategories ?? root.groups?.flatMap((g) => g.subcategories ?? []) ?? [];

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
        role,
        rootCategory || undefined,
        subcategory || undefined,
        businessName || undefined,
        cityLat,
        cityLng
      );
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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.backgroundPage }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Language Selector */}
          <Pressable
            style={styles.languageSelector}
            onPress={() => setLanguageModalVisible(true)}
            data-testid="language-selector-register"
          >
            <Ionicons name="globe-outline" size={18} color={COLORS.primaryDark} />
            <Text style={styles.languageSelectorText}>{currentLanguage.nativeName}</Text>
            <Ionicons name="chevron-down" size={16} color="#6b7280" />
          </Pressable>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t("auth.createAccount")}</Text>
            <Text style={styles.subtitle}>{t("brand.subtitle")}</Text>

            {/* Role Selector */}
            <Text style={styles.fieldLabel}>{t("auth.iAm", "I am a...")}</Text>
            <View style={styles.roleRow}>
              <Pressable
                style={[styles.roleCard, role === "user" && styles.roleCardActive]}
                onPress={() => setRole("user")}
              >
                <Ionicons name="person" size={24} color={role === "user" ? "#fff" : "#000"} />
                <Text style={[styles.roleLabel, role === "user" && styles.roleLabelActive]}>
                  {t("auth.individual", "Individual")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.roleCard, role === "business" && styles.roleCardActive]}
                onPress={() => setRole("business")}
              >
                <Ionicons name="business" size={24} color={role === "business" ? "#fff" : "#000"} />
                <Text style={[styles.roleLabel, role === "business" && styles.roleLabelActive]}>
                  {t("auth.business", "Business")}
                </Text>
              </Pressable>
            </View>

            {role === "business" && (
              <>
                <View style={styles.inputRow}>
                  <Ionicons name="business-outline" size={20} color="#6b7280" />
                  <TextInput
                    value={businessName}
                    onChangeText={setBusinessName}
                    placeholder={t("auth.businessName", "Business Name")}
                    style={styles.input}
                  />
                </View>
                <Pressable
                  style={styles.inputRow}
                  onPress={() => { setPickerStep("root"); setSelectedRoot(null); setCategoryPickerVisible(true); }}
                >
                  <Ionicons name="grid-outline" size={20} color="#6b7280" />
                  <Text style={[styles.input, !rootCategory && { color: "#9ca3af" }]} numberOfLines={1}>
                    {rootCategory
                      ? categories.find((c) => c.slug === rootCategory)?.name || rootCategory
                      : t("auth.selectCategory", "Select Category")}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </Pressable>
                <Pressable
                  style={styles.inputRow}
                  onPress={() => {
                    if (rootCategory) {
                      const rc = categories.find((c) => c.slug === rootCategory);
                      if (rc) { setSelectedRoot(rc); setPickerStep("sub"); setCategoryPickerVisible(true); }
                    }
                  }}
                >
                  <Ionicons name="options-outline" size={20} color="#6b7280" />
                  <Text style={[styles.input, !subcategory && { color: "#9ca3af" }]} numberOfLines={1}>
                    {subcategory
                      ? (() => {
                          const rc = categories.find((c) => c.slug === rootCategory);
                          if (!rc) return subcategory;
                          const subs = getSubsForRoot(rc);
                          return subs.find((s) => s.slug === subcategory)?.name || subcategory;
                        })()
                      : t("auth.selectSubcategory", "Select Subcategory")}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </Pressable>
              </>
            )}

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
                    <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Category Picker Modal */}
        <Modal
          visible={categoryPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setCategoryPickerVisible(false)}
          >
            <Pressable style={styles.modalContent} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {pickerStep === "root"
                  ? t("auth.selectCategory", "Select Category")
                  : t("auth.selectSubcategory", "Select Subcategory")}
              </Text>
              {pickerStep === "root" ? (
                <ScrollView style={{ maxHeight: 400 }}>
                  {categories.map((cat) => (
                    <Pressable
                      key={cat.slug}
                      style={[
                        styles.languageOption,
                        rootCategory === cat.slug && styles.languageOptionSelected,
                      ]}
                      onPress={() => {
                        setRootCategory(cat.slug);
                        setSubcategory("");
                        setSelectedRoot(cat);
                        setPickerStep("sub");
                      }}
                    >
                      <Text
                        style={[
                          styles.languageOptionText,
                          rootCategory === cat.slug && styles.languageOptionTextSelected,
                        ]}
                      >
                        {cat.name}
                      </Text>
                      {rootCategory === cat.slug && (
                        <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />
                      )}
                      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <ScrollView style={{ maxHeight: 400 }}>
                  {getSubsForRoot(selectedRoot!).map((sub) => (
                    <Pressable
                      key={sub.slug}
                      style={[
                        styles.languageOption,
                        subcategory === sub.slug && styles.languageOptionSelected,
                      ]}
                      onPress={() => {
                        setSubcategory(sub.slug);
                        setCategoryPickerVisible(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.languageOptionText,
                          subcategory === sub.slug && styles.languageOptionTextSelected,
                        ]}
                      >
                        {sub.name}
                      </Text>
                      {subcategory === sub.slug && (
                        <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {pickerStep === "sub" && (
                <Pressable
                  style={[styles.primaryButton, { marginTop: 12, backgroundColor: "#6b7280" }]}
                  onPress={() => setPickerStep("root")}
                >
                  <Text style={styles.primaryButtonText}>{t("common.back", "Back")}</Text>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: COLORS.backgroundPage,
    justifyContent: "center",
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
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
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
    color: COLORS.textPrimary,
    ...Platform.select({ web: { pointerEvents: "auto" } }),
  },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
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
    color: COLORS.primaryDark,
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  roleCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: COLORS.surfaceSoft,
  },
  roleCardActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  roleLabelActive: {
    color: "#ffffff",
  },
});