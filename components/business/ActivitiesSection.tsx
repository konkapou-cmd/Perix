import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { ActivityItem, ACTIVITY_TYPES } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { formatDate } from "../../lib/formatDate";
import { EmptyState } from "../shared";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";
import StatusBadge from "../ui/StatusBadge";
import { SectionHeader } from "../shared/SectionHeader";

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

const DEFAULT_ACTIVITY_THEME = { emoji: "✨", label: "Activity", shortLabel: "Activity", color: "#6B7280", gradient: ["#6B7280", "#4B5563"] };

function getThemeInfo(slug: string | null | undefined) {
  if (!slug) return DEFAULT_ACTIVITY_THEME;
  const theme = (ACTIVITY_TYPES as unknown as Record<string, any>)[slug];
  if (theme) return { emoji: theme.emoji, label: theme.label, color: theme.color, gradient: theme.gradient };
  return DEFAULT_ACTIVITY_THEME;
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
      <SectionHeader
        icon="people"
        title={t("userProfile.activities", "Aktivitäten")}
        accent={primaryColor}
        onSeeAll={!readOnly ? onAddActivity : undefined}
        seeAllLabel={t("activities.createActivity", "Aktivität erstellen")}
        style={{ paddingHorizontal: SPACING.std }}
      />

      {activities.length === 0 ? (
        <EmptyState icon="people" message={t("userProfile.noActivities")} subMessage={!readOnly ? t("userProfile.addFirstActivity") : undefined} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel}>
          {activities.map((activity) => {
            const theme = getThemeInfo(activity.theme);
            const imageUrl = activity.cover_image_url || activity.gallery_images?.[0] || activity.image_urls?.[0];
            const hasVideo = !!activity.video_url;

            return (
              <View key={activity.activity_id} style={[s.card, { backgroundColor: cardColor }]}>
                <Pressable
                  style={s.cardContent}
                  onPress={() => router.push(`/activity/${activity.activity_id}`)}
                >
                  <View style={s.cardMedia}>
                    {activity.cover_image_url ? (
                      <FocalImage uri={activity.cover_image_url} aspectRatio={16 / 9} focalPoint={(activity as any).cover_focal_point} borderRadius={0} showLoader={false} style={StyleSheet.absoluteFill as any} />
                    ) : hasVideo ? (
                      <AdaptiveVideo uri={activity.video_url || ""} autoPlay style={{ width: "100%", height: "100%" }} isLooping initialMuted />
                    ) : imageUrl ? (
                      <FocalImage uri={imageUrl} aspectRatio={16 / 9} focalPoint={(activity as any).cover_focal_point} borderRadius={0} showLoader={false} style={StyleSheet.absoluteFill as any} />
                    ) : (
                      <View style={[s.imagePlaceholder, { backgroundColor: `${theme.color}30` }]}>
                        <Text style={s.themeEmoji}>{theme.emoji}</Text>
                      </View>
                    )}
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.75)"]}
                      locations={[0.45, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={s.badgesWrap}>
                      {activity.is_private && (
                        <View style={s.privateBadge}>
                          <Ionicons name="lock-closed" size={12} color="#fff" />
                        </View>
                      )}
                      <StatusBadge
                        label={theme.label}
                        color={theme.color}
                        size="sm"
                      />
                      {(activity.my_status === "accepted" || activity.my_status === "going") && (
                        <StatusBadge
                          label={t("activities.going", "Dabei")}
                          variant="active"
                          size="sm"
                        />
                      )}
                      {activity.is_creator && activity.my_status !== "accepted" && activity.my_status !== "going" && (
                        <StatusBadge
                          label={t("activities.yours", "Deins")}
                          variant="owner"
                          size="sm"
                        />
                      )}
                    </View>
                  </View>
                  <View style={s.info}>
                    <Text style={s.title} numberOfLines={1}>
                      {activity.title}
                    </Text>
                    <View style={s.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.85)" />
                      <Text style={s.metaText}>
                        {formatDate(activity.date)}{activity.time ? ` · ${activity.time}` : ""}
                      </Text>
                    </View>
                    {activity.location && (
                      <View style={s.metaRow}>
                        <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
                        <Text style={s.metaText} numberOfLines={1}>
                          {activity.location}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
                {activity.is_creator && !readOnly && (
                  <View style={s.actions}>
                    <Pressable style={s.actionBtn} onPress={() => onEditActivity(activity)}>
                      <Ionicons name="create-outline" size={16} color="#fff" />
                    </Pressable>
                    <Pressable style={s.actionBtn} onPress={() => onDeleteActivity(activity.activity_id)}>
                       <Ionicons name="trash-outline" size={16} color="#fff" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingTop: SPACING.small,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.small,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.small,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
    fontSize: FONT_SIZES.bodySmall,
  },
  carousel: {
    gap: SPACING.small,
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.small,
  },
  card: {
    width: 200,
    height: 240,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  cardContent: {
    flex: 1,
  },
  cardMedia: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
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
  badgesWrap: {
    position: "absolute",
    top: SPACING.small,
    left: SPACING.small,
    gap: 4,
    alignItems: "flex-start",
    zIndex: 5,
  },
  privateBadge: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
  },
  info: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
    flexShrink: 1,
    marginBottom: SPACING.tiny,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.tiny,
    marginBottom: 2,
  },
  metaText: {
    fontSize: FONT_SIZES.small,
    color: "rgba(255,255,255,0.85)",
    flexShrink: 1,
  },
  actions: {
    position: "absolute",
    top: SPACING.small,
    right: SPACING.small,
    flexDirection: "row",
    gap: SPACING.small,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  goingBadge: {
    position: "absolute",
    bottom: SPACING.small,
    left: SPACING.small,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.small,
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
    bottom: SPACING.small,
    left: SPACING.small,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.small,
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
    top: SPACING.small,
    left: SPACING.small,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
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
});
