import { useEffect, useState } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { resetPassword } from "../../lib/api/auth";

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const linkToken = typeof params.token === "string" ? params.token : "";
  const [token, setToken] = useState(linkToken);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => { setToken(linkToken); }, [linkToken]);

  const handleReset = async () => {
    if (!token.trim()) {
      setError(t("auth.tokenRequired", "Open the reset link from your email, or request a new link."));
      return;
    }
    if (newPassword.length < 4) {
      setError(t("auth.passwordMinLength", "Password must be at least 4 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.recoveryPasswordsMismatch", "The passwords don't match. Please try again."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await resetPassword(token.trim(), newPassword);
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || t("auth.resetError", "Couldn't reset your password. Please request a new link and try again."));
    }
    setLoading(false);
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.success} style={{ marginBottom: 20 }} />
            <Text style={styles.title}>{t("auth.passwordReset", "Your password has been changed")}</Text>
            <Text style={styles.desc}>
              {t("auth.passwordResetDesc", "You're all set! Sign in to Perix with your new password.")}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace("/login")}
            >
              <Text style={styles.primaryButtonText}>
                {t("auth.goToLogin", "Go to login")}
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
            <Text style={styles.title}>{t("auth.resetPassword", "Reset password")}</Text>
            <Text style={styles.desc}>
              {t("auth.recoveryNewPasswordIntro", "Choose a new password for your Perix account and confirm it below.")}
            </Text>
            {!linkToken && <TextInput
              style={styles.input}
              placeholder={t("auth.resetToken", "Reset token from email")}
              placeholderTextColor="#9ca3af"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoFocus
            />}
            <TextInput
              style={styles.input}
              placeholder={t("auth.newPassword", "New password")}
              placeholderTextColor="#9ca3af"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            <TextInput
              style={styles.input}
              placeholder={t("auth.confirmPassword", "Confirm Password")}
              placeholderTextColor="#9ca3af"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            <Pressable onPress={() => router.replace("/forgot-password")}>
              <Text style={[styles.desc, { marginBottom: 16 }]}>
                {t("auth.recoveryRequestNewLink", "Link expired? Request a new one")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("auth.resetPassword", "Reset password")}</Text>
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
});
