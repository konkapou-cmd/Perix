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

  return (
    <MapScreenHeader hideExplore={isHome} exploreOnly={isLocator} logoVariant={isHome || isLocator ? "english" : undefined} right={
        <View style={styles.rightSection}>
          {/* Create Button — mirrors the app's bottom-bar create tab */}
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
            <Ionicons name="sparkles" size={18} color={COLORS.background} />
            <Text style={styles.createButtonText}>{t("common.create", "Create")}</Text>
          </Pressable>

          {/* Messages */}
          <Pressable
            style={[
              styles.iconButton,
              hoveredItem === "messages" && styles.iconButtonHover,
            ]}
            onPress={() => router.navigate("/(tabs)/messages" as any)}
            onHoverIn={() => setHoveredItem("messages")}
            onHoverOut={() => setHoveredItem(null)}
            data-testid="navbar-messages"
          >
            <Ionicons name="chatbubble-outline" size={22} color="#59ABE3" />
            {unreadMessageCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Create Post — removed from the desktop navbar; the home page
              covers posting via the unified bar. */}

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
    gap: 8,
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
