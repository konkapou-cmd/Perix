import {
  ActivityIndicator,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "../../lib/designTokens";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";

type RentalForm = {
  title: string;
  description: string;
  cover_image: string;
  rent_price: string;
  rooms_size: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  available_from: string;
  deposit: string;
  property_type: string;
  gallery_images: string[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  rentalForm: RentalForm;
  onFormChange: (form: RentalForm) => void;
  onSave: () => void;
  isSaving?: boolean;
  nearLat?: number;
  nearLng?: number;
};

const PROPERTY_TYPES = ["apartment", "house", "studio", "room", "commercial", "vacation"];

export default function RentalModal({
  visible,
  onClose,
  rentalForm,
  onFormChange,
  onSave,
  isSaving,
  nearLat,
  nearLng,
}: Props) {
  const { t } = useTranslation();

  const handlePickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      onFormChange({ ...rentalForm, cover_image: `data:image/jpeg;base64,${result.assets[0].base64}` });
    }
  };

  const handlePickGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const newImages = result.assets
        .filter(a => a.base64)
        .map(a => `data:image/jpeg;base64,${a.base64!}`);
      onFormChange({
        ...rentalForm,
        gallery_images: [...rentalForm.gallery_images, ...newImages].slice(0, 8),
      });
    }
  };

  const update = (key: keyof RentalForm, value: string | number | null) => {
    onFormChange({ ...rentalForm, [key]: value });
  };

  const handlePlaceSelect = (address: string, lat: number, lng: number) => {
    onFormChange({ ...rentalForm, address, latitude: lat, longitude: lng });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.primary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("rentals.postRental", "Post Rental")}</Text>
          <Pressable onPress={onSave} style={styles.headerBtn} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="checkmark" size={28} color={COLORS.primary} />
            )}
          </Pressable>
        </View>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t("rentals.title", "Title")} *</Text>
          <TextInput
            style={styles.input}
            value={rentalForm.title}
            onChangeText={(v) => update("title", v)}
            placeholder="2BR Apartment in City Center"
          />

          <Text style={styles.label}>{t("rentals.description", "Description")} *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={rentalForm.description}
            onChangeText={(v) => update("description", v)}
            placeholder="Describe the property..."
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>{t("rentals.rentPrice", "Rent Price")}</Text>
          <TextInput
            style={styles.input}
            value={rentalForm.rent_price}
            onChangeText={(v) => update("rent_price", v)}
            placeholder="€800/month"
            keyboardType="numeric"
          />

          <Text style={styles.label}>{t("rentals.roomsSize", "Rooms / Size")}</Text>
          <TextInput
            style={styles.input}
            value={rentalForm.rooms_size}
            onChangeText={(v) => update("rooms_size", v)}
            placeholder="2 bedrooms, 75m²"
          />

          <Text style={styles.label}>{t("rentals.propertyType", "Property Type")}</Text>
          <View style={styles.chipRow}>
            {PROPERTY_TYPES.map((pt) => (
              <Pressable
                key={pt}
                style={[styles.chip, rentalForm.property_type === pt && styles.chipActive]}
                onPress={() => update("property_type", pt)}
              >
                <Text style={[styles.chipText, rentalForm.property_type === pt && styles.chipTextActive]}>
                  {pt.charAt(0).toUpperCase() + pt.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>{t("rentals.address", "Address")}</Text>
          <PlacesAutocompleteInput
            value={rentalForm.address}
            onChangeText={(text) => {
              onFormChange({ ...rentalForm, address: text });
            }}
            onSelectPlace={handlePlaceSelect}
            placeholder="Search address..."
            nearLat={nearLat}
            nearLng={nearLng}
          />

          <Text style={styles.label}>{t("rentals.availableFrom", "Available From")}</Text>
          <TextInput
            style={styles.input}
            value={rentalForm.available_from}
            onChangeText={(v) => update("available_from", v)}
            placeholder="2026-05-01"
          />

          <Text style={styles.label}>{t("rentals.deposit", "Deposit")}</Text>
          <TextInput
            style={styles.input}
            value={rentalForm.deposit}
            onChangeText={(v) => update("deposit", v)}
            placeholder="€1,600"
          />

          <Text style={styles.label}>{t("rentals.coverImage", "Cover Image")}</Text>
          <Pressable style={styles.imagePicker} onPress={handlePickCover}>
            {rentalForm.cover_image ? (
              <Image source={{ uri: rentalForm.cover_image }} style={styles.coverImage} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="camera-outline" size={32} color="#999" />
                <Text style={styles.imagePlaceholderText}>{t("rentals.addCover", "Add Cover Photo")}</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.label}>{t("rentals.gallery", "Gallery")} ({rentalForm.gallery_images.length}/8)</Text>
          <View style={styles.galleryRow}>
            {rentalForm.gallery_images.map((uri, idx) => (
              <View key={idx} style={styles.galleryItem}>
                <Image source={{ uri }} style={styles.galleryImage} />
                <Pressable
                  style={styles.galleryRemove}
                  onPress={() => {
                    const updated = [...rentalForm.gallery_images];
                    updated.splice(idx, 1);
                    onFormChange({ ...rentalForm, gallery_images: updated });
                  }}
                >
                  <Ionicons name="close-circle" size={18} color="#ff4444" />
                </Pressable>
              </View>
            ))}
            {rentalForm.gallery_images.length < 8 && (
              <Pressable style={styles.galleryAdd} onPress={handlePickGallery}>
                <Ionicons name="add" size={24} color="#999" />
              </Pressable>
            )}
          </View>

          <View style={{ height: 40 }} />
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
    borderBottomColor: "#eee",
  },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.primary },
  form: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#333",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#f9f9f9",
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: "#666" },
  chipTextActive: { color: "#fff" },
  imagePicker: { marginTop: 4 },
  coverImage: { width: "100%", height: 180, borderRadius: 8 },
  imagePlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: { fontSize: 13, color: "#999", marginTop: 4 },
  galleryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  galleryItem: { width: 70, height: 70, position: "relative" },
  galleryImage: { width: 70, height: 70, borderRadius: 6 },
  galleryRemove: { position: "absolute", top: -6, right: -6 },
  galleryAdd: {
    width: 70,
    height: 70,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
