export const PROFILE = {
  COVER_HEIGHT: 200,
  AVATAR_SIZE: 100,
  AVATAR_BOTTOM_OFFSET: -50,
  HEADER_OVERLAP: 50,
  TAB_BAR_HEIGHT: 48,
  TAB_ACTIVE_COLOR: "#111827",
  TAB_INACTIVE_COLOR: "#9ca3af",
  CARD_RADIUS: 16,
  BUTTON_RADIUS: 12,
  SECTION_GAP: 20,
  HORIZONTAL_PADDING: 20,
} as const;

export const PROFILE_COLORS = {
  PRIMARY: "#111827",
  BG: "#ffffff",
  CARD: "#ffffff",
  TEXT: "#111827",
  TEXT_SECONDARY: "#6b7280",
  BORDER: "#e5e7eb",
  DANGER: "#ef4444",
  WARNING: "#f59e0b",
  SUCCESS: "#10b981",
  GOLD: "#FFD700",
} as const;

export type ProfileColors = typeof PROFILE_COLORS;
