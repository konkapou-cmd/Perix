import React, { useState, useEffect, useMemo } from "react";
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { ListingType, ListingStatus, ListingCreatePayload, Listing, LocationVisibility, SellerType, PublicationScope } from "../../lib/api/listings";
import { createListing, updateListing } from "../../lib/api/listings";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";
import MarketplaceCategoryPicker from "../marketplace/MarketplaceCategoryPicker";
import MarketplaceAttributeFields from "../marketplace/MarketplaceAttributeFields";
import { getCategoryAttributes, getCategoryConfig, normalizeCategory } from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  visible: boolean;
  listingType: ListingType;
  editingListing?: Listing | null;
  sessionToken: string;
  businessId?: string | null;
  businessAddress?: string | null;
  businessLatitude?: number | null;
  businessLongitude?: number | null;
  businessPublicLocationLabel?: string | null;
  allowedTaxonomy?: Record<string, "*" | string[]> | null;
  onClose: () => void;
  onSave: () => void;
  onCreated?: (listingId: string) => void;
};

const HOME_TYPES = ["apartment", "house", "studio", "room"];
const CONDITIONS = ["new", "like_new", "good", "used"];
const DELIVERY = ["pickup", "shipping", "both"];

function listingToMedia(listing: Listing | null | undefined): MediaItem[] {
  if (!listing) return [];
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  function push(item: MediaItem) {
    if (!seen.has(item.uri)) {
      seen.add(item.uri);
      items.push(item);
    }
  }

  if (listing.cover_image_url) {
    push({ uri: listing.cover_image_url, type: "image", isCoverImage: true });
  }

  if (listing.video_url) {
    push({ uri: listing.video_url, type: "video", isCoverVideo: !listing.cover_image_url });
  }

  if (listing.image_urls) {
    listing.image_urls.forEach((u) => push({ uri: u, type: "image" }));
  }

  if (listing.gallery_images) {
    listing.gallery_images.forEach((u) => push({ uri: u, type: "image" }));
  }

  if (listing.gallery_videos) {
    listing.gallery_videos.forEach((u) => push({ uri: u, type: "video" }));
  }

  return items;
}

function hasUnresolvedMedia(media: MediaItem[]): boolean {
  return media.some((m) => m.processingStatus === "processing" || m.processingStatus === "failed");
}

function mediaToPayload(media: MediaItem[]): { image_urls: string[]; gallery_images: string[]; gallery_videos: string[]; video_url?: string; cover_image_url?: string } {
  const ready = media.filter((m) => !m.processingStatus || m.processingStatus === "ready");
  const images = ready.filter((m) => m.type === "image");
  const videos = ready.filter((m) => m.type === "video");
  const explicitCoverVideo = videos.find((m) => (m as any).isCoverVideo);
  const explicitCoverImage = images.find((m) => (m as any).isCoverImage);
  const coverImage = explicitCoverVideo ? undefined : explicitCoverImage ?? images[0];
  const primaryVideo = explicitCoverVideo ?? videos[0];
  return {
    cover_image_url: coverImage?.uri,
    image_urls: images.map((m) => m.uri),
    gallery_images: images.filter((m) => m.uri !== coverImage?.uri).map((m) => m.uri),
    video_url: primaryVideo?.uri,
    gallery_videos: videos.filter((m) => m.uri !== primaryVideo?.uri).map((m) => m.uri),
  };
}

export default function ListingModal({ visible, listingType, editingListing, sessionToken, businessId, businessAddress, businessLatitude, businessLongitude, businessPublicLocationLabel, allowedTaxonomy, onClose, onSave: onSaveProp, onCreated }: Props) {
  const { t } = useTranslation();
  const isProduct = listingType === "product";
  const isEditing = !!editingListing;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<ListingStatus>("published");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [publicLocationLabel, setPublicLocationLabel] = useState("");
  const [locationVisibility, setLocationVisibility] = useState<LocationVisibility>("approximate");
  const [media, setMedia] = useState<MediaItem[]>([]);

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

  const [listingCategory, setListingCategory] = useState("");
  const [listingSubcategory, setListingSubcategory] = useState("");
  const [listingAttributes, setListingAttributes] = useState<Record<string, any>>({});
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [sellerType, setSellerType] = useState<SellerType>(businessId ? "business" : "user");
  const [sellerBusinessId, setSellerBusinessId] = useState<string | null>(businessId ?? null);
  const [scope, setScope] = useState<PublicationScope>("profile_and_marketplace");

  const hasCoordinates = useMemo(
    () => Number.isFinite(latitude) && Number.isFinite(longitude),
    [latitude, longitude],
  );

  useEffect(() => {
    if (visible && editingListing) {
      setTitle(editingListing.title || "");
      setDescription(editingListing.description || "");
      setPrice(editingListing.price || "");
      setStatus(editingListing.status as ListingStatus);
      setAddress(editingListing.address || "");
      setLatitude(editingListing.latitude);
      setLongitude(editingListing.longitude);
      setPublicLocationLabel(editingListing.public_location_label || "");
      setLocationVisibility(editingListing.location_visibility || "approximate");
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
      const cat = normalizeCategory(editingListing.category || "");
      setListingCategory(cat);
      setListingSubcategory(editingListing.subcategory || "");
      setListingAttributes(editingListing.attributes || {});
      setSellerType(editingListing.seller_type || "user");
      setSellerBusinessId(editingListing.business_id ?? null);
      setScope(editingListing.publication_scope || "profile_and_marketplace");
      setMedia(listingToMedia(editingListing));
    } else if (visible) {
      setTitle(""); setDescription(""); setPrice(""); setStatus("published");
      setAddress(""); setLatitude(undefined); setLongitude(undefined); setMedia([]);
      setPublicLocationLabel(""); setLocationVisibility("approximate");
      setCondition(""); setBrand(""); setDelivery("");
      setPropertyType("apartment"); setBedrooms(""); setBathrooms("");
      setSizeSqm(""); setFurnished(false); setAvailableFrom(""); setLeaseDuration(""); setDeposit("");
      setListingCategory(""); setListingSubcategory(""); setListingAttributes({});
      setSellerType(businessId ? "business" : "user");
      setSellerBusinessId(businessId ?? null);
      setScope("profile_and_marketplace");
      if (businessId) {
        setAddress(businessAddress ?? "");
        setLatitude(businessLatitude ?? undefined);
        setLongitude(businessLongitude ?? undefined);
        setPublicLocationLabel(businessPublicLocationLabel ?? "");
      }
    }
  }, [visible, editingListing]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(t("common.error", "Error"), t("common.titleRequired", "Title is required"));
      return;
    }

    if (hasUnresolvedMedia(media)) {
      Alert.alert(
        t("upload.processingVideoTitle", "Video wird verarbeitet"),
        t("upload.processingVideoBody", "Warte bis das Video fertig verarbeitet wurde, oder entferne es."),
      );
      return;
    }

    let effectiveStatus: ListingStatus = status;
    if (status === "published") {
      if (!hasCoordinates) {
        effectiveStatus = "draft";
      } else if (locationVisibility === "approximate" && !publicLocationLabel.trim()) {
        effectiveStatus = "draft";
      } else if (isProduct && !listingCategory) {
        effectiveStatus = "draft";
      } else if (isProduct && !listingSubcategory) {
        effectiveStatus = "draft";
      }
    }

    setSaving(true);
    try {
      const mediaFields = mediaToPayload(media);
      const payload: ListingCreatePayload = {
        listing_type: listingType,
        title: title.trim(),
        description: description || null,
        price: price || null,
        status: effectiveStatus,
        address: address || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        public_location_label: publicLocationLabel || null,
        location_visibility: locationVisibility,
        category: listingCategory || null,
        subcategory: listingSubcategory || null,
        attributes: Object.keys(listingAttributes).length > 0 ? listingAttributes : null,
        seller_type: sellerType,
        seller_id: sellerType === "business" ? sellerBusinessId : undefined,
        business_id: sellerType === "business" ? sellerBusinessId : undefined,
        publication_scope: scope,
        cover_image_url: mediaFields.cover_image_url || null,
        image_urls: mediaFields.image_urls,
        gallery_images: mediaFields.gallery_images,
        gallery_videos: mediaFields.gallery_videos,
        video_url: mediaFields.video_url || null,
        condition: isProduct ? (condition || null) : undefined,
        brand: isProduct ? (brand || null) : undefined,
        delivery_method: isProduct ? (delivery || null) : undefined,
        property_type: !isProduct ? propertyType : undefined,
        bedrooms: !isProduct ? (bedrooms.trim() ? parseInt(bedrooms, 10) : null) : undefined,
        bathrooms: !isProduct ? (bathrooms.trim() ? parseInt(bathrooms, 10) : null) : undefined,
        size_sqm: !isProduct ? (sizeSqm.trim() ? parseInt(sizeSqm, 10) : null) : undefined,
        furnished: !isProduct ? furnished : undefined,
        available_from: !isProduct ? (availableFrom || null) : undefined,
        lease_duration: !isProduct ? (leaseDuration || null) : undefined,
        deposit: !isProduct ? (deposit || null) : undefined,
      };

      if (isEditing) {
        await updateListing(sessionToken, editingListing!.listing_id, payload);
      } else {
        const created = await createListing(sessionToken, payload);
        onCreated?.(created.listing_id);
      }

      if (effectiveStatus !== status) {
        Alert.alert(
          t("common.savedAsDraft", "Als Entwurf gespeichert"),
          t("marketplace.draftLocationHint", "Füge eine verifizierte Adresse hinzu, bevor du veröffentlichst."),
        );
      }
      onSaveProp();
      onClose();
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

            <UnifiedMediaGallery
              media={media}
              onChange={setMedia}
              sessionToken={sessionToken}
              label={t("marketplace.photosVideos", "Photos & Videos")}
            />

            {isProduct && (
              <>
                <Text style={styles.label}>
                  {t("marketplace.category", "Kategorie")}
                  {status === "published" && <Text style={styles.required}> *</Text>}
                </Text>
                <Pressable
                  style={styles.input}
                  onPress={() => setCategoryPickerVisible(true)}
                >
                  <Text style={listingCategory ? { color: COLORS.textPrimary } : { color: COLORS.textDisabled }}>
                    {listingCategory
                      ? `${getCategoryConfig(listingCategory)?.fallback ?? listingCategory}${listingSubcategory ? ` · ${getCategoryConfig(listingCategory)?.subcategories.find((s) => s.key === listingSubcategory)?.fallback ?? listingSubcategory}` : ""}`
                      : t("marketplace.selectCategory", "Kategorie auswählen")}
                  </Text>
                </Pressable>

                <MarketplaceCategoryPicker
                  visible={categoryPickerVisible}
                  selectedCategory={listingCategory}
                  selectedSubcategory={listingSubcategory}
                  allowedTaxonomy={allowedTaxonomy}
                  onSelect={(cat, sub) => {
                    if (cat !== listingCategory) setListingAttributes({});
                    setListingCategory(cat);
                    setListingSubcategory(sub);
                  }}
                  onClose={() => setCategoryPickerVisible(false)}
                />

                {listingCategory && (
                  <MarketplaceAttributeFields
                    attributes={getCategoryAttributes(listingCategory, listingSubcategory || undefined)}
                    values={listingAttributes}
                    onChange={(key, val) => setListingAttributes((prev) => ({ ...prev, [key]: val }))}
                  />
                )}

                <Pressable
                  style={[styles.toggle, scope === "profile_and_marketplace" && styles.toggleActive]}
                  onPress={() => setScope(scope === "profile_and_marketplace" ? "profile_only" : "profile_and_marketplace")}
                >
                  <Ionicons name={scope === "profile_and_marketplace" ? "checkbox" : "square-outline"} size={20} color={scope === "profile_and_marketplace" ? COLORS.primary : COLORS.textMuted} />
                  <Text style={styles.toggleText}>{t("marketplace.showInMarketplace", "Im Marktplatz anzeigen")}</Text>
                </Pressable>

                {businessId && (
                  <Pressable
                    style={styles.toggle}
                    onPress={() => {
                      if (address) {
                        setAddress(""); setLatitude(undefined); setLongitude(undefined);
                      } else {
                        setAddress(businessAddress || ""); setLatitude(businessLatitude ?? undefined); setLongitude(businessLongitude ?? undefined);
                      }
                    }}
                  >
                    <Ionicons name={address === businessAddress ? "checkbox" : "square-outline"} size={20} color={address === businessAddress ? COLORS.primary : COLORS.textMuted} />
                    <Text style={styles.toggleText}>{t("marketplace.useBusinessAddress", "Geschäftsadresse verwenden")}</Text>
                  </Pressable>
                )}

                <View style={{ height: SPACING.section }} />
              </>
            )}

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
              </>
            )}

            <Text style={styles.label}>
              {t("services.address", "Address")}
              {status === "published" && <Text style={styles.required}> *</Text>}
            </Text>
            <PlacesAutocompleteInput
              value={address}
              onChangeText={(text) => { setAddress(text); setLatitude(undefined); setLongitude(undefined); }}
              onSelectPlace={(addr, lat, lng, publicLabel) => {
                setAddress(addr);
                setLatitude(lat);
                setLongitude(lng);
                if (publicLabel) {
                  setPublicLocationLabel(publicLabel);
                }
              }}
              placeholder={t("services.addressPlaceholder", "Search address...")}
              confirmed={hasCoordinates}
              sessionToken={sessionToken}
            />

            {hasCoordinates && (
              <>
                <Text style={styles.label}>{t("marketplace.locationVisibility", "Sichtbarkeit des Standorts")}</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    style={[styles.chip, locationVisibility === "approximate" && styles.chipActive]}
                    onPress={() => setLocationVisibility("approximate")}
                  >
                    <Text style={[styles.chipText, locationVisibility === "approximate" && styles.chipTextActive]}>
                      {t("marketplace.approximate", "Ungefährer Bereich")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, locationVisibility === "exact" && styles.chipActive]}
                    onPress={() => setLocationVisibility("exact")}
                  >
                    <Text style={[styles.chipText, locationVisibility === "exact" && styles.chipTextActive]}>
                      {t("marketplace.exact", "Genaue Adresse")}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>
                  {t("marketplace.publicLabel", "Öffentliche Ortsangabe")}
                  {status === "published" && locationVisibility === "approximate" && <Text style={styles.required}> *</Text>}
                </Text>
                <TextInput
                  style={styles.input}
                  value={publicLocationLabel}
                  onChangeText={setPublicLocationLabel}
                  placeholder={isProduct ? "e.g. Berlin" : "e.g. Berlin-Mitte"}
                  placeholderTextColor={COLORS.textDisabled}
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
