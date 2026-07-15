import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import { ThemeStyles } from "../../hooks/useThemeStyles";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { getTodayHours, getDayPeriods, GERMAN_DAYS, DAY_KEYS, getTodayStatus, getPeriodsSummary, type OpeningHours } from "./hoursUtils";

type AboutDataType = {
  type: "user" | "business" | "artist";
  bio?: string | null;
  location?: string | null;
  category?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  socialLinks?: Record<string, string>;
  openingHours?: Record<string, { open: string; close: string }>;
  isOpen?: boolean;
};

type Props = {
  data: AboutDataType;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  borderColor?: string;
  readOnly?: boolean;
  onEditHours?: () => void;
  onEditProfile?: () => void;
  themeStyles?: ThemeStyles;
};

const dayNames: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

const socialIcons: Record<string, string> = {
  instagram: "logo-instagram",
  twitter: "logo-twitter",
  facebook: "logo-facebook",
  youtube: "logo-youtube",
  tiktok: "logo-tiktok",
  linkedin: "logo-linkedin",
  spotify: "logo-spotify",
  website: "globe-outline",
};

function formatTime(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m || "00"} ${ampm}`;
}

export const ProfileAboutInline: React.FC<Props> = ({
  data,
  primaryColor = PROFILE_COLORS.PRIMARY,
  cardColor = PROFILE_COLORS.CARD,
  textColor = PROFILE_COLORS.TEXT,
  borderColor = PROFILE_COLORS.BORDER,
  readOnly = false,
  onEditHours,
  onEditProfile,
  themeStyles,
}) => {
  const { t } = useTranslation();
  const [hoursExpanded, setHoursExpanded] = useState(false);

  const hasBio = !!data.bio;
  const hasLocation = !!data.location;
  const hasHours = data.type === "business" && data.openingHours && Object.keys(data.openingHours).length > 0;
  const hasContact = !!(data.website || data.email || data.phone);
  const hasSocials = !!(data.socialLinks && Object.keys(data.socialLinks).length > 0);
  const hasAnyInfo = hasBio || hasHours || hasContact || hasSocials || hasLocation;

  if (!hasAnyInfo) return null;

  return (
    <View style={s.container}>
      {hasBio && (
        <Text style={[s.bio, { color: textColor }, themeStyles]} numberOfLines={3}>
          {data.bio}
        </Text>
      )}

      {hasHours && (() => {
        const todayPeriods = getTodayHours(data.openingHours as OpeningHours || {});
        const { label, detail } = getTodayStatus(data.isOpen ?? false, todayPeriods);
        return (
        <Pressable style={[s.hoursCard, { backgroundColor: cardColor, borderColor }]} onPress={() => setHoursExpanded(e => !e)}>
          <View style={s.hoursHeader}>
            <View style={s.hoursBadgeRow}>
              <View style={[s.openBadge, { backgroundColor: data.isOpen ? COLORS.success : COLORS.danger }]}>
                <Text style={s.openBadgeText}>{label}</Text>
              </View>
              {detail && (
                <Text style={[s.hoursToday, { color: textColor }]}>{detail}</Text>
              )}
            </View>
            <Ionicons name={hoursExpanded ? "chevron-up" : "chevron-down"} size={18} color={PROFILE_COLORS.TEXT_SECONDARY} />
          </View>
          {hoursExpanded && (
            <View style={s.hoursExpanded}>
              {DAY_KEYS.map((day) => {
                const periods = getDayPeriods(data.openingHours?.[day] as any);
                return (
                <View key={day} style={s.hoursRow}>
                  <Text style={[s.hoursDay, { color: textColor }]}>{GERMAN_DAYS[day] || day}</Text>
                  <Text style={[s.hoursTime, { color: PROFILE_COLORS.TEXT_SECONDARY }]}>
                    {getPeriodsSummary(periods)}
                  </Text>
                </View>
              );
              })}
              {!readOnly && onEditHours && (
                <Pressable style={s.hoursEditBtn} onPress={onEditHours}>
                  <Ionicons name="create-outline" size={14} color={primaryColor} />
                  <Text style={[s.hoursEditText, { color: primaryColor }]}>{t("common.edit", "Edit")}</Text>
                </Pressable>
              )}
            </View>
          )}
        </Pressable>
        ); })()}

      {hasContact && (
        <View style={s.contactRow}>
          {data.website && (
            <Pressable style={[s.contactIcon, { backgroundColor: cardColor, borderColor }]} onPress={() => { try { require("react-native").Linking.openURL(data.website!); } catch {} }}>
              <Ionicons name="globe-outline" size={18} color={primaryColor} />
            </Pressable>
          )}
          {data.email && (
            <Pressable style={[s.contactIcon, { backgroundColor: cardColor, borderColor }]} onPress={() => { try { require("react-native").Linking.openURL(`mailto:${data.email}`); } catch {} }}>
              <Ionicons name="mail-outline" size={18} color={primaryColor} />
            </Pressable>
          )}
          {data.phone && (
            <Pressable style={[s.contactIcon, { backgroundColor: cardColor, borderColor }]} onPress={() => { try { require("react-native").Linking.openURL(`tel:${data.phone}`); } catch {} }}>
              <Ionicons name="call-outline" size={18} color={primaryColor} />
            </Pressable>
          )}
          {hasSocials && Object.entries(data.socialLinks || {}).slice(0, 3).map(([platform, url]) => (
            <Pressable key={platform} style={[s.contactIcon, { backgroundColor: cardColor, borderColor }]} onPress={() => { try { require("react-native").Linking.openURL(url); } catch {} }}>
              <Ionicons name={(socialIcons[platform] || "link") as any} size={18} color={primaryColor} />
            </Pressable>
          ))}
        </View>
      )}

      {!readOnly && onEditProfile && !hasBio && !hasLocation && (
        <Pressable style={[s.editBtn, { backgroundColor: primaryColor }]} onPress={onEditProfile}>
          <Ionicons name="create-outline" size={14} color="#fff" />
          <Text style={s.editBtnText}>{t("profile.addBio", "Add bio")}</Text>
        </Pressable>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    paddingHorizontal: PROFILE.HORIZONTAL_PADDING,
    marginTop: SPACING.small,
  },
  bio: {
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
    marginTop: SPACING.tiny,
  },
  hoursCard: {
    marginTop: SPACING.small,
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
  },
  hoursHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hoursBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    flex: 1,
  },
  openBadge: {
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  openBadgeText: {
    color: "#fff",
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  hoursToday: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  hoursExpanded: {
    marginTop: SPACING.small,
    gap: SPACING.tiny,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.tiny,
  },
  hoursDay: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  hoursTime: {
    fontSize: FONT_SIZES.small,
  },
  hoursEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.tiny,
    marginTop: SPACING.small,
    alignSelf: "flex-end",
  },
  hoursEditText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  contactRow: {
    flexDirection: "row",
    gap: SPACING.small,
    marginTop: SPACING.small,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.tiny,
    paddingHorizontal: SPACING.compact,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.small,
    alignSelf: "flex-start",
  },
  editBtnText: {
    color: "#fff",
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
});
