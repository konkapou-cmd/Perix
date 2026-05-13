import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type Props = {
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  onEdit?: () => void;
};

export default function ContactInfoSection({ phone, website, email, onEdit }: Props) {
  const { t } = useTranslation();

  const openWebsite = () => {
    if (website) {
      const url = website.startsWith("http") ? website : `https://${website}`;
      Linking.openURL(url);
    }
  };

  const openPhone = () => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const openEmail = () => {
    if (email) {
      Linking.openURL(`mailto:${email}`);
    }
  };

  const hasContact = phone || website || email;

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{t("business.contactInfo")}</Text>
        {onEdit && (
          <Pressable onPress={onEdit}>
            <Text style={{ color: "#000000", fontWeight: "600", fontSize: 13 }}>{t("business.edit") || "Edit"}</Text>
          </Pressable>
        )}
      </View>
      {phone && (
        <Pressable style={styles.contactRow} onPress={openPhone}>
          <Ionicons name="call-outline" size={20} color="#000000" />
          <Text style={styles.contactText}>{phone}</Text>
          <Ionicons name="open-outline" size={16} color="#9ca3af" />
        </Pressable>
      )}
      {website && (
        <Pressable style={styles.contactRow} onPress={openWebsite}>
          <Ionicons name="globe-outline" size={20} color="#000000" />
          <Text style={styles.contactText}>{website}</Text>
          <Ionicons name="open-outline" size={16} color="#9ca3af" />
        </Pressable>
      )}
      {email && (
        <Pressable style={styles.contactRow} onPress={openEmail}>
          <Ionicons name="mail-outline" size={20} color="#000000" />
          <Text style={styles.contactText}>{email}</Text>
          <Ionicons name="open-outline" size={16} color="#9ca3af" />
        </Pressable>
      )}
      {!hasContact && (
        <Text style={styles.emptyText}>No contact info added yet.</Text>
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
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  contactText: {
    flex: 1,
    marginLeft: 12,
    color: "#000000",
    fontSize: 14,
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});
