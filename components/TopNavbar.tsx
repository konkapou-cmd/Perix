/**
 * Top Navigation Bar Component - Airbnb Style
 * Replaces sidebar navigation on desktop with a clean top navbar
 */
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image,
  TextInput,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useBadge } from "../context/BadgeContext";
import { COLORS } from "../lib/designTokens";

export default function TopNavbar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { unreadMessageCount, activityCount } = useBadge();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navItems = [
    { key: "home", label: t("tabs.home") || "Home", path: "/" },
    { key: "explore", label: t("nav.explore") || "Explore", path: "/locator" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/" || pathname === "/home" || pathname.includes("/home");
    return pathname.includes(path.replace("/", ""));
  };

  return (
    <View style={styles.navbar}>
      <View style={styles.container}>
        {/* Left: Logo */}
        <Pressable 
          style={styles.logoSection}
          onPress={() => router.navigate("/(tabs)/home" as any)}
          data-testid="navbar-logo"
        >
          <View style={styles.logoIcon}>
            <Ionicons name="location" size={20} color={COLORS.background} />
          </View>
          <Text style={styles.logoText}>Perix</Text>
        </Pressable>

        {/* Center: Navigation Links */}
        <View style={styles.navLinks}>
          {navItems.map((item) => {
            const active = isActive(item.path);
            const hovered = hoveredItem === item.key;
            
            return (
              <Pressable
                key={item.key}
                style={[
                  styles.navLink,
                  active && styles.navLinkActive,
                  hovered && !active && styles.navLinkHover,
                ]}
                onPress={() => router.push(item.path as any)}
                onHoverIn={() => setHoveredItem(item.key)}
                onHoverOut={() => setHoveredItem(null)}
                data-testid={`navbar-${item.key}`}
              >
                <Text style={[
                  styles.navLinkText,
                  active && styles.navLinkTextActive,
                ]}>
                  {item.label}
                </Text>
                {active && <View style={styles.activeIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* Right: Actions */}
        <View style={styles.rightSection}>
          {/* Create Button */}
          <Pressable
            style={[
              styles.createButton,
              hoveredItem === "create" && styles.createButtonHover,
            ]}
            onPress={() => router.push("/camera")}
            onHoverIn={() => setHoveredItem("create")}
            onHoverOut={() => setHoveredItem(null)}
            data-testid="navbar-create"
          >
            <Ionicons name="add" size={18} color={COLORS.background} />
            <Text style={styles.createButtonText}>Create</Text>
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
            <Ionicons name="chatbubble-outline" size={22} color={COLORS.textSecondary} />
            {unreadMessageCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Notifications */}
          <Pressable
            style={[
              styles.iconButton,
              hoveredItem === "notifications" && styles.iconButtonHover,
            ]}
            onPress={() => router.push("/(tabs)/messages" as any)}
            onHoverIn={() => setHoveredItem("notifications")}
            onHoverOut={() => setHoveredItem(null)}
            data-testid="navbar-notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={COLORS.textSecondary} />
            {activityCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {activityCount > 9 ? "9+" : activityCount}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Create Post */}
          <Pressable
            style={[
              styles.iconButton,
              hoveredItem === "camera" && styles.iconButtonHover,
            ]}
            onPress={() => router.push("/camera" as any)}
            onHoverIn={() => setHoveredItem("camera")}
            onHoverOut={() => setHoveredItem(null)}
            data-testid="navbar-camera"
          >
            <Ionicons name="camera-outline" size={22} color={COLORS.primary} />
          </Pressable>

          {/* User Menu */}
          <Pressable
            style={[
              styles.userButton,
              hoveredItem === "user" && styles.userButtonHover,
            ]}
            onPress={() => router.navigate("/(tabs)/profile" as any)}
            onHoverIn={() => setHoveredItem("user")}
            onHoverOut={() => setHoveredItem(null)}
            data-testid="navbar-user"
          >
            <Ionicons name="menu" size={16} color={COLORS.textSecondary} />
            {user?.profile_photo ? (
              <Image
                source={{ uri: user.profile_photo }}
                style={styles.userAvatar}
              />
            ) : (
              <View style={styles.userAvatarPlaceholder}>
                <Ionicons name="person" size={16} color={COLORS.textMuted} />
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
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
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primaryDark,
    letterSpacing: -0.3,
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
    backgroundColor: COLORS.divider,
  },
  navLinkHover: {
    backgroundColor: COLORS.surfaceSoft,
  },
  navLinkText: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  navLinkTextActive: {
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: [{ translateX: -12 }],
    width: 24,
    height: 2,
    backgroundColor: COLORS.primaryDark,
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primaryHover,
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
  userButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
        transition: "all 0.15s ease" as any,
      },
    }),
  },
  userButtonHover: {
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  userAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.divider,
    alignItems: "center",
    justifyContent: "center",
  },
});
