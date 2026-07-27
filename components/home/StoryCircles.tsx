import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GroupedStory, User } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { useTranslation } from "react-i18next";

interface StoryCirclesProps {
  user: User | null;
  storyGroups: GroupedStory[];
  onYourStoryPress: () => void;
  onStoryPress: (index: number) => void;
  activeIdentity?: {
    type: "user" | "business" | "artist";
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
}

export function StoryCircles({ user, storyGroups, onYourStoryPress, onStoryPress, activeIdentity }: StoryCirclesProps) {
  const { t } = useTranslation();

  if (!user) return null;

  const ownAvatar = activeIdentity?.avatar || user?.profile_photo || user?.picture;
  const ownName = activeIdentity?.name || user?.name || "U";

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Pressable style={styles.item} onPress={onYourStoryPress}>
          <View style={styles.ringOwn}>
            <View style={styles.avatarWrap}>
              {ownAvatar ? (
                <Image source={{ uri: ownAvatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{ownName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.plus}>
                <Ionicons name="add" size={10} color={COLORS.textLight} />
              </View>
            </View>
          </View>
          <Text style={styles.name} numberOfLines={1}>{t("stories.yourStory") || "Your Story"}</Text>
        </Pressable>

        {storyGroups.map((group, idx) => (
          <Pressable
            key={group.actor_id}
            style={styles.item}
            onPress={() => onStoryPress(idx)}
          >
            <View style={[styles.ring, { borderColor: group.has_unseen ? COLORS.primaryDark : COLORS.textMuted }]}>
              <View style={styles.avatarWrap}>
                {group.author_avatar ? (
                  <Image source={{ uri: group.author_avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarText}>{(group.author_name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.name} numberOfLines={1}>{group.author_name || "User"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingLeft: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  item: {
    alignItems: "center",
    marginRight: 14,
    width: 68,
  },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringOwn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: COLORS.primaryDark,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  plus: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.info,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  name: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
});
