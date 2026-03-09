import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useBadge } from "../../context/BadgeContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import TopNavbar from "../../components/TopNavbar";

function MessageTabIcon({ color, size }: { color: string; size: number }) {
  const { totalBadgeCount } = useBadge();
  
  return (
    <View>
      <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
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

export default function TabsLayout() {
  const { t } = useTranslation();
  const { isDesktop } = useResponsiveLayout();
  const showTopNavbar = isDesktop && Platform.OS === "web";
  
  return (
    <View style={styles.container}>
      {/* Desktop Top Navbar - Airbnb style */}
      {showTopNavbar && <TopNavbar />}
      
      {/* Main Content with centered container */}
      <View style={[
        styles.mainContent,
        showTopNavbar && styles.desktopContent
      ]}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#4c6fff",
            tabBarInactiveTintColor: "#9ca3af",
            // Hide tab bar on desktop
            tabBarStyle: showTopNavbar ? { display: "none" } : undefined,
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: t("tabs.home"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="locator"
            options={{
              title: t("tabs.search"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="map-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="activities"
            options={{
              title: t("tabs.activities"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="calendar-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="messages"
            options={{
              title: t("tabs.messages"),
              tabBarIcon: ({ color, size }) => (
                <MessageTabIcon color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: t("tabs.profile"),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="person-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
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
    backgroundColor: "#ef4444",
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
