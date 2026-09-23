/**
 * Desktop Sidebar Navigation Component
 * Replaces bottom tab bar on desktop screens
 */
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useBadge } from "../context/BadgeContext";
import { COLORS } from "../lib/designTokens";

interface NavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  path: string;
}

export default function Sidebar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { unreadMessageCount, activityCount } = useBadge();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const navItems: NavItem[] = [
    {
      key: "home",
      label: t("nav.home") || "Home",
      icon: "home-outline",
      iconActive: "home",
      path: "/(tabs)/home",
    },
    {
      key: "explore",
      label: t("nav.explore") || "Explore",
      icon: "compass-outline",
      iconActive: "compass",
      path: "/(tabs)/locator",
    },
    {
      key: "messages",
      label: t("nav.messages") || "Messages",
      icon: "chatbubble-outline",
      iconActive: "chatbubble",
      path: "/(tabs)/messages",
    },
    {
      key: "notifications",
      label: t("nav.notifications") || "Notifications",
      icon: "notifications-outline",
      iconActive: "notifications",
      path: "/notifications",
    },
    {
      key: "profile",
      label: t("nav.profile") || "Profile",
      icon: "person-outline",
      iconActive: "person",
      path: "/(tabs)/profile",
    },
  ];

  const isActive = (path: string) => {
    if (path.includes("/home")) return pathname.includes("/home");
    if (path.includes("/locator")) return pathname.includes("/locator");
    if (path.includes("/messages")) return pathname.includes("/messages");
    if (path.includes("/profile")) return pathname.includes("/profile");
    return pathname.startsWith(path);
  };

  const getBadgeCount = (key: string) => {
    if (key === "messages") return unreadMessageCount;
    if (key === "notifications") return activityCount;
    return 0;
  };

  return (
    <View style={styles.container}>
      {/* Logo */}
      <Pressable 
        style={styles.logoContainer}
        onPress={() => router.navigate("/(tabs)/home" as any)}
      >
        <View style={styles.logoIcon}>
          <Ionicons name="location" size={24} color={COLORS.background} />
        </View>
        <Text style={styles.logoText}>Perix</Text>
      </Pressable>

      {/* Navigation Items */}
      <View style={styles.navItems}>
        {navItems.map((item) => {
          const active = isActive(item.path);
          const hovered = hoveredItem === item.key;
          const badgeCount = getBadgeCount(item.key);

          return (
            <Pressable
              key={item.key}
              style={[
                styles.navItem,
                active && styles.navItemActive,
                hovered && styles.navItemHover,
              ]}
              onPress={() => router.navigate(item.path as any)}
              onHoverIn={() => setHoveredItem(item.key)}
              onHoverOut={() => setHoveredItem(null)}
              data-testid={`sidebar-nav-${item.key}`}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={active ? item.iconActive : item.icon}
                  size={24}
                  color={active ? COLORS.primaryDark : COLORS.textSecondary}
                />
                {badgeCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.navLabel,
                  active && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Create Post Button */}
      <Pressable
        style={[
          styles.createButton,
          hoveredItem === "create" && styles.createButtonHover,
        ]}
        onPress={() => router.push("/camera")}
        onHoverIn={() => setHoveredItem("create")}
        onHoverOut={() => setHoveredItem(null)}
        data-testid="sidebar-create-post"
      >
        <Ionicons name="add" size={20} color={COLORS.background} />
        <Text style={styles.createButtonText}>
          {t("nav.createPost") || "Create Post"}
        </Text>
      </Pressable>

      {/* User Profile Card */}
      {user && (
        <Pressable
          style={[
            styles.userCard,
            hoveredItem === "user" && styles.userCardHover,
          ]}
          onPress={() => router.navigate("/(tabs)/profile" as any)}
          onHoverIn={() => setHoveredItem("user")}
          onHoverOut={() => setHoveredItem(null)}
          data-testid="sidebar-user-card"
        >
          {user.profile_photo ? (
            <Image
              source={{ uri: user.profile_photo }}
              style={styles.userAvatar}
            />
          ) : (
            <View style={styles.userAvatarPlaceholder}>
              <Text style={styles.userAvatarText}>
                {(user.name || "U")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={styles.userHandle} numberOfLines={1}>
              @{user.email?.split("@")[0]}
            </Text>
          </View>
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textDisabled} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    height: "100%",
    backgroundColor: COLORS.background,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 20,
    justifyContent: "flex-start",
    ...Platform.select({
      web: {
        position: "fixed" as any,
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      },
    }),
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 24,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  navItems: {
    flex: 1,
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
        transition: "all 0.15s ease" as any,
      },
    }),
  },
  navItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  navItemHover: {
    backgroundColor: COLORS.divider,
  },
  iconContainer: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
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
  navLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  navLabelActive: {
    color: COLORS.primaryDark,
    fontWeight: "600",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 9999,
    marginTop: 16,
    marginBottom: 20,
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
    fontSize: 16,
    fontWeight: "600",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceSoft,
    ...Platform.select({
      web: {
        cursor: "pointer" as any,
        transition: "all 0.15s ease" as any,
      },
    }),
  },
  userCardHover: {
    backgroundColor: COLORS.divider,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "600",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  userHandle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
