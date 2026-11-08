import React from "react";
import { Image, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CATEGORY_GROUP_ILLUSTRATIONS,
  HOME_ILLUSTRATIONS,
  MARKETPLACE_PARENT_ILLUSTRATIONS,
  MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS,
  ROOT_CATEGORY_ILLUSTRATIONS,
  SERVICE_MODULE_ILLUSTRATIONS,
  SUBCATEGORY_ILLUSTRATIONS,
} from "../../lib/illustrationSources.generated";

export type IllustratedIconKind =
  | "home"
  | "home-or-root"
  | "business-root"
  | "business-group"
  | "business-subcategory"
  | "marketplace-parent"
  | "marketplace-subcategory"
  | "service-module";

export function illustratedIconSource(kind: IllustratedIconKind, key: string): ImageSourcePropType | undefined {
  switch (kind) {
    case "home": return HOME_ILLUSTRATIONS[key];
    case "home-or-root": return HOME_ILLUSTRATIONS[key] || ROOT_CATEGORY_ILLUSTRATIONS[key];
    case "business-root": return ROOT_CATEGORY_ILLUSTRATIONS[key];
    case "business-group": return CATEGORY_GROUP_ILLUSTRATIONS[key];
    case "business-subcategory": return SUBCATEGORY_ILLUSTRATIONS[key];
    case "marketplace-parent": return MARKETPLACE_PARENT_ILLUSTRATIONS[key];
    case "marketplace-subcategory": return MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS[key];
    case "service-module": return SERVICE_MODULE_ILLUSTRATIONS[key];
  }
}

export default function IllustratedIcon({
  kind, iconKey, size, fallback = "grid-outline", color = "#264348", style, testID,
}: {
  kind: IllustratedIconKind;
  iconKey: string;
  size: number;
  fallback?: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
  style?: any;
  testID?: string;
}) {
  const source = illustratedIconSource(kind, iconKey);
  if (!source) return <Ionicons name={fallback} size={size} color={color} style={style as any} testID={testID} />;
  return <Image source={source} resizeMode="contain" accessible={false} testID={testID}
    style={[{ width: size, height: size, flexShrink: 0 }, style]} />;
}
