import React from "react";
import { Image, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PUBLIC_SERVICE_ILLUSTRATIONS, JOB_ILLUSTRATIONS, PROPERTY_ILLUSTRATIONS, MOBILITY_CATEGORY_ILLUSTRATIONS } from "../../lib/civicIllustrations";
import {
  CATEGORY_GROUP_ILLUSTRATIONS,
  HOME_ILLUSTRATIONS,
  ROOT_CATEGORY_ILLUSTRATIONS,
  SUBCATEGORY_ILLUSTRATIONS,
} from "../../lib/illustrationSources.generated";

// Marketplace + service-module maps stay out of the /app first-paint bundle.
// They are required lazily on first use (e.g. drilling into products/services),
// so CityGatewayScreen startup only evaluates home/root/group/sub + civic art.
function lazyGenerated(): typeof import("../../lib/illustrationSources.generated") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../lib/illustrationSources.generated") as typeof import("../../lib/illustrationSources.generated");
}

export type IllustratedIconKind =
  | "home"
  | "public-service"
  | "job-type"
  | "property-type"
  | "mobility-category"
  | "home-or-root"
  | "business-root"
  | "business-group"
  | "business-subcategory"
  | "marketplace-parent"
  | "marketplace-subcategory"
  | "service-module";

export function illustratedIconSource(kind: IllustratedIconKind, key: string): ImageSourcePropType | undefined {
  switch (kind) {
    case "public-service": return PUBLIC_SERVICE_ILLUSTRATIONS[key];
    case "job-type": return JOB_ILLUSTRATIONS[key];
    case "property-type": return PROPERTY_ILLUSTRATIONS[key];
    case "mobility-category": return MOBILITY_CATEGORY_ILLUSTRATIONS[key];
    case "home": return HOME_ILLUSTRATIONS[key];
    case "home-or-root": return HOME_ILLUSTRATIONS[key] || ROOT_CATEGORY_ILLUSTRATIONS[key];
    case "business-root": return ROOT_CATEGORY_ILLUSTRATIONS[key];
    case "business-group": return CATEGORY_GROUP_ILLUSTRATIONS[key];
    case "business-subcategory": return SUBCATEGORY_ILLUSTRATIONS[key];
    case "marketplace-parent": return lazyGenerated().MARKETPLACE_PARENT_ILLUSTRATIONS[key];
    case "marketplace-subcategory": return lazyGenerated().MARKETPLACE_SUBCATEGORY_ILLUSTRATIONS[key];
    case "service-module": return lazyGenerated().SERVICE_MODULE_ILLUSTRATIONS[key];
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
