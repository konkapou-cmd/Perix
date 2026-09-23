import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

interface PostActionsProps {
  liked: boolean;
  likesCount: number;
  commentsCount: number;
  isSaved: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
}

export default function PostActions({ liked, likesCount, commentsCount, isSaved, onLike, onComment, onShare, onSave }: PostActionsProps) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.item} onPress={onLike}>
        <Ionicons
          name={liked ? "heart" : "heart-outline"}
          size={18}
          color={liked ? COLORS.error : COLORS.textMuted}
        />
        <Text style={[styles.count, liked && { color: COLORS.error }]}>
          {likesCount || 0}
        </Text>
      </Pressable>

      <Pressable style={styles.item} onPress={onComment}>
        <Ionicons name="chatbubble-outline" size={18} color={COLORS.textMuted} />
        <Text style={styles.count}>{commentsCount || 0}</Text>
      </Pressable>

      <Pressable style={styles.item} onPress={onShare}>
        <Ionicons name="share-outline" size={18} color={COLORS.textMuted} />
      </Pressable>

      <Pressable style={styles.item} onPress={onSave}>
        <Ionicons
          name={isSaved ? "bookmark" : "bookmark-outline"}
          size={18}
          color={isSaved ? COLORS.gold : COLORS.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  count: {
    fontSize: Platform.OS === "web" ? 14 : 13,
    color: COLORS.textGray,
  },
});
