import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";

export const PROFILE = {
  COVER_ASPECT_RATIO: 3,
  AVATAR_SIZE: 112,
  AVATAR_BOTTOM_OFFSET: -56,
  HEADER_OVERLAP: 56,
  TAB_BAR_HEIGHT: 56,
  TAB_ACTIVE_COLOR: "#59ABE3",
  TAB_INACTIVE_COLOR: "#264348",
  CARD_RADIUS: BORDER_RADIUS.card,
  BUTTON_RADIUS: BORDER_RADIUS.button,
  SECTION_GAP: 20,
  HORIZONTAL_PADDING: 24,
} as const;

export const PROFILE_COLORS = {
  PRIMARY: "#59ABE3",
  BG: COLORS.background,
  CARD: COLORS.background,
  TEXT: "#264348",
  TEXT_SECONDARY: "rgba(38,67,72,0.65)",
  BORDER: "rgba(38,67,72,0.15)",
  DANGER: COLORS.danger,
  WARNING: COLORS.warning,
  SUCCESS: COLORS.success,
  GOLD: COLORS.gold,
} as const;

export type ProfileColors = typeof PROFILE_COLORS;
