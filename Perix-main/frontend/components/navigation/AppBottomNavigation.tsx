import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useBadge } from "../../context/BadgeContext";
import { useCreateFlow } from "../../context/CreateFlowContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { COLORS } from "../../lib/designTokens";
import { TAB_BAR_ILLUSTRATIONS } from "../../lib/illustrationSources.generated";
import { bottomDestinations, bottomDestinationActive } from "../../lib/navigation/bottomNavigation";
import { TAB_BAR_CONTENT_HEIGHT, TAB_BUTTON_ICON_SIZE } from "../../lib/navigation/tabLayout";
import TabArtworkButton from "./TabArtworkButton";

/** One footer for the public App and all member tabs; auth stays explicit. */
export default function AppBottomNavigation() {
  const { user, sessionToken, loading, activeIdentity } = useAuth();
  const { totalBadgeCount } = useBadge();
  const { openCreateSheet, openBizActions } = useCreateFlow();
  const { isDesktop } = useResponsiveLayout();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets(), router = useRouter(), pathname = usePathname();
  if (isDesktop && Platform.OS === "web") return null;
  const authenticated = !!user && !!sessionToken;
  const count = authenticated ? totalBadgeCount : 0;
  return <View testID="app-bottom-navigation" accessibilityRole="tablist"
    style={[styles.bar, { height: TAB_BAR_CONTENT_HEIGHT + insets.bottom, paddingBottom: insets.bottom + 2 }]}>
    {bottomDestinations(activeIdentity?.type === "business").map(item => {
      const focused = bottomDestinationActive(item.id, pathname);
      const label = item.id === "app" ? "APP" : item.id === "home" ? t("nav.members", "Members")
        : item.id === "create" ? t("common.create", "Create") : t(`tabs.${item.id}`, item.id);
      return <Pressable key={item.id} testID={`bottom-tab-${item.id}`} accessibilityRole="tab"
        accessibilityLabel={label} accessibilityState={{ selected: focused, disabled: item.requiresLogin && loading }}
        disabled={item.requiresLogin && loading} style={styles.item} onPress={() => {
          if (item.requiresLogin && !authenticated) { router.push("/login" as never); return; }
          if (item.action === "business") { openBizActions(); return; }
          if (item.action === "create") { openCreateSheet(); return; }
          if (item.path) router.navigate(item.path as never);
        }}>
        <TabArtworkButton source={item.artwork ? TAB_BAR_ILLUSTRATIONS[item.artwork] : undefined} focused={focused}>
          {!item.artwork && <Ionicons name="briefcase-outline" size={TAB_BUTTON_ICON_SIZE} color="#264348" />}
          {item.id === "messages" && count > 0 && <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
          </View>}
        </TabArtworkButton>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", flexShrink: 0, paddingTop: 2, backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  item: { flex: 1, minHeight: 52, paddingVertical: 2, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", right: -3, top: -3, backgroundColor: COLORS.error, borderRadius: 10,
    minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
