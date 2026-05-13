import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

type Props = {
  businessName: string;
  onEdit: () => void;
  onOpenPublicProfile: () => void;
};

export default function ProfileSection({
  businessName,
  onEdit,
  onOpenPublicProfile,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("business.profileManagement")}</Text>
      <Pressable style={styles.secondaryButton} onPress={onEdit}>
        <Text style={styles.secondaryButtonText}>{t("business.editInfo")}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onOpenPublicProfile}>
        <Text style={styles.secondaryButtonText}>{t("business.openPublicProfile")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: {
    color: "#000000",
    fontWeight: "600",
  },
});
