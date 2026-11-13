import { Redirect, Tabs, useSegments } from "expo-router";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useBadge } from "../../context/BadgeContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../lib/designTokens";
import { useAuth } from "../../context/AuthContext";
import { useCreateFlow } from "../../context/CreateFlowContext";
import { TAB_BAR_ILLUSTRATIONS } from "../../lib/illustrationSources.generated";
import { MAP_PAGE_BACKGROUND, MAP_PAGE_MAX_WIDTH } from "../../lib/city/mapLayout";
import TabArtworkButton from '../../components/navigation/TabArtworkButton';
import { TAB_BAR_CONTENT_HEIGHT, TAB_BUTTON_FACE_SIZE, TAB_BUTTON_ICON_SIZE } from '../../lib/navigation/tabLayout';
import AppBottomNavigation from '../../components/navigation/AppBottomNavigation';

function TabBarBackground() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }} />
  );
}

function MessageTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  const { totalBadgeCount } = useBadge();

  return (
    <TabArtworkButton source={TAB_BAR_ILLUSTRATIONS.chat_tab} focused={filled}>
      {totalBadgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
          </Text>
        </View>
      )}
    </TabArtworkButton>
  );
}

function HomeTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <TabArtworkButton source={TAB_BAR_ILLUSTRATIONS.home_tab} focused={filled} />;
}

function SearchTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <TabArtworkButton source={TAB_BAR_ILLUSTRATIONS.locator_tab} focused={filled} />;
}

function ProfileTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <TabArtworkButton source={TAB_BAR_ILLUSTRATIONS.profile_tab} focused={filled} />;
}

function JobsTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return <TabArtworkButton focused={filled}><Ionicons name={filled ? "briefcase" : "briefcase-outline"} size={TAB_BUTTON_ICON_SIZE} color={color} /></TabArtworkButton>;
}

function CreateTabIcon({ color, size, filled }: { color: string; size: number; filled?: boolean }) {
  return (
    <TabArtworkButton source={TAB_BAR_ILLUSTRATIONS.create_tab} focused={filled} />
  );
}

export default function TabsLayout() {
  const { isDesktop } = useResponsiveLayout();
  const showTopNavbar = isDesktop && Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const { activeIdentity, sessionToken, user, loading } = useAuth();
  const segments = useSegments() as string[];
  const { openCreateSheet, openBizActions } = useCreateFlow();
  const router = useRouter();
  const isBusiness = activeIdentity?.type === "business";

  const requireLogin = (action: () => void) => {
    if (!sessionToken) {
      router.push("/login" as any);
      return;
    }
    action();
  };

  // Do not mount the member Home (and its effects) while a guest redirects.
  if (loading) return <ActivityIndicator />;
  if (!user || !sessionToken) return <Redirect href="/login" />;

  return (
    <View style={styles.container}>
      <View style={[
        styles.mainContent,
        showTopNavbar && styles.desktopContent
      ]}>
        <Tabs
          tabBar={() => <AppBottomNavigation />}
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#59ABE3",
            tabBarInactiveTintColor: "#264348",
            tabBarStyle: showTopNavbar ? { display: "none" } : {
              // Borderless artwork needs less chrome. Keep the 56px hit area
              // and safe-area reserve while lowering the bar's separator.
              paddingBottom: insets.bottom+2,
              paddingTop: 2,
              backgroundColor: COLORS.background,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: COLORS.border,
              elevation: 0,
              height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
            },
            tabBarIconStyle:{width:TAB_BUTTON_FACE_SIZE,height:TAB_BUTTON_FACE_SIZE},
            tabBarItemStyle:{paddingVertical:2,alignItems:'center',justifyContent:'center',minHeight:52},
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
              href: null,
              tabBarIcon: ({ color, size, focused }) => (
                <SearchTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              tabBarButton: (props: any) => {
                const { onPress: _onPress, href: _href, ...rest } = props;
                return <Pressable {...rest} onPress={() => requireLogin(() => router.navigate("/(tabs)/profile" as any))} />;
              },
              tabBarIcon: ({ color, size, focused }) => (
                <ProfileTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
            }}
          />
          <Tabs.Screen
            name="messages"
            options={{
              tabBarButton: (props: any) => {
                const { onPress: _onPress, href: _href, ...rest } = props;
                return <Pressable {...rest} onPress={() => requireLogin(() => router.navigate("/(tabs)/messages" as any))} />;
              },
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
                ? (props: any) => {
                    const { onPress: _onPress, href: _href, ...rest } = props;
                    return <Pressable {...rest} onPress={() => requireLogin(openBizActions)} />;
                  }
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
                ? (props: any) => {
                    const { onPress: _onPress, href: _href, ...rest } = props;
                    return <Pressable {...rest} onPress={() => requireLogin(openCreateSheet)} />;
                  }
                : undefined,
              tabBarIcon: ({ color, size, focused }) => (
                <CreateTabIcon color={color} size={size} filled={focused} />
              ),
              lazy: true,
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
    backgroundColor: MAP_PAGE_BACKGROUND,
  },
  mainContent: {
    flex: 1,
  },
  desktopContent: {
    maxWidth: MAP_PAGE_MAX_WIDTH,
    width: "100%",
    marginHorizontal: "auto",
    ...Platform.select({
      web: {
        paddingHorizontal: 0,
      },
    }),
  },
  badge: {
    position: "absolute",
    right: -3,
    top: -3,
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
