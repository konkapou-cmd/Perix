import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { verifyEmail } from "../lib/api/auth";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("No verification token provided.");
      return;
    }
    verifyEmail(token)
      .then(() => setVerified(true))
      .catch((e: any) => setError(e?.message || "Verification failed. The link may be invalid or expired."))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#59ABE3" />
          <Text style={styles.text}>Verifying your email…</Text>
        </View>
      ) : verified ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={72} color="#10b981" />
          <Text style={styles.title}>Email verified!</Text>
          <Text style={styles.text}>Your account is now active and you can reset your password if needed.</Text>
          <Link href="/login" style={styles.button}>
            <Text style={styles.buttonText}>Go to Login</Text>
          </Link>
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
          <Text style={styles.title}>Verification failed</Text>
          <Text style={styles.text}>{error}</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/login")}>
            <Text style={styles.buttonText}>Back to Login</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#264348",
  },
  text: {
    fontSize: 15,
    color: "#264348",
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    marginTop: 12,
    backgroundColor: "#59ABE3",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
