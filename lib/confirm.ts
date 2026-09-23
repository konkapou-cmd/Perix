import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation dialog.
 * On web, React Native's Alert is a silent no-op — use window.confirm instead.
 * Resolves true when the user confirms, false otherwise.
 */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmText = "OK", cancelText = "Cancel", destructive } = opts;

  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : false;
    return Promise.resolve(ok);
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: "cancel", onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
