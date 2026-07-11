import React, { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityItem } from "../../lib/api";
import { ACTIVITY_TYPES } from "../../lib/api/core";

function getThemeEmoji(theme?: string | null): string {
  if (!theme) return "✨";
  const themeData = (ACTIVITY_TYPES as Record<string, any>)[theme];
  return themeData?.emoji || "✨";
}

function getThemeColor(theme?: string | null): string {
  if (!theme) return "#6B7280";
  const themeData = (ACTIVITY_TYPES as Record<string, any>)[theme];
  return themeData?.color || "#6B7280";
}

const CARD_WIDTH = 220;
const CARD_HEIGHT = 260;
const SNAP_INTERVAL = CARD_WIDTH + 12;

function getThemeEmoji(theme?: string | null): string {
  if (!theme) return "✨";
  const themeData = (ACTIVITY_TYPES as Record<string, any>)[theme];
  return themeData?.emoji || "✨";
}

function getThemeColor(theme?: string | null): string {
  if (!theme) return "#6B7280";
  const themeData = (ACTIVITY_TYPES as Record<string, any>)[theme];
  return themeData?.color || "#6B7280";
}

function getThemeLabel(theme?: string | null): string {
  if (!theme) return "Activity";
  const themeData = (ACTIVITY_TYPES as Record<string, any>)[theme];
  return themeData?.label || (EVENT_THEMES as Record<string, any>)?.[theme]?.label || theme;
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  try {
    const parts = timeStr.split(":");
    const h = parseInt(parts[0], 10);
    const m = parts[1] || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m} ${ampm}`;
  } catch {
    return timeStr;
  }
}

function getAttendeeCount(activity: ActivityItem): number {
  return activity.invites?.filter(i => i.status === "accepted" || i.status === "going").length || 0;
}

export function ActivitiesCarousel({ activities, savedActivityIds, filter, onFilterChange, onCalendarOpen, mapRefreshKey }: ActivitiesCarouselProps) {
  const router = useRouter();

  const sortedActivities = useMemo(() => {
    let filtered = activities;
    if (filter === "attending") {
      filtered = filtered.filter(a => a.my_status === "accepted" || a.my_status === "going");
    } else if (filter === "mine") {
      filtered = filtered.filter(a => a.is_creator);
    }
    return [...filtered].sort((a, b) => {
      const aDate = a.date || "";
      const bDate = b.date || "";
      return aDate.localeCompare(bDate);
    });
  }, [activities, filter]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="people" size={18} color="#ffffff" />
          </View>
          <Text style={styles.title}>Activities</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.calendarButton} onPress={onCalendarOpen}>
            <Ionicons name="calendar-outline" size={16} color="#ffffff" />
          </Pressable>
          <Pressable style={styles.seeAllButton} onPress={() => router.navigate({ pathname: "/(tabs)/locator" as any, params: { tab: "activities" } })}>
            <Text style={styles.seeAllText}>See All</Text>
            <Ionicons name="chevron-forward" size={14} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        {[
          { key: "all" as const, label: "All" },
          { key: "attending" as const, label: "Going" },
          { key: "mine" as const, label: "Mine" },
        ].map(opt => (
          <Pressable
            key={opt.key}
            style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}
            onPress={() => onFilterChange(opt.key)}
          >
            <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
      >
        {sortedActivities.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>No activities yet</Text>
            <Pressable style={styles.createButton} onPress={() => router.push("/create")}>
              <Ionicons name="add-circle" size={16} color="#ffffff" />
              <Text style={styles.createButtonText}>Create Activity</Text>
            </Pressable>
          </View>
        ) : (
          sortedActivities.map((activity) => {
            const themeColor = getThemeColor(activity.theme);
            const isGoing = activity.my_status === "accepted" || activity.my_status === "going";
            const attendeeCount = getAttendeeCount(activity);
            const coverImage = activity.cover_image_url || activity.image_urls?.[0] || activity.gallery_images?.[0];

            return (
              <Pressable
                key={`${activity.activity_id}-${mapRefreshKey}`}
                style={styles.card}
                onPress={() => router.push(`/activity/${activity.activity_id}`)}
              >
                <View style={styles.cardInner}>
                  {coverImage ? (
                    <>
                      <Image source={{ uri: coverImage }} style={styles.coverImage} resizeMode="cover" />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.85)"]}
                        style={styles.gradient}
                      />
                    </>
                  ) : (
                    <View style={[styles.placeholder, { backgroundColor: themeColor + "20" }]}>
                      <Text style={styles.placeholderEmoji}>{getThemeEmoji(activity.theme)}</Text>
                    </View>
                  )}

                  <View style={styles.badgeRow}>
                    <View style={[styles.themeBadge, { backgroundColor: themeColor }]}>
                      <Text style={styles.themeEmoji}>{getThemeEmoji(activity.theme)}</Text>
                    </View>
                    {activity.is_private && (
                      <View style={styles.privateBadge}>
                        <Ionicons name="lock-closed" size={10} color="#ffffff" />
                      </View>
                    )}
                  </View>

                  {isGoing && (
                    <View style={styles.goingBadge}>
                      <Ionicons name="checkmark-circle" size={10} color="#ffffff" />
                      <Text style={styles.goingText}>Going</Text>
                    </View>
                  )}

                  {activity.is_creator && !isGoing && (
                    <View style={styles.ownerBadge}>
                      <Ionicons name="star" size={10} color="#ffffff" />
                      <Text style={styles.ownerText}>Yours</Text>
                    </View>
                  )}

                  {savedActivityIds.has(activity.activity_id) && (
                    <View style={styles.savedBadge}>
                      <Ionicons name="bookmark" size={10} color={COLORS.gold} />
                    </View>
                  )}

                  <View style={styles.cardContent}>
                    <Text style={styles.activityTitle} numberOfLines={2}>{activity.title}</Text>
                    <Text style={styles.activityTypeLabel} numberOfLines={1}>{getThemeLabel(activity.theme)}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                      <Text style={styles.metaText}>{formatDate(activity.date)}</Text>
                      {activity.time && (
                        <>
                          <Ionicons name="time-outline" size={12} color="#9ca3af" style={styles.metaIconSpacing} />
                          <Text style={styles.metaText}>{formatTime(activity.time)}</Text>
                        </>
                      )}
                    </View>
                    {activity.location && (
                      <View style={styles.metaRow}>
                        <Ionicons name="location-outline" size={12} color="#9ca3af" />
                        <Text style={[styles.metaText, styles.metaTextLocation]} numberOfLines={1}>{activity.location}</Text>
                      </View>
                    )}
                    <View style={styles.footer}>
                      <View style={styles.creatorRow}>
                        {activity.creator?.profile_photo ? (
                          <Image source={{ uri: activity.creator.profile_photo }} style={styles.creatorAvatar} />
                        ) : (
                          <View style={styles.creatorAvatarFallback}>
                            <Text style={styles.creatorAvatarText}>
                              {(activity.creator?.name || "U").charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.creatorName} numberOfLines={1}>{activity.creator?.name || "Host"}</Text>
                      </View>
                      {attendeeCount > 0 && (
                        <View style={styles.attendeePill}>
                          <Ionicons name="people" size={10} color="#6b7280" />
                          <Text style={styles.attendeeText}>{attendeeCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    marginBottom: 10,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calendarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: COLORS.surfaceSoft,
  },
  filterChipActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
  },
  filterChipTextActive: {
    color: "#ffffff",
  },
  scrollContent: {
    paddingRight: 12,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceSoft,
  },
  cardInner: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: "relative",
  },
  coverImage: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: "absolute",
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT * 0.7,
  },
  placeholder: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderEmoji: {
    fontSize: 48,
  },
  badgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  themeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  themeEmoji: {
    fontSize: 14,
  },
  privateBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  goingBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#10b981",
  },
  goingText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
  },
  ownerBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#f59e0b",
  },
  ownerText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
  },
  savedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 2,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  activityTypeLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  metaIconSpacing: {
    marginLeft: 6,
  },
  metaText: {
    fontSize: 11,
    color: "#e5e7eb",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaTextLocation: {
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  creatorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  creatorAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  creatorAvatarText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#ffffff",
  },
  creatorName: {
    fontSize: 10,
    color: "#e5e7eb",
    flex: 1,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  attendeePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  attendeeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#e5e7eb",
  },
  emptyState: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  createButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
  },
});
