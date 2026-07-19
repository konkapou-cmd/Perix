import React, { useState, useEffect } from "react";
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { ListingType, ListingCreatePayload, Listing } from "../../lib/api/listings";
import { createListing, updateListing } from "../../lib/api/listings";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";

type Props = {
  visible: boolean;
  listingType: ListingType;
  editingListing?: Listing | null;
  sessionToken: string;
  onClose: () => void;
  onSave: () => void;
};

const HOME_TYPES = ["apartment", "house", "studio", "room"];
const CONDITIONS = ["new", "like_new", "good", "used"];
const DELIVERY = ["pickup", "shipping", "both"];

export default function ListingModal({ visible, listingType, editingListing, sessionToken, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const isProduct = listingType === "product";
  const isEditing = !!editingListing;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  // Product fields
  const [condition, setCondition] = useState("");
  const [brand, setBrand] = useState("");
  const [delivery, setDelivery] = useState("");

  // Home fields
  const [propertyType, setPropertyType] = useState("apartment");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [sizeSqm, setSizeSqm] = useState("");
  const [furnished, setFurnished] = useState(false);
  const [availableFrom, setAvailableFrom] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("");
  const [deposit, setDeposit] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && editingListing) {
      setTitle(editingListing.title || "");
      setDescription(editingListing.description || "");
      setPrice(editingListing.price || "");
      setStatus(editingListing.status === "published" ? "published" : "draft");
      setAddress(editingListing.address || "");
      setLatitude(editingListing.latitude);
      setLongitude(editingListing.longitude);
      setCondition(editingListing.condition || "");
      setBrand(editingListing.brand || "");
      setDelivery(editingListing.delivery_method || "");
      setPropertyType(editingListing.property_type || "apartment");
      setBedrooms(editingListing.bedrooms?.toString() || "");
      setBathrooms(editingListing.bathrooms?.toString() || "");
      setSizeSqm(editingListing.size_sqm?.toString() || "");
      setFurnished(editingListing.furnished || false);
      setAvailableFrom(editingListing.available_from || "");
      setLeaseDuration(editingListing.lease_duration || "");
      setDeposit(editingListing.deposit || "");
    } else if (visible) {
      resetForm();
    }
  }, [visible, editingListing]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setPrice(""); setStatus("published");
    setAddress(""); setLatitude(undefined); setLongitude(undefined);
    setCondition(""); setBrand(""); setDelivery("");
    setPropertyType("apartment"); setBedrooms(""); setBathrooms("");
    setSizeSqm(""); setFurnished(false); setAvailableFrom(""); setLeaseDuration(""); setDeposit("");
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(t("common.error", "Error"), t("common.titleRequired", "Title is required"));
      return;
    }
    setSaving(true);
    try {
      const payload: ListingCreatePayload = {
        listing_type: listingType,
        title: title.trim(),
        description: description || undefined,
        price: price || undefined,
        status,
        address: address || undefined,
        latitude,
        longitude,
        condition: isProduct ? (condition || undefined) : undefined,
        brand: isProduct ? (brand || undefined) : undefined,
        delivery_method: isProduct ? (delivery || undefined) : undefined,
        property_type: !isProduct ? propertyType : undefined,
        bedrooms: !isProduct ? (parseInt(bedrooms, 10) || undefined) : undefined,
        bathrooms: !isProduct ? (parseInt(bathrooms, 10) || undefined) : undefined,
        size_sqm: !isProduct ? (parseInt(sizeSqm, 10) || undefined) : undefined,
        furnished: !isProduct ? (furnished ? true : undefined) : undefined,
        available_from: !isProduct ? (availableFrom || undefined) : undefined,
        lease_duration: !isProduct ? (leaseDuration || undefined) : undefined,
        deposit: !isProduct ? (deposit || undefined) : undefined,
      };

      if (isEditing) {
        await updateListing(sessionToken, editingListing!.listing_id, payload);
      } else {
        await createListing(sessionToken, payload);
      }
      onSave();
      onClose();
      resetForm();
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e?.message || t("common.saveFailed", "Failed to save listing"));
    }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>
              {isEditing
                ? t("common.edit", "Edit")
                : isProduct
                  ? t("marketplace.sellItem", "Sell an Item")
                  : t("marketplace.listHome", "List a Home")}
            </Text>
            <View style={styles.closeBtn} />
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>
              {t("common.title", "Title")} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={isProduct ? "e.g. Vintage Watch" : "e.g. Cozy Studio in Mitte"} placeholderTextColor={COLORS.textDisabled} />

            <Text style={styles.label}>{t("services.price", "Price")}</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder={isProduct ? "$20" : "€800/month"} placeholderTextColor={COLORS.textDisabled} keyboardType="numeric" />

            <Text style={styles.label}>{t("services.description", "Description")}</Text>
            <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} placeholder={t("services.descriptionPlaceholder", "Describe your listing...")} placeholderTextColor={COLORS.textDisabled} multiline textAlignVertical="top" />

            {isProduct ? (
              <>
                <Text style={styles.label}>{t("services.condition", "Condition")}</Text>
                <View style={styles.chipRow}>
                  {CONDITIONS.map((c) => (
                    <Pressable key={c} style={[styles.chip, condition === c && styles.chipActive]} onPress={() => setCondition(condition === c ? "" : c)}>
                      <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>{t("services.brand", "Brand")}</Text>
                <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholder="Nike, Apple, etc." placeholderTextColor={COLORS.textDisabled} />

                <Text style={styles.label}>{t("services.delivery", "Delivery")}</Text>
                <View style={styles.chipRow}>
                  {DELIVERY.map((d) => (
                    <Pressable key={d} style={[styles.chip, delivery === d && styles.chipActive]} onPress={() => setDelivery(delivery === d ? "" : d)}>
                      <Text style={[styles.chipText, delivery === d && styles.chipTextActive]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>{t("rentals.propertyType", "Property Type")}</Text>
                <View style={styles.chipRow}>
                  {HOME_TYPES.map((ht) => (
                    <Pressable key={ht} style={[styles.chip, propertyType === ht && styles.chipActive]} onPress={() => setPropertyType(ht)}>
                      <Text style={[styles.chipText, propertyType === ht && styles.chipTextActive]}>{ht}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{t("services.bedrooms", "Beds")}</Text>
                    <TextInput style={styles.input} value={bedrooms} onChangeText={setBedrooms} keyboardType="numeric" placeholder="2" placeholderTextColor={COLORS.textDisabled} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{t("services.bathrooms", "Baths")}</Text>
                    <TextInput style={styles.input} value={bathrooms} onChangeText={setBathrooms} keyboardType="numeric" placeholder="1" placeholderTextColor={COLORS.textDisabled} />
                  </View>
                </View>

                <Text style={styles.label}>{t("services.sizeSqm", "Size (m²)")}</Text>
                <TextInput style={styles.input} value={sizeSqm} onChangeText={setSizeSqm} keyboardType="numeric" placeholder="65" placeholderTextColor={COLORS.textDisabled} />

                <Pressable style={[styles.toggle, furnished && styles.toggleActive]} onPress={() => setFurnished(!furnished)}>
                  <Ionicons name={furnished ? "checkbox" : "square-outline"} size={20} color={furnished ? COLORS.primary : COLORS.textMuted} />
                  <Text style={styles.toggleText}>{t("services.furnished", "Furnished")}</Text>
                </Pressable>

                <Text style={styles.label}>{t("services.availableFrom", "Available from")}</Text>
                <TextInput style={styles.input} value={availableFrom} onChangeText={setAvailableFrom} placeholder="2026-08-01" placeholderTextColor={COLORS.textDisabled} />

                <Text style={styles.label}>{t("services.leaseDuration", "Lease Duration")}</Text>
                <TextInput style={styles.input} value={leaseDuration} onChangeText={setLeaseDuration} placeholder="1 year" placeholderTextColor={COLORS.textDisabled} />

                <Text style={styles.label}>{t("rentals.deposit", "Deposit")}</Text>
                <TextInput style={styles.input} value={deposit} onChangeText={setDeposit} placeholder="€1000" placeholderTextColor={COLORS.textDisabled} />

                <Text style={styles.label}>{t("services.address", "Address")} <Text style={styles.required}>*</Text></Text>
                <PlacesAutocompleteInput
                  value={address}
                  onChangeText={setAddress}
                  onSelectPlace={(addr, lat, lng) => { setAddress(addr); setLatitude(lat); setLongitude(lng); }}
                  placeholder={t("services.addressPlaceholder", "Search address...")}
                  confirmed={!!address}
                />
              </>
            )}

            <View style={styles.statusRow}>
              <Pressable style={[styles.statusBtn, status === "draft" && styles.statusBtnDraft]} onPress={() => setStatus("draft")}>
                <Text style={[styles.statusBtnText, status === "draft" && styles.statusBtnTextDraft]}>{t("common.saveDraft", "Save as draft")}</Text>
              </Pressable>
              <Pressable style={[styles.statusBtn, status === "published" && styles.statusBtnPub]} onPress={() => setStatus("published")}>
                <Text style={[styles.statusBtnText, status === "published" && styles.statusBtnTextPub]}>{t("common.publish", "Publish")}</Text>
              </Pressable>
            </View>

            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.saveBtnText}>
                  {isEditing ? t("common.save", "Save") : status === "draft" ? t("common.saveDraft", "Save Draft") : t("common.publish", "Publish Listing")}
                </Text>
              )}
            </Pressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.std, paddingVertical: SPACING.small,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: "700", color: COLORS.textPrimary },
  body: { padding: SPACING.std, paddingBottom: 100 },
  label: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.textPrimary, marginTop: SPACING.small, marginBottom: 4 },
  required: { color: COLORS.danger },
  input: {
    backgroundColor: COLORS.backgroundPage, borderRadius: BORDER_RADIUS.md,
    padding: 12, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginBottom: 4 },
  chip: {
    paddingHorizontal: SPACING.small, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.backgroundPage,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textSecondary },
  chipTextActive: { color: "#fff" },
  row: { flexDirection: "row", gap: SPACING.small },
  toggle: { flexDirection: "row", alignItems: "center", gap: SPACING.small, marginVertical: SPACING.small },
  toggleActive: {},
  toggleText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  statusRow: { flexDirection: "row", gap: SPACING.small, marginTop: SPACING.section },
  statusBtn: {
    flex: 1, paddingVertical: 12, borderRadius: BORDER_RADIUS.md,
    alignItems: "center", backgroundColor: COLORS.backgroundPage, borderWidth: 1, borderColor: COLORS.border,
  },
  statusBtnDraft: { borderColor: COLORS.textMuted },
  statusBtnPub: { borderColor: COLORS.primary },
  statusBtnText: { fontSize: 14, fontWeight: "600", color: COLORS.textSecondary },
  statusBtnTextDraft: { color: COLORS.textPrimary },
  statusBtnTextPub: { color: COLORS.primary },
  saveBtn: {
    marginTop: SPACING.section, backgroundColor: COLORS.primaryDark,
    borderRadius: BORDER_RADIUS.md, paddingVertical: 14, alignItems: "center",
  },
  saveBtnText: { fontSize: FONT_SIZES.body, fontWeight: "700", color: "#fff" },
});
