import { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";

type EventForm = {
  title: string;
  description: string;
  start_time: string;
  location: string;
  image_base64: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  eventForm: EventForm;
  onFormChange: (form: EventForm) => void;
  eventDate: Date;
  eventTime: Date;
  showEventDatePicker: boolean;
  showEventTimePicker: boolean;
  onShowDatePicker: (show: boolean) => void;
  onShowTimePicker: (show: boolean) => void;
  onDateChange: (event: any, date?: Date) => void;
  onTimeChange: (event: any, time?: Date) => void;
  onSave: () => void;
  isEditing?: boolean;
};

export default function ArtistEventModal({
  visible,
  onClose,
  eventForm,
  onFormChange,
  eventDate,
  eventTime,
  showEventDatePicker,
  showEventTimePicker,
  onShowDatePicker,
  onShowTimePicker,
  onDateChange,
  onTimeChange,
  onSave,
  isEditing = false,
}: Props) {
  const { t } = useTranslation();

  const pickEventImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      onFormChange({
        ...eventForm,
        image_base64: `data:image/jpeg;base64,${result.assets[0].base64}`,
      });
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {isEditing ? t("artist.editEvent") : t("artist.createEvent")}
          </Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
        </View>
        <ScrollView style={styles.modalBody}>
          <Text style={styles.label}>{t("artist.eventTitle")}</Text>
          <TextInput
            style={styles.input}
            value={eventForm.title}
            onChangeText={(text) => onFormChange({ ...eventForm, title: text })}
            placeholder={t("artist.eventTitlePlaceholder")}
          />

          <Text style={styles.label}>{t("artist.description")}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={eventForm.description}
            onChangeText={(text) => onFormChange({ ...eventForm, description: text })}
            placeholder={t("artist.descriptionPlaceholder")}
            multiline
            numberOfLines={4}
          />

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <Text style={styles.label}>{t("artist.date")}</Text>
              <Pressable
                style={styles.selector}
                onPress={() => onShowDatePicker(true)}
              >
                <Text style={styles.selectorTextSelected}>{formatDate(eventDate)}</Text>
                <Ionicons name="calendar-outline" size={20} color="#6b7280" />
              </Pressable>
            </View>
            <View style={styles.halfWidth}>
              <Text style={styles.label}>{t("artist.time")}</Text>
              <Pressable
                style={styles.selector}
                onPress={() => onShowTimePicker(true)}
              >
                <Text style={styles.selectorTextSelected}>{formatTime(eventTime)}</Text>
                <Ionicons name="time-outline" size={20} color="#6b7280" />
              </Pressable>
            </View>
          </View>

          {showEventDatePicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onDateChange}
            />
          )}

          {showEventTimePicker && (
            <DateTimePicker
              value={eventTime}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onTimeChange}
            />
          )}

          <Text style={styles.label}>{t("artist.location")}</Text>
          <TextInput
            style={styles.input}
            value={eventForm.location}
            onChangeText={(text) => onFormChange({ ...eventForm, location: text })}
            placeholder={t("artist.locationPlaceholder")}
          />

          <Text style={styles.label}>{t("artist.eventImage")}</Text>
          <Pressable style={styles.imagePicker} onPress={pickEventImage}>
            {eventForm.image_base64 ? (
              <Image
                source={{ uri: eventForm.image_base64 }}
                style={styles.eventImage}
              />
            ) : (
              <View style={styles.imagePickerPlaceholder}>
                <Ionicons name="image-outline" size={32} color="#9ca3af" />
                <Text style={styles.imagePickerText}>{t("artist.selectImage")}</Text>
              </View>
            )}
          </Pressable>
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>
              {isEditing ? t("common.save") : t("common.create")}
            </Text>
          </Pressable>
        </View>
      </View>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
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
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
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
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectorTextSelected: {
    fontSize: 16,
    color: "#111827",
  },
  imagePicker: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    height: 200,
    overflow: "hidden",
  },
  imagePickerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePickerText: {
    marginTop: 8,
    color: "#9ca3af",
    fontSize: 14,
  },
  eventImage: {
    width: "100%",
    height: "100%",
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  secondaryButtonText: {
    color: "#374151",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
