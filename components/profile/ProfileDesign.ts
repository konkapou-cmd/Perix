import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";

export const PROFILE = {
  COVER_ASPECT_RATIO: 3,
  AVATAR_SIZE: 112,
  AVATAR_BOTTOM_OFFSET: -56,
  HEADER_OVERLAP: 56,
  TAB_BAR_HEIGHT: 56,
  TAB_ACTIVE_COLOR: COLORS.primary,
  TAB_INACTIVE_COLOR: COLORS.textSecondary,
  CARD_RADIUS: BORDER_RADIUS.card,
  BUTTON_RADIUS: BORDER_RADIUS.button,
  SECTION_GAP: 20,
  HORIZONTAL_PADDING: 24,
} as const;

export const PROFILE_COLORS = {
  PRIMARY: COLORS.primary,
  BG: COLORS.background,
  CARD: COLORS.background,
  TEXT: COLORS.textPrimary,
  TEXT_SECONDARY: COLORS.textSecondary,
  BORDER: COLORS.border,
  DANGER: COLORS.danger,
  WARNING: COLORS.warning,
  SUCCESS: COLORS.success,
  GOLD: COLORS.gold,
} as const;

export type ProfileColors = typeof PROFILE_COLORS;
