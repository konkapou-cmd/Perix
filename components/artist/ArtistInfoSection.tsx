import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type Props = {
  genres?: string[];
  town?: string;
  socials?: Record<string, string>;
};

export default function ArtistInfoSection({ genres, town, socials }: Props) {
  const { t } = useTranslation();

  const hasSocials = socials && Object.keys(socials).length > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("artist.info")}</Text>
      {genres && genres.length > 0 && (
        <View style={styles.infoRow}>
          <Ionicons name="pricetag-outline" size={20} color="#4c6fff" />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>{t("artist.genres")}</Text>
            <View style={styles.genreContainer}>
              {genres.map((genre, index) => (
                <View key={index} style={styles.genreTag}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
      <View style={styles.infoRow}>
        <Ionicons name="location-outline" size={20} color="#10b981" />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>{t("artist.serviceArea") || t("artist.town")}</Text>
          <Text style={styles.infoValue}>{town || t("business.notSet")}</Text>
        </View>
      </View>
      {hasSocials && (
        <View style={styles.infoRow}>
          <Ionicons name="link-outline" size={20} color="#8b5cf6" />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoLabel}>{t("common.socials")}</Text>
            <Text style={styles.infoValue}>{Object.keys(socials!).join(", ")}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  genreContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  genreTag: {
    backgroundColor: "#f0f4ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  genreText: {
    fontSize: 13,
    color: "#4c6fff",
    fontWeight: "500",
  },
});
