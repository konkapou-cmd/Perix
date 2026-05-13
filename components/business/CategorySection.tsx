import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { translateCategory } from "../../lib/categoryTranslation";

type Props = {
  rootCategory: string | null;
  subcategory: string | null;
  tags: string[];
  onEdit: () => void;
};

export default function CategorySection({
  rootCategory,
  subcategory,
  tags,
  onEdit,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.cardTitle}>{t("business.category")}</Text>
        <Pressable style={styles.secondaryButton} onPress={onEdit}>
          <Text style={styles.secondaryButtonText}>{t("business.changeCategory")}</Text>
        </Pressable>
      </View>
      <View style={styles.categoryInfo}>
        <View style={styles.categoryRow}>
          <Ionicons name="grid-outline" size={20} color="#000000" />
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryLabel}>{t("business.rootCategory")}</Text>
            <Text style={styles.categoryValue}>
              {translateCategory(rootCategory || "", t) || t("business.notSet")}
            </Text>
          </View>
        </View>
        <View style={styles.categoryRow}>
          <Ionicons name="pricetag-outline" size={20} color="#10b981" />
          <View style={styles.categoryTextContainer}>
            <Text style={styles.categoryLabel}>{t("business.subcategory")}</Text>
            <Text style={styles.categoryValue}>
              {translateCategory(subcategory || "", t) || t("business.notSet")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#000000",
    fontWeight: "600",
    fontSize: 13,
  },
  categoryInfo: {
    paddingVertical: 8,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  categoryTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  categoryLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 2,
  },
  categoryValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
});
