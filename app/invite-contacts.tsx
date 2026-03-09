import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import { LinearGradient } from "expo-linear-gradient";
import * as Contacts from "expo-contacts";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../context/AuthContext";
import {
  checkContacts,
  trackInvite,
  getReferralCode,
  sendFriendRequest,
  MatchedContact,
  InvitableContact,
} from "../lib/api";

type TabType = "onPerix" | "invite";

export default function InviteContactsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { safeGoBack, router } = useSafeNavigation();

  const [activeTab, setActiveTab] = useState<TabType>("onPerix");
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [matchedUsers, setMatchedUsers] = useState<MatchedContact[]>([]);
  const [invitableContacts, setInvitableContacts] = useState<InvitableContact[]>([]);
  const [referralCode, setReferralCode] = useState<string>("");
  const [stats, setStats] = useState({ totalChecked: 0, totalMatched: 0 });
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);

  useEffect(() => {
    loadReferralCode();
  }, [sessionToken]);

  const loadReferralCode = async () => {
    if (!sessionToken) return;
    try {
      const result = await getReferralCode(sessionToken);
      setReferralCode(result.referral_code);
    } catch (error) {
      console.log("Failed to load referral code:", error);
    }
  };

  const requestContactsPermission = async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== "granted") {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      // Get contacts
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      if (data.length === 0) {
        Alert.alert(
          t("contacts.noContacts") || "No Contacts",
          t("contacts.noContactsDesc") || "No contacts found on your device"
        );
        setLoading(false);
        return;
      }

      // Format contacts for API
      const formattedContacts = data
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          name: contact.name || "Unknown",
          phone_numbers: contact.phoneNumbers?.map(p => p.number || "") || [],
        }));

      // Check against Perix users
      if (sessionToken) {
        const result = await checkContacts(sessionToken, formattedContacts);
        setMatchedUsers(result.matched_users);
        setInvitableContacts(result.invitable_contacts);
        setStats({
          totalChecked: result.total_checked,
          totalMatched: result.total_matched,
        });
      }
    } catch (error) {
      console.error("Contacts error:", error);
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    }
    setLoading(false);
  };

  const handleAddFriend = async (userId: string) => {
    if (!sessionToken || addingFriendId) return;
    setAddingFriendId(userId);
    try {
      await sendFriendRequest(sessionToken, userId);
      // Update local state
      setMatchedUsers(prev =>
        prev.map(u =>
          u.user_id === userId ? { ...u, is_friend: true } : u
        )
      );
      Alert.alert(
        t("friends.requestSent") || "Request Sent",
        t("friends.requestSentDesc") || "Friend request has been sent"
      );
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
    }
    setAddingFriendId(null);
  };

  const handleInvite = async (contact: InvitableContact, method: "sms" | "whatsapp") => {
    if (!sessionToken) return;

    const inviteMessage = t("contacts.inviteMessage") || 
      `Hey ${contact.name}! Join me on Perix - the social app for discovering events and connecting with friends in your city. Use my referral code: ${referralCode}\n\nDownload: https://perixapp.com`;

    try {
      // Track the invite
      await trackInvite(sessionToken, contact.phone_number, method);

      if (method === "whatsapp") {
        const whatsappUrl = `whatsapp://send?phone=${contact.phone_number.replace(/\D/g, '')}&text=${encodeURIComponent(inviteMessage)}`;
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          await Linking.openURL(`https://wa.me/${contact.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent(inviteMessage)}`);
        }
      } else {
        // SMS
        const smsUrl = `sms:${contact.phone_number}?body=${encodeURIComponent(inviteMessage)}`;
        await Linking.openURL(smsUrl);
      }
    } catch (error) {
      console.error("Invite error:", error);
    }
  };

  const copyReferralCode = async () => {
    if (referralCode) {
      await Clipboard.setStringAsync(referralCode);
      Alert.alert(
        t("contacts.codeCopied") || "Copied!",
        t("contacts.codeCopiedDesc") || "Referral code copied to clipboard"
      );
    }
  };

  const renderMatchedUser = ({ item }: { item: MatchedContact }) => (
    <View style={styles.userCard}>
      <Pressable
        style={styles.userInfo}
        onPress={() => router.push(`/user/${item.user_id}`)}
      >
        {item.profile_photo ? (
          <Image source={{ uri: item.profile_photo }} style={styles.avatar} />
        ) : (
          <LinearGradient
            colors={["#6366f1", "#8b5cf6"]}
            style={styles.avatarPlaceholder}
          >
            <Text style={styles.avatarText}>
              {item.user_name?.charAt(0) || "?"}
            </Text>
          </LinearGradient>
        )}
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.user_name}</Text>
          <Text style={styles.contactName}>
            {t("contacts.fromContacts") || "From contacts:"} {item.contact_name}
          </Text>
        </View>
      </Pressable>

      {item.is_friend ? (
        <View style={styles.friendBadge}>
          <Ionicons name="checkmark-circle" size={18} color="#10b981" />
          <Text style={styles.friendBadgeText}>{t("friends.friends") || "Friends"}</Text>
        </View>
      ) : addingFriendId === item.user_id ? (
        <ActivityIndicator size="small" color="#4c6fff" />
      ) : (
        <Pressable
          style={styles.addButton}
          onPress={() => handleAddFriend(item.user_id)}
        >
          <LinearGradient
            colors={["#4c6fff", "#6366f1"]}
            style={styles.addButtonGradient}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.addButtonText}>{t("friends.add") || "Add"}</Text>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );

  const renderInvitableContact = ({ item }: { item: InvitableContact }) => (
    <View style={styles.inviteCard}>
      <View style={styles.contactInfo}>
        <View style={styles.contactAvatar}>
          <Text style={styles.contactAvatarText}>
            {item.name?.charAt(0) || "?"}
          </Text>
        </View>
        <View style={styles.contactDetails}>
          <Text style={styles.contactNameText}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone_number}</Text>
        </View>
      </View>

      <View style={styles.inviteButtons}>
        <Pressable
          style={styles.whatsappInviteBtn}
          onPress={() => handleInvite(item, "whatsapp")}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
        </Pressable>
        <Pressable
          style={styles.smsInviteBtn}
          onPress={() => handleInvite(item, "sms")}
        >
          <Ionicons name="chatbubble" size={16} color="#4c6fff" />
        </Pressable>
      </View>
    </View>
  );

  // Initial permission request view
  if (matchedUsers.length === 0 && invitableContacts.length === 0 && !loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={safeGoBack}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.title}>{t("contacts.inviteFriends") || "Invite Friends"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.permissionView}>
          <View style={styles.permissionIcon}>
            <LinearGradient
              colors={["#4c6fff", "#6366f1"]}
              style={styles.permissionIconGradient}
            >
              <Ionicons name="people" size={48} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.permissionTitle}>
            {t("contacts.findFriendsTitle") || "Find Friends on Perix"}
          </Text>
          <Text style={styles.permissionDesc}>
            {t("contacts.findFriendsDesc") || 
              "See which of your contacts are already on Perix and invite others to join!"}
          </Text>

          {permissionDenied ? (
            <View style={styles.deniedView}>
              <Ionicons name="lock-closed" size={24} color="#ef4444" />
              <Text style={styles.deniedText}>
                {t("contacts.permissionDenied") || 
                  "Contacts access was denied. Please enable it in Settings."}
              </Text>
              <Pressable
                style={styles.settingsButton}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.settingsButtonText}>
                  {t("contacts.openSettings") || "Open Settings"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.allowButton}
              onPress={requestContactsPermission}
              disabled={loading}
            >
              <LinearGradient
                colors={["#4c6fff", "#6366f1"]}
                style={styles.allowButtonGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={20} color="#fff" />
                    <Text style={styles.allowButtonText}>
                      {t("contacts.findContacts") || "Find Contacts"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}

          {/* Referral Code Section */}
          {referralCode && (
            <View style={styles.referralSection}>
              <Text style={styles.referralTitle}>
                {t("contacts.yourReferralCode") || "Your Referral Code"}
              </Text>
              <Pressable style={styles.referralCodeBox} onPress={copyReferralCode}>
                <Text style={styles.referralCode}>{referralCode}</Text>
                <Ionicons name="copy-outline" size={20} color="#4c6fff" />
              </Pressable>
              <Text style={styles.referralHint}>
                {t("contacts.referralHint") || "Share this code with friends when they sign up!"}
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={safeGoBack}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>{t("contacts.inviteFriends") || "Invite Friends"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.totalChecked}</Text>
          <Text style={styles.statLabel}>{t("contacts.checked") || "Checked"}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: "#10b981" }]}>{stats.totalMatched}</Text>
          <Text style={styles.statLabel}>{t("contacts.onPerix") || "On Perix"}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: "#f59e0b" }]}>{invitableContacts.length}</Text>
          <Text style={styles.statLabel}>{t("contacts.toInvite") || "To Invite"}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "onPerix" && styles.tabActive]}
          onPress={() => setActiveTab("onPerix")}
        >
          <Text style={[styles.tabText, activeTab === "onPerix" && styles.tabTextActive]}>
            {t("contacts.onPerix") || "On Perix"} ({matchedUsers.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "invite" && styles.tabActive]}
          onPress={() => setActiveTab("invite")}
        >
          <Text style={[styles.tabText, activeTab === "invite" && styles.tabTextActive]}>
            {t("contacts.invite") || "Invite"} ({invitableContacts.length})
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {activeTab === "onPerix" ? (
        matchedUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>
              {t("contacts.noMatchedUsers") || "No contacts on Perix yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("contacts.inviteThemNow") || "Invite your friends to join!"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={matchedUsers}
            renderItem={renderMatchedUser}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : (
        invitableContacts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="mail-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>
              {t("contacts.allOnPerix") || "All your contacts are on Perix!"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={invitableContacts}
            renderItem={renderInvitableContact}
            keyExtractor={(item, index) => `${item.phone_number}-${index}`}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* Referral Code Footer */}
      {referralCode && (
        <View style={styles.referralFooter}>
          <Text style={styles.referralFooterText}>
            {t("contacts.yourCode") || "Your code:"} <Text style={styles.referralFooterCode}>{referralCode}</Text>
          </Text>
          <Pressable onPress={copyReferralCode}>
            <Ionicons name="copy-outline" size={20} color="#4c6fff" />
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  statsBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: "#e5e7eb",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#4c6fff",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#fff",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  contactName: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  friendBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1fae5",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  friendBadgeText: {
    color: "#059669",
    fontSize: 13,
    fontWeight: "600",
  },
  addButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  addButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  contactInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  contactAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6b7280",
  },
  contactDetails: {
    marginLeft: 12,
    flex: 1,
  },
  contactNameText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  contactPhone: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  inviteButtons: {
    flexDirection: "row",
    gap: 8,
  },
  whatsappInviteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  smsInviteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
  },
  permissionView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  permissionIcon: {
    marginBottom: 24,
  },
  permissionIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  permissionDesc: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  allowButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  allowButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 10,
  },
  allowButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  deniedView: {
    alignItems: "center",
    gap: 12,
  },
  deniedText: {
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
  },
  settingsButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
  },
  settingsButtonText: {
    color: "#dc2626",
    fontWeight: "600",
  },
  referralSection: {
    marginTop: 40,
    alignItems: "center",
    width: "100%",
  },
  referralTitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  referralCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f4ff",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4c6fff",
    borderStyle: "dashed",
    gap: 12,
  },
  referralCode: {
    fontSize: 24,
    fontWeight: "800",
    color: "#4c6fff",
    letterSpacing: 2,
  },
  referralHint: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },
  referralFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    gap: 8,
  },
  referralFooterText: {
    fontSize: 14,
    color: "#6b7280",
  },
  referralFooterCode: {
    fontWeight: "700",
    color: "#4c6fff",
  },
});
