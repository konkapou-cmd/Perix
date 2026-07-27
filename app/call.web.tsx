/**
 * Call Screen - Web Version
 * Video/Voice calls are not supported on web platform
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";
import { useTranslation } from "react-i18next";

export default function CallScreenWeb() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { type, callId, userName } = params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="videocam-off" size={64} color="#666" />
        </View>
        
        <Text style={styles.title}>
          {t("call.notSupportedOnWeb") || "Calls Not Supported on Web"}
        </Text>
        
        <Text style={styles.subtitle}>
          {t("call.useAppForCalls") || "Please use the Perix mobile app to make voice and video calls."}
        </Text>

        {userName && (
          <Text style={styles.callerInfo}>
            {t("call.tryingToCall") || "Trying to call"}: {userName}
          </Text>
        )}

        <View style={styles.downloadSection}>
          <Text style={styles.downloadText}>
            {t("call.downloadApp") || "Download the app to access all features:"}
          </Text>
          
          <View style={styles.storeButtons}>
            <Pressable style={styles.storeButton}>
              <Ionicons name="logo-apple" size={24} color="#fff" />
              <Text style={styles.storeButtonText}>App Store</Text>
            </Pressable>
            
            <Pressable style={styles.storeButton}>
              <Ionicons name="logo-google-playstore" size={24} color="#fff" />
              <Text style={styles.storeButtonText}>Google Play</Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.primaryDark} />
          <Text style={styles.backButtonText}>
            {t("common.goBack") || "Go Back"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 24,
  },
  callerInfo: {
    fontSize: 14,
    color: COLORS.primaryDark,
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(76, 111, 255, 0.1)",
    borderRadius: 8,
  },
  downloadSection: {
    marginTop: 40,
    alignItems: "center",
  },
  downloadText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  storeButtons: {
    flexDirection: "row",
    gap: 12,
  },
  storeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1a1a2e",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  storeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 40,
    padding: 12,
  },
  backButtonText: {
    color: COLORS.primaryDark,
    fontSize: 16,
    fontWeight: "600",
  },
});
