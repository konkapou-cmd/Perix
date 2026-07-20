import { Modal, View, Text, Pressable, ScrollView, TextInput, SafeAreaView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { MARKETPLACE_CATEGORIES, MarketplaceCategory } from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  visible: boolean;
  selectedCategory: string;
  selectedSubcategory: string;
  onSelect: (category: string, subcategory: string) => void;
  onClose: () => void;
};

export default function MarketplaceCategoryPicker({ visible, selectedCategory, selectedSubcategory, onSelect, onClose }: Props) {
  const { t } = useTranslation();

  const currentCat = MARKETPLACE_CATEGORIES.find((c) => c.key === selectedCategory);
  const subs = currentCat?.subcategories ?? [];

  const handleCatPick = (cat: MarketplaceCategory) => {
    if (cat.key === selectedCategory) {
      onSelect(cat.key, selectedSubcategory);
    } else {
      onSelect(cat.key, "");
    }
  };

  const handleSubPick = (subKey: string) => {
    onSelect(selectedCategory, subKey);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{selectedCategory ? t("marketplace.selectSubcategory", "Unterkategorie wählen") : t("marketplace.selectCategory", "Kategorie wählen")}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
        </View>

        {!selectedCategory ? (
          <ScrollView contentContainerStyle={styles.body}>
            {MARKETPLACE_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.key}
                style={styles.row}
                onPress={() => handleCatPick(cat)}
              >
                <Ionicons name={cat.icon as any} size={24} color={COLORS.primary} style={{ marginRight: 12 }} />
                <Text style={styles.rowText}>{t(cat.labelKey, cat.fallback)}</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <Pressable style={styles.backRow} onPress={() => onSelect("", "")}>
              <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
              <Text style={styles.backText}>{t("common.back", "Zurück")}</Text>
            </Pressable>
            {subs.map((sub) => (
              <Pressable
                key={sub.key}
                style={[styles.row, selectedSubcategory === sub.key && styles.rowSelected]}
                onPress={() => handleSubPick(sub.key)}
              >
                <Text style={styles.rowText}>{t(sub.labelKey, sub.fallback)}</Text>
                {selectedSubcategory === sub.key && (
                  <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.std, paddingVertical: SPACING.small,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { fontSize: FONT_SIZES.h3, fontWeight: "700", color: COLORS.textPrimary },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  body: { padding: SPACING.std },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowSelected: { backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.small },
  rowText: { flex: 1, fontSize: FONT_SIZES.body, color: COLORS.textPrimary },
  backRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, marginBottom: 8,
  },
  backText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.primary, fontWeight: "600" },
});
