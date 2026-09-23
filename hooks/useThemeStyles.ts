import { useMemo } from 'react';
import { TextStyle, StyleProp, ViewStyle } from 'react-native';
import { ProfileTheme } from '../lib/api';

export interface ThemeStyles {
  fontFamily?: string;
  fontWeight?: TextStyle['fontWeight'];
  fontStyle?: TextStyle['fontStyle'];
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
}

export interface ThemeColors {
  backgroundColor: string;
  primaryColor: string;
  textColor: string;
  secondaryColor: string;
  cardColor: string;
  borderColor: string;
  accentColor: string;
}

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation?: number;
}

export interface ThemeLayout {
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
    huge: number;
  };
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    full: number;
  };
  shadows: {
    subtle: ShadowStyle;
    medium: ShadowStyle;
    strong: ShadowStyle;
  };
  maxWidth: {
    container: number;
    content: number;
  };
  heights: {
    avatar: number;
    avatarSmall: number;
    avatarLarge: number;
    button: number;
    buttonSmall: number;
    input: number;
    inputSmall: number;
    card: number;
    cardSmall: number;
  };
}

export interface UseThemeStylesResult {
  themeStyles: ThemeStyles;
  themeColors: ThemeColors;
  themeLayout: ThemeLayout;
  isDark: boolean;
}

const DEFAULT_COLORS = {
  backgroundColor: '#ffffff',
  primaryColor: '#025EF2',
  textColor: '#02022A',
  secondaryColor: '#5A6276',
  cardColor: '#ffffff',
  borderColor: '#E6EAF0',
  accentColor: '#025EF2',
};

export function useThemeStyles(theme?: ProfileTheme | null): UseThemeStylesResult {
    return useMemo(() => {
        const themeStyles: ThemeStyles = {
            fontFamily: theme?.font_family || undefined,
            fontWeight: (theme?.font_weight || '400') as TextStyle['fontWeight'],
            fontStyle: (theme?.font_style || 'normal') as TextStyle['fontStyle'],
            letterSpacing: theme?.letter_spacing || 0,
            textTransform: (theme?.text_transform || 'none') as TextStyle['textTransform'],
        };

        const backgroundColor = (theme?.background_color as string) || DEFAULT_COLORS.backgroundColor;
        const primaryColor = theme?.primary_color || DEFAULT_COLORS.primaryColor;
        const textColor = theme?.text_color || DEFAULT_COLORS.textColor;
        const secondaryColor = theme?.secondary_color || DEFAULT_COLORS.secondaryColor;
        const cardColor = theme?.card_color || DEFAULT_COLORS.cardColor;
        const borderColor = (theme?.border_color as string) || DEFAULT_COLORS.borderColor;
        const accentColor = theme?.action_button_color || primaryColor;

        // Calculate if background is dark (luminance < 0.5)
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 255, b: 255 };
        };

        const getLuminance = (hex: string) => {
            const { r, g, b } = hexToRgb(hex);
            const [rs, gs, bs] = [r / 255, g / 255, b / 255];
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };

        const isDark = getLuminance(backgroundColor) < 0.5;

        const themeColors: ThemeColors = {
            backgroundColor,
            primaryColor,
            textColor,
            secondaryColor,
            cardColor,
            borderColor,
            accentColor,
        };

        // Default layout tokens - can be overridden by theme extensions in future
        const themeLayout: ThemeLayout = {
            spacing: {
                xs: 4,
                sm: 6,
                md: 8,
                lg: 12,
                xl: 16,
                xxl: 20,
                xxxl: 24,
                huge: 32,
            },
            borderRadius: {
                none: 0,
                sm: 8,
                md: 12,
                lg: 16,
                xl: 20,
                xxl: 24,
                full: 9999,
            },
            shadows: {
                subtle: {
                    shadowColor: "#2B075F",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.06,
                    shadowRadius: 12,
                    elevation: 2,
                },
                medium: {
                    shadowColor: "#2B075F",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.10,
                    shadowRadius: 24,
                    elevation: 6,
                },
                strong: {
                    shadowColor: "#2B075F",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.18,
                    shadowRadius: 24,
                    elevation: 10,
                },
            },
            maxWidth: {
                container: 1280,
                content: 1100,
            },
            heights: {
                avatar: 40,
                avatarSmall: 24,
                avatarLarge: 64,
                button: 40,
                buttonSmall: 32,
                input: 40,
                inputSmall: 32,
                card: 120,
                cardSmall: 80,
            },
        };

        return {
            themeStyles,
            themeColors,
            themeLayout,
            isDark,
        };
    }, [theme]);
}

export function applyThemeToText<T extends TextStyle>(
  baseStyle: T,
  themeStyles?: ThemeStyles,
  color?: string
): StyleProp<TextStyle> {
  if (!themeStyles && !color) return baseStyle;
  
  return {
    ...baseStyle,
    fontFamily: themeStyles?.fontFamily,
    fontWeight: themeStyles?.fontWeight,
    fontStyle: themeStyles?.fontStyle,
    letterSpacing: themeStyles?.letterSpacing,
    textTransform: themeStyles?.textTransform,
    color: color || baseStyle.color,
  };
}

export function getThemeColors(theme?: ProfileTheme | null): ThemeColors {
  if (!theme) return DEFAULT_COLORS;
  
  return {
    backgroundColor: (theme.background_color as string) || DEFAULT_COLORS.backgroundColor,
    primaryColor: theme.primary_color || DEFAULT_COLORS.primaryColor,
    textColor: theme.text_color || DEFAULT_COLORS.textColor,
    secondaryColor: theme.secondary_color || DEFAULT_COLORS.secondaryColor,
    cardColor: theme.card_color || DEFAULT_COLORS.cardColor,
    borderColor: (theme.border_color as string) || DEFAULT_COLORS.borderColor,
    accentColor: theme.action_button_color || theme.primary_color || DEFAULT_COLORS.accentColor,
  };
}

export function getThemeStyles(theme?: ProfileTheme | null): ThemeStyles {
  if (!theme) return {};
  
  return {
    fontFamily: theme.font_family || undefined,
    fontWeight: (theme.font_weight || '400') as TextStyle['fontWeight'],
    fontStyle: (theme.font_style || 'normal') as TextStyle['fontStyle'],
    letterSpacing: theme.letter_spacing || 0,
    textTransform: (theme.text_transform || 'none') as TextStyle['textTransform'],
  };
}

export function isThemeDark(theme?: ProfileTheme | null): boolean {
  if (!theme?.background_color) return false;
  
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  };
  
  const getLuminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    const [rs, gs, bs] = [r / 255, g / 255, b / 255];
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  
  return getLuminance(theme.background_color) < 0.5;
}
