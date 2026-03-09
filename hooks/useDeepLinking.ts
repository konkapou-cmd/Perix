import { useEffect } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import * as ExpoLinking from "expo-linking";

/**
 * Hook to handle deep links and universal links.
 * 
 * Supported URL patterns:
 * - perix://user/{id}
 * - perix://event/{id}
 * - perix://activity/{id}
 * - perix://artist/{id}
 * - perix://business/{id}
 * - perix://post/{id}
 * - https://perixapp.com/user/{id}
 * - https://app.perixapp.com/event/{id}
 * - etc.
 */
export function useDeepLinking() {
  const router = useRouter();

  useEffect(() => {
    // Handle initial URL (app opened via link)
    const handleInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          handleDeepLink(initialUrl);
        }
      } catch (error) {
        console.error("Error getting initial URL:", error);
      }
    };

    handleInitialURL();

    // Handle URL while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      const parsed = ExpoLinking.parse(url);
      const path = parsed.path;
      
      if (!path) {
        // No path, go to home
        router.replace("/(tabs)/home");
        return;
      }

      // Parse the path segments
      const segments = path.split("/").filter(Boolean);
      
      if (segments.length < 2) {
        // Invalid path
        router.replace("/(tabs)/home");
        return;
      }

      const [type, id] = segments;

      switch (type) {
        case "user":
          router.push(`/user/${id}`);
          break;
        case "event":
          router.push(`/event/${id}`);
          break;
        case "activity":
          router.push(`/activity/${id}`);
          break;
        case "artist":
          router.push(`/artist/${id}`);
          break;
        case "business":
          router.push(`/business/${id}`);
          break;
        case "post":
          router.push(`/post/${id}`);
          break;
        case "friend-requests":
          router.push("/friend-requests");
          break;
        case "onboarding":
          router.push("/onboarding");
          break;
        default:
          // Unknown route, go to home
          router.replace("/(tabs)/home");
      }
    } catch (error) {
      console.error("Error handling deep link:", error);
      router.replace("/(tabs)/home");
    }
  };

  return { handleDeepLink };
}

/**
 * Generate a shareable deep link URL for content.
 */
export function generateDeepLink(
  type: "user" | "event" | "activity" | "artist" | "business" | "post",
  id: string
): string {
  return `perix://${type}/${id}`;
}

/**
 * Generate a shareable web URL for content.
 */
export function generateWebLink(
  type: "user" | "event" | "activity" | "artist" | "business" | "post",
  id: string,
  baseUrl: string = "https://app.perixapp.com"
): string {
  return `${baseUrl}/${type}/${id}`;
}

/**
 * Check if app can handle a specific URL scheme.
 */
export async function canHandleURL(url: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

/**
 * Open a URL, with fallback to web browser.
 */
export async function openURL(url: string): Promise<void> {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      // Convert deep link to web URL if can't open
      if (url.startsWith("perix://")) {
        const webUrl = url.replace("perix://", "https://app.perixapp.com/");
        await Linking.openURL(webUrl);
      }
    }
  } catch (error) {
    console.error("Error opening URL:", error);
  }
}
