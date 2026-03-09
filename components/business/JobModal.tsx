import {
  ActivityIndicator,
  Image,
  Modal,
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
import * as ImagePicker from "expo-image-picker";

type JobForm = {
  title: string;
  description: string;
  cover_image: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  jobForm: JobForm;
  onFormChange: (form: JobForm) => void;
  onSave: () => void;
  isSaving?: boolean;
};

export default function JobModal({
  visible,
  onClose,
  jobForm,
  onFormChange,
  onSave,
  isSaving,
}: Props) {
  const { t } = useTranslation();

  const handlePickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      onFormChange({ ...jobForm, cover_image: uri });
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#111827" />
          </Pressable>
          <Text style={styles.modalTitle}>{t("jobs.createJob")}</Text>
          <Pressable onPress={onSave} disabled={isSaving} style={styles.headerButton}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#4c6fff" />
            ) : (
              <Ionicons name="checkmark" size={28} color="#4c6fff" />
            )}
          </Pressable>
        </View>
        <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.label}>{t("jobs.jobTitle")} *</Text>
          <TextInput
            style={styles.input}
            placeholder={t("jobs.jobTitle")}
            value={jobForm.title}
            onChangeText={(v) => onFormChange({ ...jobForm, title: v })}
          />
          <Text style={styles.label}>{t("jobs.jobDescription")} *</Text>
          <TextInput
            style={[styles.input, { height: 120 }]}
            placeholder={t("jobs.jobDescription")}
            value={jobForm.description}
            onChangeText={(v) => onFormChange({ ...jobForm, description: v })}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.label}>{t("jobs.coverImage")}</Text>
          <Pressable style={styles.uploadArea} onPress={handlePickCover}>
            {jobForm.cover_image ? (
              <Image source={{ uri: jobForm.cover_image }} style={styles.coverPreview} />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="image-outline" size={40} color="#9ca3af" />
                <Text style={styles.uploadText}>{t("jobs.coverImage")}</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  uploadArea: {
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  uploadPlaceholder: {
    alignItems: "center",
    padding: 20,
  },
  uploadText: {
    color: "#9ca3af",
    marginTop: 8,
  },
  coverPreview: {
    width: "100%",
    height: 150,
    borderRadius: 12,
  },
});
