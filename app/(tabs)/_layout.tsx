import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useBadge } from "../../context/BadgeContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import TopNavbar from "../../components/TopNavbar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";
import { useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useState } from "react";
import BusinessActionsModal, { BusinessAction } from "../../components/business/BusinessActionsModal";
import CreationSheet, { CreationAction } from "../../components/user/CreationSheet";

function TabBarBackground() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }} />
  );
}

function MessageTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  const { totalBadgeCount } = useBadge();

  return (
    <View>
      <Ionicons
        name={filled ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
        size={size}
        color={color}
      />
      {totalBadgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
          </Text>
        </View>
      )}
    </View>
  );
}

function HomeTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <Ionicons name={filled ? "home" : "home-outline"} size={size} color={color} />;
}

function SearchTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <Ionicons name={filled ? "map" : "map-outline"} size={size} color={color} />;
}

function ProfileTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <Ionicons name={filled ? "person" : "person-outline"} size={size} color={color} />;
}

function JobsTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <Ionicons name={filled ? "briefcase" : "briefcase-outline"} size={size} color={color} />;
}

function CameraTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <Ionicons name={filled ? "camera" : "camera-outline"} size={size} color={color} />;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { isDesktop } = useResponsiveLayout();
  const showTopNavbar = isDesktop && Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeIdentity } = useAuth();
  const [showBizActions, setShowBizActions] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const isBusiness = activeIdentity?.type === "business";

  const handleBizAction = (action: BusinessAction) => {
    switch (action) {
      case "cityad":
        router.push("/camera");
        break;
      case "event":
        router.replace({ pathname: "/(tabs)/profile", params: { openEvent: "1" } });
        break;
      case "job":
        router.replace({ pathname: "/(tabs)/profile", params: { openJob: "1" } });
        break;
      case "service":
        router.replace({ pathname: "/(tabs)/profile", params: { openService: "1" } });
        break;
      case "bookings":
        router.replace({ pathname: "/(tabs)/profile", params: { openBookings: "1" } });
        break;
    }
  };

  const handleCreateAction = (action: CreationAction) => {
    switch (action) {
      case "business":
        if (isBusiness) {
          router.replace("/(tabs)/profile");
        } else {
          router.push("/business/create" as any);
        }
        break;
      case "camera":
        router.push("/camera");
        break;
      case "activity":
        router.replace({ pathname: "/(tabs)/profile", params: { openActivity: "1" } as any });
        break;
      case "home_rental":
      case "product":
        // Open listing modal — implement in Phase 3
        break;
    }
  };

  return (
    <View style={styles.container}>
      {showTopNavbar && <TopNavbar />}

      <View style={[
        styles.mainContent,
        showTopNavbar && styles.desktopContent
      ]}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: COLORS.primaryDark,
            tabBarInactiveTintColor: COLORS.textSecondary,
            tabBarStyle: showTopNavbar ? { display: "none" } : {
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: insets.bottom,
              paddingTop: insets.bottom > 0 ? 0 : 8,
              backgroundColor: COLORS.background,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: COLORS.border,
              elevation: 0,
              height: 52 + insets.bottom,
            },
            tabBarBackground: () => <TabBarBackground />,
            tabBarLabelStyle: {
              display: "none",
            },
            lazy: true,
            freezeOnBlur: true,
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              tabBarIcon: ({ color, size, focused }) => (
                <HomeTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="locator"
            options={{
              tabBarIcon: ({ color, size, focused }) => (
                <SearchTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarIcon: ({ color, size, focused }) => (
                <ProfileTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="messages"
            options={{
              tabBarIcon: ({ color, size, focused }) => (
                <MessageTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="jobs"
            options={{
              tabBarItemStyle: !isBusiness ? { display: "none" } : undefined,
              tabBarButton: isBusiness
                ? (props: any) => (
                    <Pressable {...props} onPress={() => setShowBizActions(true)} />
                  )
                : undefined,
              tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
                <JobsTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="create"
            options={{
              tabBarItemStyle: isBusiness ? { display: "none" } : undefined,
              tabBarButton: !isBusiness
                ? (props: any) => (
                    <Pressable {...props} onPress={() => setShowCreateSheet(true)} />
                  )
                : undefined,
              tabBarIcon: ({ color, size, focused }) => (
                <CameraTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
        </Tabs>
      </View>

      <BusinessActionsModal
        visible={showBizActions}
        onClose={() => setShowBizActions(false)}
        onAction={handleBizAction}
      />
      <CreationSheet
        visible={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        onAction={handleCreateAction}
        hasBusiness={isBusiness}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  mainContent: {
    flex: 1,
  },
  desktopContent: {
    maxWidth: 1280,
    width: "100%",
    marginHorizontal: "auto",
    ...Platform.select({
      web: {
        paddingHorizontal: 24,
      },
    }),
  },
  badge: {
    position: "absolute",
    right: -8,
    top: -4,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
