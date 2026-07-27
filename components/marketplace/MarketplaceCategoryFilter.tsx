import { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, TextInput, SafeAreaView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { MARKETPLACE_CATEGORIES, MarketplaceCategory } from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  visible: boolean;
  category: string;
  subcategory: string;
  onApply: (category: string, subcategory: string) => void;
  onClose: () => void;
};

export default function MarketplaceCategoryFilter({ visible, category, subcategory, onApply, onClose }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [stepCat, setStepCat] = useState(category);
  const [stepSub, setStepSub] = useState(subcategory);
  const [showingSubs, setShowingSubs] = useState(!!category);

  const filteredCats = MARKETPLACE_CATEGORIES.filter(
    (c) => !search || c.fallback.toLowerCase().includes(search.toLowerCase()),
  );

  const currentCat = MARKETPLACE_CATEGORIES.find((c) => c.key === stepCat);
  const subs = currentCat?.subcategories ?? [];

  const handleDone = () => {
    onApply(stepCat, stepSub);
    onClose();
  };

  const handleClear = () => {
    setStepCat(""); setStepSub(""); setShowingSubs(false);
    onApply("", "");
    onClose();
  };

  const handleCatSelect = (cat: MarketplaceCategory) => {
    setStepCat(cat.key);
    setStepSub("");
    setShowingSubs(true);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleClear}>
            <Text style={styles.clearBtn}>{t("marketplace.allCategories", "Alle Kategorien")}</Text>
          </Pressable>
          <Text style={styles.title}>{t("marketplace.category", "Kategorie")}</Text>
          <Pressable onPress={handleDone}>
            <Text style={styles.doneBtn}>{t("common.done", "Fertig")}</Text>
          </Pressable>
        </View>

        {!showingSubs ? (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={t("marketplace.searchCategories", "Kategorien durchsuchen...")}
                placeholderTextColor={COLORS.textDisabled}
              />
            </View>
            <ScrollView contentContainerStyle={styles.body}>
              {filteredCats.map((cat) => (
                <Pressable
                  key={cat.key}
                  style={[styles.row, stepCat === cat.key && styles.rowSelected]}
                  onPress={() => handleCatSelect(cat)}
                >
                  <Ionicons name={cat.icon as any} size={22} color={stepCat === cat.key ? COLORS.primary : COLORS.textMuted} style={{ marginRight: 12 }} />
                  <Text style={styles.rowText}>{t(cat.labelKey, cat.fallback)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <Pressable style={styles.backRow} onPress={() => { setShowingSubs(false); setStepCat(""); }}>
              <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
              <Text style={styles.backText}>{t("common.back", "Zurück")} — {t(currentCat!.labelKey, currentCat!.fallback)}</Text>
            </Pressable>
            <Pressable
              style={[styles.row, !stepSub && styles.rowSelected]}
              onPress={() => setStepSub("")}
            >
              <Text style={styles.rowText}>{t("marketplace.allSubcategories", "Alle Unterkategorien")}</Text>
              {!stepSub && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
            </Pressable>
            {subs.map((sub) => (
              <Pressable
                key={sub.key}
                style={[styles.row, stepSub === sub.key && styles.rowSelected]}
                onPress={() => setStepSub(sub.key)}
              >
                <Text style={styles.rowText}>{t(sub.labelKey, sub.fallback)}</Text>
                {stepSub === sub.key && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
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
  clearBtn: { fontSize: FONT_SIZES.bodySmall, color: COLORS.danger },
  doneBtn: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.primary },
  searchRow: {
    flexDirection: "row", alignItems: "center",
    margin: SPACING.std, paddingHorizontal: 12,
    backgroundColor: COLORS.backgroundPage, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  body: { padding: SPACING.std },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowSelected: { backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.small },
  rowText: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  backRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, marginBottom: 8,
  },
  backText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.primary, fontWeight: "600" },
});
