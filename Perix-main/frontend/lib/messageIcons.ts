import type { ImageSourcePropType } from "react-native";

/**
 * Handcrafted wooden icons for the messages section, cut with alpha mask
 * from "Distressed Wood Chat and Inbox Icons.png" (chat bubble + inbox tray).
 */
export const MESSAGE_ILLUSTRATIONS: Record<string, ImageSourcePropType> = {
  chat: require("../assets/icons/messages/chat.webp"),
  inbox: require("../assets/icons/messages/inbox.webp"),
};
