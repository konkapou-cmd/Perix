import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { translateCategory } from "../../lib/categoryTranslation";

type CategoryBadgeProps = {
  rootCategory?: string;
  subcategory?: string;
  showRoot?: boolean;
  style?: "default" | "small" | "inline";
};

export const CategoryBadge = ({ 
  rootCategory, 
  subcategory, 
  showRoot = true,
  style = "default" 
}: CategoryBadgeProps) => {
  const { t } = useTranslation();

  if (!rootCategory && !subcategory) return null;

  const rootText = rootCategory ? translateCategory(rootCategory, t) : "";
  const subText = subcategory ? translateCategory(subcategory, t) : "";

  if (style === "inline") {
    return (
      <Text style={styles.inlineText}>
        {showRoot && rootText ? `${rootText} · ` : ""}{subText}
      </Text>
    );
  }

  return (
    <View style={[styles.container, style === "small" && styles.containerSmall]}>
      {showRoot && rootText && (
        <Text style={[styles.rootText, style === "small" && styles.textSmall]}>
          {rootText}
        </Text>
      )}
      {subText && (
        <Text style={[styles.subText, style === "small" && styles.textSmall]}>
          {showRoot && rootText ? " · " : ""}{subText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  containerSmall: {
    marginTop: 2,
  },
  rootText: {
    color: "#6b7280",
    fontSize: 14,
  },
  subText: {
    color: "#6b7280",
    fontSize: 14,
  },
  textSmall: {
    fontSize: 12,
  },
  inlineText: {
    color: "#6b7280",
    fontSize: 14,
  },
});
