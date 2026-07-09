import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LanguagePicker } from "../components/LanguagePicker";
import { getNotificationPreferences, updateNotificationPreferences, NotificationPrefs as NotificationPrefsAPI } from "../lib/api/notifications";
import { deleteUserAccount } from "../lib/api/social";
import { COLORS } from "../lib/designTokens";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
const NOTIF_PREFS_KEY = "@perix_notification_prefs";

interface NotificationPrefs {
  messages: boolean;
  events: boolean;
  activities: boolean;
  friendRequests: boolean;
  calls: boolean;
  marketing: boolean;
  messages_quiet_hours_mode?: string;
  messages_quiet_hours_start?: string;
  messages_quiet_hours_end?: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  messages: true,
  events: true,
  activities: true,
  friendRequests: true,
  calls: true,
  marketing: false,
  messages_quiet_hours_mode: "off",
  messages_quiet_hours_start: "22:00",
  messages_quiet_hours_end: "08:00",
};

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout, sessionToken, user } = useAuth();

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (stored) {
        setNotifPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
      }
      if (sessionToken) {
        try {
          const serverPrefs = await getNotificationPreferences(sessionToken);
          setNotifPrefs({
            messages: serverPrefs.messages ?? true,
            events: serverPrefs.events ?? true,
            activities: serverPrefs.activities ?? true,
            friendRequests: serverPrefs.friendRequests ?? true,
            calls: serverPrefs.calls ?? true,
            marketing: serverPrefs.marketing ?? false,
            messages_quiet_hours_mode: serverPrefs.messages_quiet_hours_mode ?? "off",
            messages_quiet_hours_start: serverPrefs.messages_quiet_hours_start ?? "22:00",
            messages_quiet_hours_end: serverPrefs.messages_quiet_hours_end ?? "08:00",
          });
        } catch (e) {
          console.log("Failed to load server notification prefs:", e);
        }
      }
    } catch (e) {
      console.log("Failed to load notification prefs:", e);
    } finally {
      setLoadingPrefs(false);
    }
  };

  const savePrefs = async (newPrefs: NotificationPrefs) => {
    setNotifPrefs(newPrefs);
    try {
      await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(newPrefs));
    } catch (e) {
      console.log("Failed to save notification prefs locally:", e);
    }
    if (sessionToken) {
      try {
        await updateNotificationPreferences(sessionToken, newPrefs);
      } catch (e) {
        console.log("Failed to save notification prefs to server:", e);
      }
    }
  };

  const togglePref = (key: keyof NotificationPrefs) => {
    savePrefs({ ...notifPrefs, [key]: !notifPrefs[key] });
  };

  const setQuietHoursMode = (mode: string) => {
    savePrefs({ ...notifPrefs, messages_quiet_hours_mode: mode });
  };

  const setQuietHoursTime = (field: "start" | "end", date: Date) => {
    const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    if (field === "start") {
      savePrefs({ ...notifPrefs, messages_quiet_hours_start: timeStr });
    } else {
      savePrefs({ ...notifPrefs, messages_quiet_hours_end: timeStr });
    }
    setShowTimePicker(null);
  };

  const parseTime = (timeStr?: string): Date => {
    const fallback = new Date();
    if (!timeStr) return fallback;
    const parts = timeStr.split(":");
    if (parts.length !== 2) return fallback;
    const d = new Date();
    d.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
    return d;
  };

  const handleLogout = async () => {
    Alert.alert(
      t("profile.logout"),
      t("settings.logoutConfirm") || "Are you sure you want to logout?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("profile.logout"),
          style: "destructive",
          onPress: async () => {
            try {
              await logout();
            } catch (e) {
              console.error("Logout error:", e);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteAccount") || "Delete Account",
      t("settings.deleteAccountWarning") ||
        "This will permanently delete your account and all associated data. This action cannot be undone.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.deleteAccount"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("settings.deleteAccountFinal") || "Are you absolutely sure?",
              t("settings.deleteAccountFinalWarning") ||
                "All your posts, messages, and data will be permanently deleted.",
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("settings.deleteForever"),
                  style: "destructive",
                  onPress: async () => {
                    if (!sessionToken) return;
                    setDeletingAccount(true);
                    try {
                      await deleteUserAccount(sessionToken);
                      await logout();
                    } catch (error: any) {
                      console.error("Delete account failed:", error);
                      Alert.alert(
                        t("common.error") || "Error",
                        error?.message || t("settings.deleteFailed") || "Failed to delete account. Please try again."
                      );
                    } finally {
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert(t("common.error") || "Error", t("settings.passwordFieldsRequired") || "Please fill in both fields");
      return;
    }
    if (newPassword.length < 4) {
      Alert.alert(t("common.error") || "Error", t("auth.passwordTooShort") || "Password must be at least 4 characters");
      return;
    }
    setChangingPassword(true);
    try {
      const { apiRequest } = await import("../lib/api/core");
      await apiRequest("/auth/change-password", "PUT", sessionToken!, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      Alert.alert(t("common.success") || "Success", t("settings.passwordChanged") || "Password changed successfully");
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      Alert.alert(t("common.error") || "Error", e?.message || t("settings.passwordChangeFailed") || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith("@") && !k.includes("session") && !k.includes("user_language") && !k.includes("active_identity"));
      await AsyncStorage.multiRemove(cacheKeys);
      Alert.alert(t("common.success") || "Success", t("settings.cacheCleared") || "Cache cleared successfully");
    } catch {
      Alert.alert(t("common.error") || "Error", t("settings.cacheClearFailed") || "Failed to clear cache");
    } finally {
      setClearingCache(false);
    }
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const SettingRow = ({
    icon,
    iconColor,
    title,
    subtitle,
    onPress,
    rightElement,
    danger,
  }: {
    icon: string;
    iconColor?: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    danger?: boolean;
  }) => (
    <Pressable
      style={[styles.settingRow, onPress && styles.settingRowPressable]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor || COLORS.primaryDark}15` }]}>
        <Ionicons name={icon as any} size={20} color={iconColor || COLORS.primaryDark} />
      </View>
      <View style={styles.settingTextContainer}>
        <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement || (onPress && (
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
      ))}
    </Pressable>
  );

  const ToggleRow = ({
    icon,
    iconColor,
    title,
    subtitle,
    value,
    onToggle,
  }: {
    icon: string;
    iconColor?: string;
    title: string;
    subtitle?: string;
    value: boolean;
    onToggle: () => void;
  }) => (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor || COLORS.primaryDark}15` }]}>
          <Ionicons name={icon as any} size={20} color={iconColor || COLORS.primaryDark} />
        </View>
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#e5e7eb", true: COLORS.primaryDark }}
        thumbColor="#fff"
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primaryDark} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("settings.title") || "Settings"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <SectionHeader title={t("settings.notifications") || "Notifications"} />
        <View style={styles.section}>
          <ToggleRow
            icon="chatbubble"
            iconColor="#FFD700"
            title={t("settings.notifyMessages") || "Messages"}
            subtitle={t("settings.notifyMessagesDesc") || "New direct messages and chat"}
            value={notifPrefs.messages}
            onToggle={() => togglePref("messages")}
          />
          {/* Quiet Hours for Messages */}
          <View style={styles.quietHoursSection}>
            <Text style={styles.quietHoursLabel}>{t("settings.quietHours") || "Quiet Hours"}</Text>
            <Text style={styles.quietHoursDesc}>{t("settings.quietHoursDesc") || "Suppress message notifications during set hours"}</Text>
            <View style={styles.quietHoursModes}>
              {["off", "business_hours", "custom"].map((mode) => {
                const isActive = (notifPrefs.messages_quiet_hours_mode || "off") === mode;
                const label = mode === "off"
                  ? (t("settings.quietHoursOff") || "Off")
                  : mode === "business_hours"
                    ? (t("settings.quietHoursBusiness") || "Business Hours")
                    : (t("settings.quietHoursCustom") || "Custom");
                return (
                  <Pressable
                    key={mode}
                    style={[
                      styles.quietHoursModeBtn,
                      isActive && styles.quietHoursModeBtnActive,
                    ]}
                    onPress={() => setQuietHoursMode(mode)}
                  >
                    <Text style={[
                      styles.quietHoursModeText,
                      isActive && styles.quietHoursModeTextActive,
                    ]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {(notifPrefs.messages_quiet_hours_mode || "off") === "custom" && (
              <View style={styles.quietHoursTimeRow}>
                <Pressable
                  style={styles.quietHoursTimeBtn}
                  onPress={() => setShowTimePicker("start")}
                >
                  <Text style={styles.quietHoursTimeLabel}>{t("settings.quietHoursStart") || "Start"}</Text>
                  <Text style={styles.quietHoursTimeValue}>{notifPrefs.messages_quiet_hours_start || "22:00"}</Text>
                </Pressable>
                <Text style={styles.quietHoursSeparator}>{t("settings.to") || "to"}</Text>
                <Pressable
                  style={styles.quietHoursTimeBtn}
                  onPress={() => setShowTimePicker("end")}
                >
                  <Text style={styles.quietHoursTimeLabel}>{t("settings.quietHoursEnd") || "End"}</Text>
                  <Text style={styles.quietHoursTimeValue}>{notifPrefs.messages_quiet_hours_end || "08:00"}</Text>
                </Pressable>
              </View>
            )}
          </View>
          {showTimePicker && (
            <DateTimePicker
              value={parseTime(showTimePicker === "start" ? notifPrefs.messages_quiet_hours_start : notifPrefs.messages_quiet_hours_end)}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_event: any, date?: Date) => {
                if (date) setQuietHoursTime(showTimePicker, date);
                else setShowTimePicker(null);
              }}
            />
          )}
          <ToggleRow
            icon="calendar"
            iconColor="#f59e0b"
            title={t("settings.notifyEvents") || "Events"}
            subtitle={t("settings.notifyEventsDesc") || "Event reminders and updates"}
            value={notifPrefs.events}
            onToggle={() => togglePref("events")}
          />
          <ToggleRow
            icon="people"
            iconColor="#10b981"
            title={t("settings.notifyActivities") || "Activities"}
            subtitle={t("settings.notifyActivitiesDesc") || "Activity invitations and updates"}
            value={notifPrefs.activities}
            onToggle={() => togglePref("activities")}
          />
          <ToggleRow
            icon="person-add"
            iconColor="#ec4899"
            title={t("settings.notifyFriendRequests") || "Friend Requests"}
            subtitle={t("settings.notifyFriendRequestsDesc") || "New friend requests and acceptances"}
            value={notifPrefs.friendRequests}
            onToggle={() => togglePref("friendRequests")}
          />
          <ToggleRow
            icon="call"
            iconColor="#3b82f6"
            title={t("settings.notifyCalls") || "Calls"}
            subtitle={t("settings.notifyCallsDesc") || "Incoming call notifications"}
            value={notifPrefs.calls}
            onToggle={() => togglePref("calls")}
          />
          <ToggleRow
            icon="megaphone"
            iconColor="#8b5cf6"
            title={t("settings.notifyMarketing") || "Updates & Tips"}
            subtitle={t("settings.notifyMarketingDesc") || "New features and helpful tips"}
            value={notifPrefs.marketing}
            onToggle={() => togglePref("marketing")}
          />
        </View>

        <SectionHeader title={t("settings.general") || "General"} />
        <View style={styles.section}>
          <SettingRow
            icon="language"
            iconColor="#0891b2"
            title={t("profile.language") || "Language"}
            subtitle={t("settings.changeLanguage") || "Select your preferred language"}
            onPress={() => setShowLanguagePicker(true)}
          />
          <SettingRow
            icon="shield-checkmark"
            iconColor="#059669"
            title={t("settings.privacyPolicy") || "Privacy Policy"}
            subtitle={t("settings.privacyPolicyDesc") || "How we handle your data"}
            onPress={() => router.push("/privacy-policy" as any)}
          />
          <SettingRow
            icon="document-text"
            iconColor="#6b7280"
            title={t("settings.termsOfService") || "Terms of Service"}
            subtitle={t("settings.termsOfServiceDesc") || "Rules and guidelines"}
            onPress={() => router.push("/terms-of-service" as any)}
          />
          <SettingRow
            icon="help-circle"
            iconColor="#2563eb"
            title={t("settings.helpSupport") || "Help & Support"}
            subtitle={t("settings.helpSupportDesc") || "Get help or contact us"}
            onPress={() => router.push("/help-support" as any)}
          />
          <SettingRow
            icon="ban"
            iconColor="#ef4444"
            title={t("settings.blockedUsers") || "Blocked Users"}
            subtitle={t("settings.blockedUsersDesc") || "Manage blocked users"}
            onPress={() => router.push("/blocked-users" as any)}
          />
        </View>

        <SectionHeader title={t("settings.account") || "Account"} />
        <View style={styles.section}>
          <SettingRow
            icon="person-circle"
            iconColor="#FFD700"
            title={user?.name || t("settings.viewProfile") || "View Profile"}
            subtitle={t("settings.profileEmail") || user?.email || ""}
            onPress={() => router.navigate("/(tabs)/profile" as any)}
          />
          <SettingRow
            icon="create-outline"
            iconColor="#0891b2"
            title={t("settings.editProfile") || "Edit Profile"}
            subtitle={t("settings.editProfileDesc") || "Name, bio, location, photo"}
            onPress={() => router.navigate("/(tabs)/profile" as any)}
          />
          <SettingRow
            icon="lock-closed"
            iconColor="#f59e0b"
            title={t("settings.changePassword") || "Change Password"}
            subtitle={t("settings.changePasswordDesc") || "Update your password"}
            onPress={() => setShowPasswordModal(true)}
          />
          <SettingRow
            icon="trash-outline"
            iconColor="#6b7280"
            title={t("settings.clearCache") || "Clear Cache"}
            subtitle={t("settings.clearCacheDesc") || "Free up storage"}
            onPress={handleClearCache}
          />
        </View>

        <SectionHeader title={t("settings.dangerZone") || "Danger Zone"} />
        <View style={styles.section}>
          <SettingRow
            icon="log-out"
            iconColor="#6b7280"
            title={t("profile.logout") || "Logout"}
            subtitle={t("settings.logoutDesc") || "Sign out of your account"}
            onPress={handleLogout}
          />
          <SettingRow
            icon="trash"
            iconColor="#ef4444"
            title={deletingAccount ? (t("settings.deletingAccount") || "Deleting...") : (t("settings.deleteAccount") || "Delete Account")}
            subtitle={t("settings.deleteAccountDesc") || "Permanently delete your account and all data"}
            onPress={deletingAccount ? undefined : handleDeleteAccount}
            danger
            rightElement={deletingAccount ? <ActivityIndicator size="small" color="#ef4444" /> : undefined}
          />
        </View>

        <View style={styles.appInfo}>
          <Text style={styles.appName}>Perix</Text>
          <Text style={styles.appVersion}>{t("settings.version") || "Version"} {APP_VERSION}</Text>
        </View>
      </ScrollView>

      <LanguagePicker
        visible={showLanguagePicker}
        onClose={() => setShowLanguagePicker(false)}
      />

      <Modal visible={showPasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t("settings.changePassword") || "Change Password"}</Text>
            <TextInput
              style={styles.modalInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t("settings.currentPassword") || "Current password"}
              placeholderTextColor="#9ca3af"
              secureTextEntry
            />
            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t("settings.newPassword") || "New password"}
              placeholderTextColor="#9ca3af"
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowPasswordModal(false)}>
                <Text style={styles.modalCancelText}>{t("common.cancel") || "Cancel"}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, changingPassword && { opacity: 0.5 }]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>{t("common.save") || "Save"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  section: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  settingRowPressable: {
    backgroundColor: "#fff",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.textPrimary,
  },
  settingSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  dangerText: {
    color: "#ef4444",
  },
  appInfo: {
    alignItems: "center",
    paddingVertical: 32,
  },
  appName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#9ca3af",
  },
  appVersion: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
    color: COLORS.textPrimary,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
