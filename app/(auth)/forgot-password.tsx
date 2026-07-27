import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { forgotPassword } from "../../lib/api/auth";

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError(t("auth.emailRequired", "E-Mail ist erforderlich"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await forgotPassword(email.trim());
      setToken(result.reset_token);
    } catch (e: any) {
      setError(e?.message || t("auth.forgotError", "Fehler beim Senden der E-Mail"));
    }
    setLoading(false);
  };

  if (token) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.success} style={{ marginBottom: 20 }} />
            <Text style={styles.title}>{t("auth.resetTokenReady", "Passwort-Reset-Token")}</Text>
            <Text style={styles.desc}>
              {t("auth.resetTokenDesc", "Kopiere diesen Code, um dein Passwort zurückzusetzen:")}
            </Text>
            <View style={styles.tokenBox}>
              <Text style={styles.tokenText} selectable>{token}</Text>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace("/reset-password")}
            >
              <Text style={styles.primaryButtonText}>
                {t("auth.continueToReset", "Zum Zurücksetzen")}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.title}>{t("auth.forgotPassword", "Passwort vergessen?")}</Text>
            <Text style={styles.desc}>
              {t("auth.forgotPasswordDesc", "Gib deine E-Mail ein, um den Reset-Token zu erhalten.")}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.email", "E-Mail")}
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
            />
            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleForgotPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("auth.sendResetToken", "Token senden")}</Text>
              )}
            </Pressable>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 12, textAlign: "center" },
  desc: { fontSize: 14, color: COLORS.textMuted, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  input: {
    width: "100%",
    backgroundColor: COLORS.backgroundPage,
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonDisabled: { opacity: 0.6 },
  errorText: { color: COLORS.danger, marginTop: 12, fontSize: 14, textAlign: "center" },
  backBtn: { padding: 16 },
  tokenBox: {
    width: "100%",
    backgroundColor: COLORS.backgroundPage,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tokenText: { fontSize: 13, color: COLORS.textPrimary, fontFamily: "monospace", textAlign: "center" },
});
