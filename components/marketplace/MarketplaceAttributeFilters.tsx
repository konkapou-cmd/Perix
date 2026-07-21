import { useMemo } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import {
  MarketplaceAttribute,
  getCategoryAttributes,
  getSubcategories,
} from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  category: string;
  subcategory: string;
  filters: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

export default function MarketplaceAttributeFilters({ category, subcategory, filters, onChange }: Props) {
  const { t } = useTranslation();

  const filterableAttrs = useMemo(() => {
    if (!category) return [];
    const all = getCategoryAttributes(category, subcategory || undefined);
    return all.filter((a) => a.filterable);
  }, [category, subcategory]);

  if (filterableAttrs.length === 0) return null;

  return (
    <View style={styles.container}>
      {filterableAttrs.map((attr) => {
        const val = filters[attr.key] || "";

        if (attr.type === "single_select" && attr.options) {
          return (
            <View key={attr.key} style={styles.row}>
              <Text style={styles.label}>{t(attr.labelKey, attr.fallback)}</Text>
              <View style={styles.chipRow}>
                {attr.options.map((opt) => {
                  const active = val === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => onChange(attr.key, active ? "" : opt.key)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t(opt.labelKey, opt.fallback)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }

        return (
          <View key={attr.key} style={styles.row}>
            <Text style={styles.label}>{t(attr.labelKey, attr.fallback)}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="search" size={14} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                value={val}
                onChangeText={(text) => onChange(attr.key, text)}
                placeholder={t(attr.labelKey, attr.fallback)}
                placeholderTextColor={COLORS.textDisabled}
              />
              {val ? (
                <Pressable onPress={() => onChange(attr.key, "")} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.small,
    backgroundColor: COLORS.background,
  },
  row: {
    marginBottom: SPACING.small,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    paddingVertical: 8,
    marginLeft: 6,
  },
  clearBtn: {
    padding: 4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.small,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.background,
  },
});
