// Design System Tokens
// Version 1.0 - April 2026

export const COLORS = {
  primary: "#111827",
  primaryDark: "#000000",
  primaryLight: "#1f2937",

  textPrimary: "#111827",
  textSecondary: "#374151",
  textMuted: "#6b7280",
  textDisabled: "#9ca3af",
  background: "#ffffff",
  backgroundPage: "#f5f6fb",
  border: "#e5e7eb",

  danger: "#ef4444",
  dangerLight: "#fee2e2",

  error: "#ef4444",
  errorLight: "#fecaca",
  warning: "#f59e0b",
  warningLight: "#fef3c7",
  info: "#3b82f6",
  success: "#10b981",

  eventAccent: "#FF6B6B",
  activityAccent: "#7c3aed",
  gold: "#FFD700",
} as const;

export const SPACING = {
  xs: 4,
  sm: 6,
  md: 8,
  mdLg: 10,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  huge: 32,
} as const;

export const ICON_SIZES = {
  inline: 14,
  row: 18,
  interactive: 22,
  hero: 48,
} as const;

export const FONT_SIZES = {
  h1: 24,
  h2: 22,
  h3: 18,
  h4: 16,
  bodyLarge: 16,
  body: 15,
  bodySmall: 14,
  caption: 13,
  small: 12,
  micro: 11,
} as const;

export const FONT_WEIGHTS = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
};

export const BORDER_RADIUS = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const SHADOWS = {
  subtle: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  medium: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  strong: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;
