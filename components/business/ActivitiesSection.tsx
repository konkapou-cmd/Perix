import { Image, Pressable, StyleSheet, Text, View } from "react-native";
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
      />

      {activities.length === 0 ? (
        <EmptyState icon="people" message={t("userProfile.noActivities")} subMessage={!readOnly ? t("userProfile.addFirstActivity") : undefined} />
      ) : (
        <View style={s.grid}>
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
                      <FocalImage uri={activity.cover_image_url} aspectRatio={16 / 9} focalPoint={activity.cover_focal_point} borderRadius={0} showLoader={false} />
                    ) : hasVideo ? (
                      <AdaptiveVideo uri={activity.video_url || ""} autoPlay style={{ width: "100%", aspectRatio: 16 / 9 }} isLooping initialMuted />
                    ) : imageUrl ? (
                      <FocalImage uri={imageUrl} aspectRatio={16 / 9} focalPoint={activity.cover_focal_point} borderRadius={0} showLoader={false} />
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
                  <View style={s.info}>
                    <Text style={[s.title, { color: textColor }]} numberOfLines={1}>
                      {activity.title}
                    </Text>
                    <View style={s.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color={secondaryColor} />
                      <Text style={[s.metaText, { color: secondaryColor }]}>
                        {formatDate(activity.date)}{activity.time ? ` · ${activity.time}` : ""}
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
                    <StatusBadge
                      label={activity.is_creator ? t("activities.hosting", "Gastgeber") : activity.my_status || t("activities.joined", "Dabei")}
                      variant="default"
                      size="sm"
                    />
                  </View>
                </Pressable>
                {activity.is_creator && !readOnly && (
                  <View style={s.actions}>
                    <Pressable style={s.actionBtn} onPress={() => onEditActivity(activity)}>
                      <Ionicons name="create-outline" size={18} color={primaryColor} />
                    </Pressable>
                    <Pressable style={s.actionBtn} onPress={() => onDeleteActivity(activity.activity_id)}>
                       <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
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
  grid: {
    gap: SPACING.small,
  },
  card: {
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  cardContent: {
    flex: 1,
  },
  cardMedia: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderTopLeftRadius: BORDER_RADIUS.card,
    borderTopRightRadius: BORDER_RADIUS.card,
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
    top: SPACING.small,
    right: SPACING.small,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
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
  info: {
    padding: 10,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
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
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.tiny,
  },
  statusText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.small,
    gap: SPACING.small,
    paddingBottom: SPACING.small,
  },
  actionBtn: {
    padding: SPACING.tiny,
  },
});
