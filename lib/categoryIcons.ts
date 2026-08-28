import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

export const CATEGORY_ICONS: Record<string, IconName> = {
  // Root categories
  food: "restaurant",
  drinks: "wine",
  music: "musical-notes",
  nightlife: "moon",
  sports: "fitness",
  beauty: "rose",
  health: "medkit",
  education: "school",
  shopping: "bag",
  technology: "hardware-chip",
  automotive: "car",
  realestate: "home",
  "rental-real-estate": "home",
  professional: "briefcase",
  pets: "paw",
  travel: "airplane",
  rentals: "home",
  // Subcategory-level slugs
  "sports-fitness-wellness": "fitness",
  "fashion-accessories": "shirt",
  "beauty-care": "rose",
  "entertainment-events": "ticket",
  "nightlife-social": "wine",
  "food-dining": "restaurant",
  "education-creativity": "school",
  "professional-services": "briefcase",
  "shopping-retail": "bag",
  healthcare: "medkit",
  arts: "color-palette",
  community: "people",
  entertainment: "ticket",
  fashion: "shirt",
  home: "home",
  other: "grid",
};

export const categoryIcon = (slug: string): IconName =>
  CATEGORY_ICONS[slug] || "grid";
