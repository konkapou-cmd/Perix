import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { sendRentalInquiry } from "../../lib/api/rentals";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES } from "../../lib/designTokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  serviceId: string;
  serviceName: string;
  token: string;
};

type SelectedFile = {
  uri: string;
  name: string;
  type: string;
};

export default function RentalInquiryModal({ visible, onClose, serviceId, serviceName, token }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        type: ["image/*", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      });
      if (!result.canceled && result.assets) {
        const newFiles = result.assets.map((a) => ({
          uri: a.uri,
          name: a.name,
          type: a.mimeType || "application/octet-stream",
        }));
        setFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (e) {
      console.error("File picker error:", e);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.nameRequired", "Please enter your name"));
      return;
    }
    if (!email.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.emailRequired", "Please enter your email"));
      return;
    }
    if (!message.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.messageRequired", "Please enter a message"));
      return;
    }
    setSubmitting(true);
    try {
      await sendRentalInquiry(token, serviceId, name.trim(), email.trim(), message.trim(), files.length > 0 ? files : undefined);
      Alert.alert(
        t("services.inquirySent", "Inquiry Sent"),
        t("services.inquirySentMsg", "Your inquiry has been sent. The owner will contact you shortly.")
      );
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
      setFiles([]);
      onClose();
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e.message || t("services.inquiryFailed", "Failed to send inquiry"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </Pressable>
          <Text style={styles.title}>{t("services.sendInquiry", "Send Inquiry")}</Text>
          <View style={{ width: 24 }} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.serviceName}>{serviceName}</Text>

            <Text style={styles.label}>{t("services.yourName", "Your Name")}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" />

            <Text style={styles.label}>{t("services.yourEmail", "Email")}</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" />

            <Text style={styles.label}>{t("services.phone", "Phone")}</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+49 123 456789" keyboardType="phone-pad" />

            <Text style={styles.label}>{t("services.message", "Message")}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder={t("services.messagePlaceholder", "I'm interested in this property...")}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.label}>{t("services.attachments", "Attachments")}</Text>
            <Pressable style={styles.attachButton} onPress={pickFiles}>
              <Ionicons name="attach" size={20} color={COLORS.primary} />
              <Text style={styles.attachButtonText}>{t("services.addFiles", "Add Files (PDF, DOC, Images)")}</Text>
            </Pressable>

            {files.length > 0 && (
              <View style={styles.fileList}>
                {files.map((file, idx) => (
                  <View key={idx} style={styles.fileRow}>
                    <Ionicons
                      name={file.type.startsWith("image/") ? "image-outline" : "document-outline"}
                      size={20}
                      color="#6b7280"
                    />
                    <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                    <Pressable onPress={() => removeFile(idx)}>
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>{t("services.sendInquiry", "Send Inquiry")}</Text>
              )}
            </Pressable>
            <View style={{ height: 20 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.primary },
  form: { flex: 1, paddingHorizontal: 16 },
  serviceName: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 12, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    marginBottom: 8,
  },
  attachButtonText: { fontSize: 14, color: COLORS.primary, fontWeight: "500" },
  fileList: { gap: 6, marginBottom: 8 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  fileName: { flex: 1, fontSize: 13, color: "#374151" },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
