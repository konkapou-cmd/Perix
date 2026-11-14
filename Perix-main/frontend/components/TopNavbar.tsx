/**
 * Top Navigation Bar Component - Airbnb Style
 * Replaces sidebar navigation on desktop with a clean top navbar
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useBadge } from "../context/BadgeContext";
import { COLORS } from "../lib/designTokens";
import MapScreenHeader from "./city/MapScreenHeader";
import FontMagnifierButton from "./city/FontMagnifierButton";
import { IdentityDropdown } from "./profile/IdentityDropdown";
import { getMyBusinesses, type Business } from "../lib/api";

export default function TopNavbar({ onCreatePress }: { onCreatePress?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken, setActiveIdentity } = useAuth();
  const pathname = usePathname();
  const isHome = pathname === "/home" || pathname === "/(tabs)/home";
  const isLocator = pathname === "/locator" || pathname === "/(tabs)/locator";
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const { unreadMessageCount } = useBadge();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) { setBusinesses([]); return; }
    getMyBusinesses(sessionToken).then(setBusinesses).catch(() => setBusinesses([]));
  }, [sessionToken]);

  const isApp = pathname === "/" || pathname === "/app" || pathname === "/index";
  const isMembers = pathname === "/home" || pathname === "/(tabs)/home";
  const isProfile = pathname === "/(tabs)/profile" || pathname === "/profile";
  const isMessages = pathname.startsWith("/(tabs)/messages") || pathname === "/messages";
  const iconColor = (active: boolean) => (active ? "#59ABE3" : "#064472");
  const go = (path: string) => router.navigate(path as any);

  return (
    <MapScreenHeader hideExplore logoVariant={isHome || isLocator ? "english" : undefined} right={
        <View style={styles.rightSection}>
          {/* Desktop: App / Members / Profile / Messages / Create gathered top-right */}
          <View style={styles.navPill}>
            <Pressable
              style={styles.navIcon}
              onPress={() => go("/app")}
              data-testid="navbar-app"
              accessibilityRole="button"
              accessibilityLabel="APP"
            >
              <Ionicons name={isApp ? "compass" : "compass-outline"} size={22} color={iconColor(isApp)} />
              <Text style={[styles.navIconText, isApp && styles.navIconTextActive]}>APP</Text>
            </Pressable>
            <Pressable
              style={styles.navIcon}
              onPress={() => go(sessionToken ? "/(tabs)/home" as any : "/login" as any)}
              data-testid="navbar-members"
              accessibilityRole="button"
              accessibilityLabel={t("nav.members", "Members")}
            >
              <Ionicons name={isMembers ? "people" : "people-outline"} size={22} color={iconColor(isMembers)} />
              <Text style={[styles.navIconText, isMembers && styles.navIconTextActive]}>{t("nav.members", "Members")}</Text>
            </Pressable>
            <Pressable
              style={styles.navIcon}
              onPress={() => go(sessionToken ? "/(tabs)/profile" as any : "/login" as any)}
              data-testid="navbar-profile"
              accessibilityRole="button"
              accessibilityLabel={t("nav.profile", "Profile")}
            >
              <Ionicons name={isProfile ? "person" : "person-outline"} size={22} color={iconColor(isProfile)} />
              <Text style={[styles.navIconText, isProfile && styles.navIconTextActive]}>{t("nav.profile", "Profile")}</Text>
            </Pressable>
            <View style={{ position: "relative" }}>
              <Pressable
                style={styles.navIcon}
                onPress={() => go(sessionToken ? "/(tabs)/messages" as any : "/login" as any)}
                data-testid="navbar-messages"
                accessibilityRole="button"
                accessibilityLabel={t("nav.messages", "Messages")}
              >
                <Ionicons name={isMessages ? "chatbubble" : "chatbubble-outline"} size={22} color={iconColor(isMessages)} />
                <Text style={[styles.navIconText, isMessages && styles.navIconTextActive]}>{t("nav.messages", "Messages")}</Text>
              </Pressable>
              {unreadMessageCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                  </Text>
                </View>
              )}
            </View>
            {/* Create lives inside the unified pill, next to the section icons */}
            <Pressable
              style={[
                styles.createButton,
                hoveredItem === "create" && styles.createButtonHover,
              ]}
              onPress={onCreatePress}
              onHoverIn={() => setHoveredItem("create")}
              onHoverOut={() => setHoveredItem(null)}
              data-testid="navbar-create"
            >
              <Ionicons name="add-circle-outline" size={18} color={COLORS.background} />
              <Text style={styles.createButtonText}>{t("common.create", "Create")}</Text>
            </Pressable>
          </View>

          {/* User Menu / account type switcher */}
          <IdentityDropdown compact businesses={businesses}
            onSelectIdentity={(type,id,name,avatar)=>setActiveIdentity?.({type,id,name,avatar})}
            onAfterSelect={()=>router.navigate("/(tabs)/profile" as any)}
            onCreateBusiness={()=>router.push("/(tabs)/profile?createBusiness=1" as any)} />
        </View>
    } />
  );
}

const styles = StyleSheet.create({
  navbar: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...Platform.select({
      web: {
        position: "sticky" as any,
        top: 0,
        zIndex: 100,
      },
    }),
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 1280,
    marginHorizontal: "auto",
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...Platform.select({
      web: { cursor: "pointer" as any },
    }),
  },
  brandWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  brandSun: {
    position: "absolute",
    right: 9,
    top: 0,
  },
  logoText: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  navLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navLink: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    position: "relative",
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
        transition: "all 0.15s ease" as any,
      },
    }),
  },
  navLinkActive: {
    backgroundColor: "#59ABE3",
  },
  navLinkHover: {
    backgroundColor: COLORS.surfaceSoft,
  },
  navLinkText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#264348",
  },
  navLinkTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: [{ translateX: -12 }],
    width: 24,
    height: 2,
    backgroundColor: "#59ABE3",
    borderRadius: 1,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#F6F8FC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 4,
    position: "relative",
  },
  navIcon: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 56,
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
      },
    }),
  },
  navIconText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#064472",
    marginTop: 1,
  },
  navIconTextActive: {
    color: "#59ABE3",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#59ABE3",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
        transition: "all 0.15s ease" as any,
      },
    }),
  },
  createButtonHover: {
    backgroundColor: "#7ABDE9",
    transform: [{ scale: 1.02 }],
  },
  createButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "600",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
        transition: "all 0.15s ease" as any,
      },
    }),
  },
  iconButtonHover: {
    backgroundColor: COLORS.divider,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 10,
    fontWeight: "700",
  },
});
