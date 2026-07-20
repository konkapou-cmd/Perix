import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES } from "../../lib/designTokens";
import { HeaderBackButton } from "../shared/HeaderBackButton";

type Props = {
  title: string;
  tab: "items" | "homes";
  onBack: () => void;
  onTabChange: (tab: "items" | "homes") => void;
  onMyListings: () => void;
};

export default function DiscoveryHeader({ title, tab, onBack, onTabChange, onMyListings }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <HeaderBackButton onPress={onBack} />
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onMyListings} style={styles.myBtn}>
          <Ionicons name="list-outline" size={22} color={COLORS.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, tab === "items" && styles.tabActive]}
          onPress={() => onTabChange("items")}
        >
          <Text style={[styles.tabText, tab === "items" && styles.tabTextActive]}>
            {t("marketplace.items", "Artikel")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "homes" && styles.tabActive]}
          onPress={() => onTabChange("homes")}
        >
          <Text style={[styles.tabText, tab === "homes" && styles.tabTextActive]}>
            {t("marketplace.homes", "Unterkünfte")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingTop: SPACING.small,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.small,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  myBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.std,
    gap: SPACING.small,
    paddingBottom: SPACING.small,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: "#fff",
  },
});
