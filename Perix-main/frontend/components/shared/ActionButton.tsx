import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

type ActionButtonProps = {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "success" | "danger" | "outline";
  size?: "small" | "medium" | "large";
  isLoading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export const ActionButton = ({
  title,
  onPress,
  icon,
  variant = "primary",
  size = "medium",
  isLoading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}: ActionButtonProps) => {
  const getButtonStyle = () => {
    const baseStyle: ViewStyle[] = [styles.button, styles[`button_${size}`]];
    
    switch (variant) {
      case "primary":
        baseStyle.push(styles.buttonPrimary);
        break;
      case "secondary":
        baseStyle.push(styles.buttonSecondary);
        break;
      case "success":
        baseStyle.push(styles.buttonSuccess);
        break;
      case "danger":
        baseStyle.push(styles.buttonDanger);
        break;
      case "outline":
        baseStyle.push(styles.buttonOutline);
        break;
    }
    
    if (fullWidth) baseStyle.push(styles.buttonFullWidth);
    if (disabled || isLoading) baseStyle.push(styles.buttonDisabled);
    if (style) baseStyle.push(style);
    
    return baseStyle;
  };

  const getTextStyle = () => {
    const baseTextStyle: TextStyle[] = [styles.text, styles[`text_${size}`]];
    
    if (variant === "outline") {
      baseTextStyle.push(styles.textOutline);
    } else {
      baseTextStyle.push(styles.textDefault);
    }
    
    if (textStyle) baseTextStyle.push(textStyle);
    
    return baseTextStyle;
  };

  const iconSize = size === "small" ? 14 : size === "medium" ? 16 : 20;
  const iconColor = variant === "outline" ? COLORS.primary : "#fff";

  return (
    <Pressable
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={iconSize} color={iconColor} style={styles.icon} />}
          <Text style={getTextStyle()}>{title}</Text>
        </>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  button_small: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  button_medium: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  button_large: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  buttonSecondary: {
    backgroundColor: COLORS.textMuted,
  },
  buttonSuccess: {
    backgroundColor: COLORS.success,
  },
  buttonDanger: {
    backgroundColor: COLORS.error,
  },
  buttonOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  buttonFullWidth: {
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  text: {
    fontWeight: "600",
  },
  text_small: {
    fontSize: 12,
  },
  text_medium: {
    fontSize: 14,
  },
  text_large: {
    fontSize: 16,
  },
  textDefault: {
    color: "#fff",
  },
  textOutline: {
    color: COLORS.primary,
  },
  icon: {
    marginRight: 6,
  },
});
