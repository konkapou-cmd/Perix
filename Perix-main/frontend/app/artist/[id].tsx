import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getArtistDetail } from "../../lib/api/artists";
import { ArtistDetail } from "../../lib/api/core";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { HeaderBackButton } from "../../components/shared/HeaderBackButton";
import { ContentHero, ContentGallery } from "../../components/shared";
import { DetailFacts, DetailFact } from "../../components/shared/DetailFacts";
import { BottomCTA } from "../../components/shared/BottomCTA";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import ReportModal from "../../components/ReportModal";
import { normalizeId } from "../../lib/navigation/entityRoutes";

const ACCENT = "#7C4DFF";

export default function ArtistDetailPage() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = normalizeId(rawId);
  const { sessionToken } = useAuth();
  const router = useRouter();

  const [detail, setDetail] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    getArtistDetail(sessionToken || "", id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, sessionToken]);

  const artist = detail?.artist;
  const allMediaItems: MediaItem[] = [
    ...(artist?.profile_photo ? [{ uri: artist.profile_photo, type: "image" as const }] : []),
    ...(artist?.cover_photo ? [{ uri: artist.cover_photo, type: "image" as const }] : []),
    ...(artist?.gallery_images || []).map((uri: string) => ({ uri, type: "image" as const })),
    ...(artist?.video_urls || []).map((uri: string) => ({ uri, type: "video" as const })),
  ];

  const handleMessage = () => {
    if (!sessionToken) {
      Alert.alert(t("common.loginRequired", "Login Required"), t("common.loginToContact", "Please log in to contact."));
      return;
    }
    router.push({
      pathname: "/messages/[id]",
      params: { id: id!, name: artist?.name, entityType: "artist" },
    });
  };

  const handleShare = () => {
    if (!artist) return;
    Share.share({ message: `${artist.name} on Perix` });
  };

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}><HeaderBackButton onPress={() => router.back()} /></View>
        <View style={styles.center}>
          <Text style={{ fontSize: 16, color: COLORS.textMuted, marginTop: SPACING.std }}>
            {t("artistProfile.notFound", "This artist cannot be opened.")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={ACCENT} /></View>
      </SafeAreaView>
    );
  }

  if (!artist) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t("artistProfile.notFound", "Not found")}</Text>
          <View style={{ width: 44 }} />
        </View>
      </SafeAreaView>
    );
  }

  const socialEntries = Object.entries(artist.socials || {}).filter(([, v]) => typeof v === "string" && v);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>{artist.name}</Text>
        <Pressable style={styles.reportBtn} hitSlop={8} onPress={() => setReportOpen(true)}>
          <Ionicons name="flag-outline" size={18} color="#9ca3af" />
        </Pressable>
      </View>

      <ScrollView style={styles.pageLimit} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ContentHero
          coverImageUrl={artist.cover_photo || artist.gallery_images?.[0]}
          imageUrls={artist.gallery_images || []}
          title={artist.name}
          hideBack
          flush
          badges={[
            ...(artist.genres || []).map((g: string) => ({ icon: "musical-notes" as const, text: g, color: ACCENT })),
          ]}
          subtitle={{ text: t("artistProfile.artist", "Artist"), icon: "mic-outline" }}
          mediaItems={allMediaItems}
          onMediaPress={(idx) => {
            setViewerMedia(allMediaItems);
            setViewerIndex(idx);
            setViewerOpen(true);
          }}
        />

        <DetailFacts>
          {artist.bio ? (
            <View style={styles.bioCard}>
              <Text style={styles.bio}>{artist.bio}</Text>
            </View>
          ) : null}
          {(artist.town || artist.city) ? (
            <DetailFact
              icon="location-outline"
              label={t("artistProfile.basedIn", "Based in")}
              value={artist.town || artist.city || ""}
              accentColor={ACCENT}
            />
          ) : null}
          {artist.address ? (
            <DetailFact
              icon="home-outline"
              label={t("artistProfile.address", "Address")}
              value={artist.address}
              accentColor={ACCENT}
            />
          ) : null}
          {socialEntries.length > 0 ? (
            <View style={styles.socialsRow}>
              {socialEntries.map(([key, value]) => (
                <Pressable
                  key={key}
                  style={styles.socialChip}
                  onPress={() => {
                    const str = String(value);
                    const url = str.startsWith("http") ? str : `https://${str}`;
                    Linking.openURL(url).catch(() => {});
                  }}
                >
                  <Ionicons name="link-outline" size={14} color={ACCENT} />
                  <Text style={styles.socialText}>{key}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </DetailFacts>

        {allMediaItems.length > 0 && (
          <View style={{ marginHorizontal: -SPACING.std }}>
            <ContentGallery mediaItems={allMediaItems} title={t("common.gallery", "Galerie")} />
          </View>
        )}

        {(detail?.events?.length ?? 0) > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>{t("artistProfile.upcomingEvents", "Events")}</Text>
            {detail!.events.map((ev: any) => (
              <Pressable
                key={ev.event_id}
                style={styles.eventRow}
                onPress={() => router.push(`/event/${ev.event_id}` as any)}
              >
                <Ionicons name="calendar-outline" size={18} color={ACCENT} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.eventMeta}>
                    {ev.start_time ? new Date(ev.start_time).toLocaleDateString() : ""}
                    {ev.location ? ` · ${ev.location}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <BottomCTA
        primaryLabel={t("common.contact", "Contact")}
        primaryIcon="chatbubble-ellipses-outline"
        accentColor={ACCENT}
        onPrimary={handleMessage}
        onShare={handleShare}
      />

      <LazyMediaViewer
        visible={viewerOpen}
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />

      <ReportModal
        visible={reportOpen}
        targetType="artist"
        targetId={artist.artist_id}
        sessionToken={sessionToken}
        onClose={() => setReportOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  pageLimit: {
    ...Platform.select({
      web: { width: "100%", maxWidth: 1280, marginHorizontal: "auto" },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.small,
    paddingBottom: SPACING.small,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, flex: 1, marginLeft: SPACING.small },
  reportBtn: { padding: 6 },
  body: { padding: SPACING.std, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bioCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg, padding: SPACING.std, marginTop: SPACING.small },
  bio: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, lineHeight: 22 },
  socialsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginTop: SPACING.small },
  socialChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  socialText: { fontSize: 13, fontWeight: "600", color: ACCENT },
  eventsSection: { marginTop: SPACING.section, paddingHorizontal: SPACING.std },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary, marginBottom: SPACING.small },
  eventRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.std, marginBottom: SPACING.small,
  },
  eventTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.textPrimary },
  eventMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
