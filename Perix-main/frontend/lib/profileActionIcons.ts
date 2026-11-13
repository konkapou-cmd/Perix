import type { ImageSourcePropType } from "react-native";

/**
 * Handcrafted wooden action icons (profile header actions), cut with alpha
 * mask from "Χειροποίητα ξύλινα εικονίδια εφαρμογής.png".
 * Order on the sheet: Επεξεργασία · Μοίρασμα · Προφίλ · Αποθηκευμένα · Ρυθμίσεις.
 */
export const PROFILE_ACTION_ILLUSTRATIONS: Record<string, ImageSourcePropType> = {
  edit: require("../assets/icons/profile-actions/edit.webp"),
  share: require("../assets/icons/profile-actions/share.webp"),
  visit: require("../assets/icons/profile-actions/visit.webp"),
  saved: require("../assets/icons/profile-actions/saved.webp"),
  settings: require("../assets/icons/profile-actions/settings.webp"),
};
