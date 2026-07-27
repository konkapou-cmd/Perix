import { View, Text, TextInput, Pressable, StyleSheet, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { MarketplaceAttribute, MarketplaceAttributeOption } from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  attributes: MarketplaceAttribute[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
};

export default function MarketplaceAttributeFields({ attributes, values, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <View>
      {attributes.map((attr) => {
        const val = values[attr.key];

        if (attr.type === "boolean") {
          return (
            <View key={attr.key} style={styles.row}>
              <Text style={styles.label}>
                {t(attr.labelKey, attr.fallback)}
                {attr.required ? <Text style={styles.req}>*</Text> : null}
              </Text>
              <Switch
                value={!!val}
                onValueChange={(v) => onChange(attr.key, v)}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
              />
            </View>
          );
        }

        if (attr.type === "number") {
          return (
            <View key={attr.key} style={styles.field}>
              <Text style={styles.label}>
                {t(attr.labelKey, attr.fallback)}
                {attr.required ? <Text style={styles.req}>*</Text> : null}
              </Text>
              <TextInput
                style={styles.input}
                value={val != null ? String(val) : ""}
                onChangeText={(text) => onChange(attr.key, text ? Number(text) : null)}
                keyboardType="numeric"
                placeholder={t(attr.labelKey, attr.fallback)}
                placeholderTextColor={COLORS.textDisabled}
              />
            </View>
          );
        }

        if (attr.type === "single_select" && attr.options) {
          return (
            <View key={attr.key} style={styles.field}>
              <Text style={styles.label}>
                {t(attr.labelKey, attr.fallback)}
                {attr.required ? <Text style={styles.req}>*</Text> : null}
              </Text>
              <View style={styles.chipRow}>
                {attr.options.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[styles.chip, val === opt.key && styles.chipActive]}
                    onPress={() => onChange(attr.key, val === opt.key ? null : opt.key)}
                  >
                    <Text style={[styles.chipText, val === opt.key && styles.chipTextActive]}>
                      {t(opt.labelKey, opt.fallback)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }

        if (attr.type === "multi_select" && attr.options) {
          const selected: string[] = Array.isArray(val) ? val : [];
          return (
            <View key={attr.key} style={styles.field}>
              <Text style={styles.label}>
                {t(attr.labelKey, attr.fallback)}
                {attr.required ? <Text style={styles.req}>*</Text> : null}
              </Text>
              <View style={styles.chipRow}>
                {attr.options.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[styles.chip, selected.includes(opt.key) && styles.chipActive]}
                    onPress={() => {
                      const next = selected.includes(opt.key)
                        ? selected.filter((k) => k !== opt.key)
                        : [...selected, opt.key];
                      onChange(attr.key, next.length > 0 ? next : null);
                    }}
                  >
                    <Text style={[styles.chipText, selected.includes(opt.key) && styles.chipTextActive]}>
                      {t(opt.labelKey, opt.fallback)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }

        return (
          <View key={attr.key} style={styles.field}>
            <Text style={styles.label}>
              {t(attr.labelKey, attr.fallback)}
              {attr.required ? <Text style={styles.req}>*</Text> : null}
            </Text>
            <TextInput
              style={styles.input}
              value={val != null ? String(val) : ""}
              onChangeText={(text) => onChange(attr.key, text || null)}
              placeholder={t(attr.labelKey, attr.fallback)}
              placeholderTextColor={COLORS.textDisabled}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: SPACING.small },
  label: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 4 },
  req: { color: COLORS.danger },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.small },
  input: {
    backgroundColor: COLORS.backgroundPage, borderRadius: BORDER_RADIUS.md,
    padding: 12, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  chipTextActive: { color: "#fff" },
});
