import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";
import AdaptiveImage from "../AdaptiveImage";

interface PostHeaderProps {
  actorName: string;
  actorAvatar?: string | null;
  formattedDate: string;
  onAuthorPress?: () => void;
  editSlot?: React.ReactNode;
}

export default function PostHeader({ actorName, actorAvatar, formattedDate, onAuthorPress, editSlot }: PostHeaderProps) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onAuthorPress}>
        {actorAvatar ? (
          <AdaptiveImage uri={actorAvatar} borderRadius={22} ratio={1} maxHeight={44} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{actorName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.info}>
        <Text style={styles.name}>{actorName}</Text>
        <Text style={styles.time}>{formattedDate}</Text>
      </View>
      {editSlot && <View style={styles.editSlot}>{editSlot}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryTint,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: Platform.OS === "web" ? 18 : 16,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  time: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    color: COLORS.textGray,
  },
  editSlot: {
    flexDirection: "row",
    gap: 8,
  },
});
