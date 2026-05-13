import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import { ThemeStyles } from "../../hooks/useThemeStyles";

export interface ProfileAboutData {
  type: "user" | "business" | "artist";
  bio?: string | null;
  location?: string | null;
  town?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  socialLinks?: Record<string, string>;
  openingHours?: Record<string, { open: string; close: string }>;
  genres?: string[];
  category?: string;
  isOpen?: boolean;
}

interface ProfileAboutProps {
  data: ProfileAboutData;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  readOnly?: boolean;
  onEdit?: () => void;
  onOpenHours?: () => void;
  onOpenLocation?: () => void;
  themeStyles?: ThemeStyles;
}

const formatHours = (hours: Record<string, { open: string; close: string }>) => {
  const today = new Date().toLocaleDateString("en", { weekday: "short" }).toLowerCase();
  const todayHours = hours[today];
  if (!todayHours) return null;
  return `${todayHours.open} – ${todayHours.close}`;
};

const AboutSection: React.FC<{
  title: string;
  icon: string;
  children: React.ReactNode;
  cardColor?: string;
  textColor?: string;
  primaryColor?: string;
  themeStyles?: ThemeStyles;
}> = ({ title, icon, children, cardColor, textColor, primaryColor, themeStyles }) => (
  <View style={[styles.section, { backgroundColor: cardColor }]}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color={primaryColor} />
      <Text style={[styles.sectionTitle, { color: textColor }, themeStyles as any]}>{title}</Text>
    </View>
    {children}
  </View>
);

const InfoRow: React.FC<{
  icon: string;
  label: string;
  value: string;
  onPress?: () => void;
  textColor?: string;
  themeStyles?: ThemeStyles;
}> = ({ icon, label, value, onPress, textColor, themeStyles }) => (
  <Pressable
    style={styles.infoRow}
    onPress={onPress}
    disabled={!onPress}
  >
    <Ionicons name={icon as any} size={18} color={PROFILE_COLORS.TEXT_SECONDARY} />
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color: textColor }, themeStyles as any]} numberOfLines={2}>
        {value}
      </Text>
    </View>
    {onPress && (
      <Ionicons name="chevron-forward" size={16} color={PROFILE_COLORS.TEXT_SECONDARY} />
    )}
  </Pressable>
);

export const ProfileAbout: React.FC<ProfileAboutProps> = ({
  data,
  primaryColor = PROFILE_COLORS.PRIMARY,
  cardColor = PROFILE_COLORS.CARD,
  textColor = PROFILE_COLORS.TEXT,
  readOnly = false,
  onEdit,
  onOpenHours,
  onOpenLocation,
  themeStyles,
}) => {
  const { t } = useTranslation();

  const handleOpenUrl = async (url: string) => {
    let finalUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      finalUrl = "https://" + url;
    }
    try {
      const canOpen = await Linking.canOpenURL(finalUrl);
      if (canOpen) {
        await Linking.openURL(finalUrl);
      } else {
        Alert.alert(t("common.error"), "Cannot open this link");
      }
    } catch (e) { console.warn("openURL failed:", e); }
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`);
  };

  const socialIcons: Record<string, string> = {
    instagram: "logo-instagram",
    facebook: "logo-facebook",
    twitter: "logo-twitter",
    youtube: "logo-youtube",
    tiktok: "musical-notes",
    soundcloud: "cloud",
    spotify: "logo-snapchat",
    website: "globe",
  };

  const dayNames: Record<string, string> = {
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
    fri: "Fri", sat: "Sat", sun: "Sun",
  };

  const openNow = data.isOpen;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.bio && (
        <AboutSection
          title={t("profile.bio", "Bio")}
          icon="document-text-outline"
          cardColor={cardColor}
          textColor={textColor}
          primaryColor={primaryColor}
          themeStyles={themeStyles}
        >
          <Text style={[styles.bioText, { color: textColor }, themeStyles as any]}>{data.bio}</Text>
        </AboutSection>
      )}

      {data.type === "business" && data.category && (
        <AboutSection
          title={t("profile.category", "Category")}
          icon="grid-outline"
          cardColor={cardColor}
          textColor={textColor}
          primaryColor={primaryColor}
          themeStyles={themeStyles}
        >
          <View style={styles.categoryBadge}>
            <Text style={[styles.categoryText, { color: textColor }, themeStyles as any]}>
              {data.category}
            </Text>
          </View>
        </AboutSection>
      )}

      {(data.location || data.town || !readOnly) && (
        <AboutSection
          title={t("profile.location", "Location")}
          icon="location-outline"
          cardColor={cardColor}
          textColor={textColor}
          primaryColor={primaryColor}
          themeStyles={themeStyles}
        >
          <InfoRow
            icon="location"
            label={t("profile.address", "Address")}
            value={data.location || t("profile.notSet", "Not set")}
            onPress={!readOnly ? onOpenLocation : undefined}
            textColor={textColor}
            themeStyles={themeStyles}
          />
          {data.town && (
            <InfoRow
              icon="business-outline"
              label={t("profile.town", "Town / Area")}
              value={data.town}
              textColor={textColor}
              themeStyles={themeStyles}
            />
          )}
        </AboutSection>
      )}

      {data.type === "business" && (
        <>
          {data.openingHours && Object.keys(data.openingHours).length > 0 && (
            <AboutSection
              title={t("profile.hours", "Opening Hours")}
              icon="time-outline"
              cardColor={cardColor}
              textColor={textColor}
              primaryColor={primaryColor}
              themeStyles={themeStyles}
            >
              <View style={styles.hoursHeader}>
                <View
                  style={[
                    styles.openBadge,
                    { backgroundColor: openNow ? "#dcfce7" : "#fee2e2" },
                  ]}
                >
                  <Text
                    style={[
                      styles.openBadgeText,
                      { color: openNow ? PROFILE_COLORS.SUCCESS : PROFILE_COLORS.DANGER },
                    ]}
                  >
                    {openNow
                      ? t("profile.openNow", "Open Now")
                      : t("profile.closed", "Closed")}
                  </Text>
                </View>
                {!readOnly && onOpenHours && (
                  <Pressable onPress={onOpenHours}>
                    <Text style={[styles.editLink, { color: primaryColor }]}>
                      {t("common.edit", "Edit")}
                    </Text>
                  </Pressable>
                )}
              </View>
              {Object.entries(data.openingHours).map(([day, hours]) => (
                <View key={day} style={styles.hoursRow}>
                  <Text style={[styles.hoursDay, themeStyles as any]}>{dayNames[day] || day}</Text>
                  <Text style={[styles.hoursTime, { color: textColor }, themeStyles as any]}>
                    {hours.open} – {hours.close}
                  </Text>
                </View>
              ))}
            </AboutSection>
          )}
        </>
      )}

      {data.type === "artist" && data.genres && data.genres.length > 0 && (
        <AboutSection
          title={t("profile.genres", "Genres")}
          icon="musical-notes-outline"
          cardColor={cardColor}
          textColor={textColor}
          primaryColor={primaryColor}
          themeStyles={themeStyles}
        >
          <View style={styles.genreChips}>
            {data.genres.map((genre, i) => (
              <View key={i} style={[styles.genreChip, { borderColor: primaryColor }]}>
                <Text style={[styles.genreChipText, { color: primaryColor }, themeStyles as any]}>
                  {genre}
                </Text>
              </View>
            ))}
          </View>
        </AboutSection>
      )}

      <AboutSection
        title={t("profile.contact", "Contact")}
        icon="call-outline"
        cardColor={cardColor}
        textColor={textColor}
        primaryColor={primaryColor}
        themeStyles={themeStyles}
      >
        {data.website && (
          <InfoRow
            icon="globe-outline"
            label={t("profile.website", "Website")}
            value={data.website}
            onPress={() => handleOpenUrl(data.website!)}
            textColor={textColor}
            themeStyles={themeStyles}
          />
        )}
        {data.email && (
          <InfoRow
            icon="mail-outline"
            label={t("profile.email", "Email")}
            value={data.email}
            onPress={() => handleEmail(data.email!)}
            textColor={textColor}
            themeStyles={themeStyles}
          />
        )}
        {data.phone && (
          <InfoRow
            icon="call-outline"
            label={t("profile.phone", "Phone")}
            value={data.phone}
            onPress={() => handleCall(data.phone!)}
            textColor={textColor}
            themeStyles={themeStyles}
          />
        )}
        {!data.website && !data.email && !data.phone && (
          <Text style={[styles.emptySection, themeStyles as any]}>
            {t("profile.noContact", "No contact info")}
          </Text>
        )}
      </AboutSection>

      {data.socialLinks && Object.keys(data.socialLinks).length > 0 && (
        <AboutSection
          title={t("profile.socialLinks", "Social Links")}
          icon="share-social-outline"
          cardColor={cardColor}
          textColor={textColor}
          primaryColor={primaryColor}
          themeStyles={themeStyles}
        >
          <View style={styles.socialLinks}>
            {Object.entries(data.socialLinks).map(([platform, url]) => (
              <Pressable
                key={platform}
                style={[styles.socialBtn, { backgroundColor: "#f3f4f6" }]}
                onPress={() => handleOpenUrl(url)}
              >
                <Ionicons
                  name={(socialIcons[platform] || "link") as any}
                  size={22}
                  color={primaryColor}
                />
              </Pressable>
            ))}
          </View>
        </AboutSection>
      )}

      {!readOnly && onEdit && (
        <Pressable
          style={[styles.editButton, { backgroundColor: primaryColor }]}
          onPress={onEdit}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={[styles.editButtonText, themeStyles as any]}>
            {t("profile.editProfile", "Edit Profile")}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  section: {
    borderRadius: PROFILE.CARD_RADIUS,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  bioText: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: PROFILE_COLORS.BORDER,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: PROFILE_COLORS.TEXT_SECONDARY,
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 14,
  },
  hoursHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  openBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  openBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  editLink: {
    fontSize: 13,
    fontWeight: "500",
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  hoursDay: {
    fontSize: 13,
    color: PROFILE_COLORS.TEXT_SECONDARY,
    fontWeight: "500",
  },
  hoursTime: {
    fontSize: 13,
  },
  categoryBadge: {
    alignSelf: "flex-start",
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "500",
  },
  genreChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  genreChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  socialLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  socialBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  emptySection: {
    fontSize: 14,
    color: PROFILE_COLORS.TEXT_SECONDARY,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: PROFILE.CARD_RADIUS,
  },
  editButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
