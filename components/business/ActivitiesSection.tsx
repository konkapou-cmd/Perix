import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ActivityItem, ACTIVITY_THEMES } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

type Props = {
  activities: ActivityItem[];
  onAddActivity: () => void;
  onEditActivity: (activity: ActivityItem) => void;
  onDeleteActivity: (activityId: string) => void;
  readOnly?: boolean;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  secondaryColor?: string;
};

const DEFAULT_ACTIVITY_THEME = { emoji: "🎉", label: "Activity", color: "#FF6B6B", gradient: ["#FF6B6B", "#7c3aed"] as [string, string] };

function getThemeInfo(slug: string | null | undefined) {
  if (!slug) return DEFAULT_ACTIVITY_THEME;
  const theme = (ACTIVITY_THEMES as unknown as Record<string, typeof DEFAULT_ACTIVITY_THEME>)[slug];
  if (theme) return { emoji: theme.emoji, label: theme.label, color: theme.color, gradient: theme.gradient };
  return DEFAULT_ACTIVITY_THEME;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function ActivitiesSection({
  activities,
  onAddActivity,
  onEditActivity,
  onDeleteActivity,
  readOnly = false,
  primaryColor = COLORS.primary,
  cardColor = "#fff",
  textColor = COLORS.textPrimary,
  secondaryColor = COLORS.textSecondary,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={s.container}>
      <View style={s.sectionHeader}>
        <Text style={[s.cardTitle, { color: textColor }]}>{t("userProfile.activities", "Activities")}</Text>
        {!readOnly && (
          <Pressable style={[s.addButton, { backgroundColor: primaryColor }]} onPress={onAddActivity}>
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.addButtonText}>{t("activities.createActivity")}</Text>
          </Pressable>
        )}
      </View>

      {activities.length === 0 ? (
        <View style={s.emptyState}>
          <View style={[s.emptyIcon, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="people" size={32} color={primaryColor} />
          </View>
          <Text style={[s.emptyTitle, { color: textColor }]}>{t("profile.noActivitiesYet", "No Activities Yet")}</Text>
          <Text style={[s.emptySubtitle, { color: secondaryColor }]}>
            {t("profile.activitiesWillAppear", "Activities you create or join will appear here")}
          </Text>
        </View>
      ) : (
        <View style={s.grid}>
          {activities.map((activity) => {
            const theme = getThemeInfo(activity.theme);
            const imageUrl = activity.gallery_images?.[0] || activity.cover_image_url || activity.image_urls?.[0];

            return (
              <View key={activity.activity_id} style={[s.card, { backgroundColor: cardColor }]}>
                <Pressable
                  style={s.cardContent}
                  onPress={() => router.push(`/activity/${activity.activity_id}`)}
                >
                  <View style={s.imageContainer}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={s.image} resizeMode="cover" />
                    ) : (
                      <View style={[s.imagePlaceholder, { backgroundColor: `${theme.color}30` }]}>
                        <Text style={s.themeEmoji}>{theme.emoji}</Text>
                      </View>
                    )}
                    {activity.is_private && (
                      <View style={s.privateBadge}>
                        <Ionicons name="lock-closed" size={12} color="#fff" />
                      </View>
                    )}
                    <View style={[s.themeBadge, { backgroundColor: theme.color }]}>
                      <Text style={s.themeBadgeEmoji}>{theme.emoji}</Text>
                      <Text style={s.themeBadgeLabel}>{theme.label}</Text>
                    </View>
                    {(activity.my_status === "accepted" || activity.my_status === "going") && (
                      <View style={s.goingBadge}>
                        <Ionicons name="checkmark-circle" size={10} color="#fff" />
                        <Text style={s.goingText}>{t("activities.going", "Going")}</Text>
                      </View>
                    )}
                    {activity.is_creator && activity.my_status !== "accepted" && activity.my_status !== "going" && (
                      <View style={s.ownerBadge}>
                        <Ionicons name="star" size={10} color="#fff" />
                        <Text style={s.ownerText}>{t("activities.yours", "Yours")}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.info}>
                    <Text style={[s.title, { color: textColor }]} numberOfLines={1}>
                      {activity.title}
                    </Text>
                    <View style={s.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color={secondaryColor} />
                      <Text style={[s.metaText, { color: secondaryColor }]}>
                        {activity.date}{activity.time ? ` · ${activity.time}` : ""}
                      </Text>
                    </View>
                    {activity.location && (
                      <View style={s.metaRow}>
                        <Ionicons name="location-outline" size={12} color={secondaryColor} />
                        <Text style={[s.metaText, { color: secondaryColor }]} numberOfLines={1}>
                          {activity.location}
                        </Text>
                      </View>
                    )}
                    <View style={[s.statusBadge, { backgroundColor: `${primaryColor}20` }]}>
                      <Text style={[s.statusText, { color: primaryColor }]}>
                        {activity.is_creator ? t("activities.hosting", "Hosting") : activity.my_status || t("activities.joined", "Joined")}
                      </Text>
                    </View>
                  </View>
                </Pressable>
                {activity.is_creator && !readOnly && (
                  <View style={s.actions}>
                    <Pressable style={s.actionBtn} onPress={() => onEditActivity(activity)}>
                      <Ionicons name="create-outline" size={18} color={primaryColor} />
                    </Pressable>
                    <Pressable style={s.actionBtn} onPress={() => onDeleteActivity(activity.activity_id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
    fontSize: FONT_SIZES.bodySmall,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.huge,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.bodySmall,
    textAlign: "center",
    lineHeight: 20,
  },
  grid: {
    gap: SPACING.md,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
  },
  imageContainer: {
    position: "relative",
    height: 140,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  themeEmoji: {
    fontSize: 36,
  },
  privateBadge: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  goingBadge: {
    position: "absolute",
    bottom: SPACING.sm,
    left: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#10b981",
  },
  goingText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  ownerBadge: {
    position: "absolute",
    bottom: SPACING.sm,
    left: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#f59e0b",
  },
  ownerText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  themeBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  themeBadgeEmoji: {
    fontSize: FONT_SIZES.micro,
  },
  themeBadgeLabel: {
    color: "#fff",
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  info: {
    padding: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: 2,
  },
  metaText: {
    fontSize: FONT_SIZES.small,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
  },
  statusText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  actionBtn: {
    padding: SPACING.xs,
  },
});