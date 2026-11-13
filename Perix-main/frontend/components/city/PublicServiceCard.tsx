import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import BusinessMap from "../BusinessMap";
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from "../../lib/designTokens";
import { PublicService, PUBLIC_SERVICE_THEME as theme, publicServiceMarkers } from "../../lib/city/publicServices";
import { getPublicServiceImages } from "../../lib/city/publicServiceImages";
import { useTranslation } from "react-i18next";
import "../../i18n/city";

function WebLink({ label, url }: { label: string; url: string | null | undefined }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => { void Linking.openURL(url).catch(() => {}); }} style={styles.link}>
    <Ionicons name="open-outline" size={16} color={theme.blue} /><Text style={styles.linkText}>{label}</Text>
  </Pressable>;
}

function ContactLink({ label, value, kind }: { label: string; value: string; kind: "tel" | "mailto" }) {
  const href = kind === "tel" ? `tel:${value.replace(/[^+\d]/g, "")}` : `mailto:${value}`;
  return <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${value}`} onPress={() => { void Linking.openURL(href).catch(() => {}); }} style={styles.link}>
    <Ionicons name={kind === "tel" ? "call-outline" : "mail-outline"} size={17} color={theme.blue} />
    <Text style={styles.linkText}>{value}</Text>
  </Pressable>;
}

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

function sectionTitle(language: string, key: "about" | "services" | "contact" | "hours" | "notices" | "location" | "sources" | "other") {
  const copy = {
    about: ["Περιγραφή", "Beschreibung", "About"],
    services: ["Αρμοδιότητες / υπηρεσίες", "Aufgaben / Leistungen", "Services"],
    contact: ["Επικοινωνία", "Kontakt", "Contact"],
    hours: ["Ωράριο", "Öffnungszeiten", "Opening hours"],
    notices: ["Σημαντικές πληροφορίες", "Hinweise", "Important notices"],
    location: ["Τοποθεσία", "Standort", "Location"],
    sources: ["Πηγές & διαφάνεια", "Quellen & Transparenz", "Sources & transparency"],
    other: ["Πρόσθετα στοιχεία", "Weitere Angaben", "Additional information"],
  }[key];
  const index = language === "el" ? 0 : language === "de" ? 1 : 2;
  return copy[index];
}

function fieldLabel(language: string, key: "website" | "address" | "phone" | "email" | "visitor" | "telephoneHours" | "hoursScope" | "verified" | "rights" | "sourceRecord" | "mapPending" | "mapReview" | "mapApproved" | "coordinateSource" | "notOfficial") {
  const copy = {
    website: ["Επίσημη ιστοσελίδα", "Offizielle Website", "Official website"],
    address: ["Διεύθυνση", "Adresse", "Address"],
    phone: ["Τηλέφωνο", "Telefon", "Phone"],
    email: ["Email", "E-Mail", "Email"],
    visitor: ["Ενημέρωση επισκεπτών", "Besucherhinweis", "Visitor notice"],
    telephoneHours: ["Ώρες τηλεφωνικής εξυπηρέτησης", "Telefonische Sprechzeiten", "Telephone hours"],
    hoursScope: ["Σημείωση ωραρίου", "Hinweis zu den Öffnungszeiten", "Hours note"],
    verified: ["Επαλήθευση πηγής", "Quellenprüfung", "Source checked"],
    rights: ["Όροι / δικαιώματα πηγής", "Quellen- und Nutzungsbedingungen", "Source terms / rights"],
    sourceRecord: ["Επίσημη καταχώριση", "Offizieller Eintrag", "Official record"],
    mapPending: ["Η πινέζα θα εμφανιστεί όταν προστεθούν επιβεβαιωμένες συντεταγμένες.", "Die Kartenmarkierung erscheint, sobald bestätigte Koordinaten vorliegen.", "A map pin will appear when verified coordinates are added."],
    mapReview: ["Οι υποψήφιες συντεταγμένες είναι κρυφές μέχρι να ελεγχθούν η θέση και οι όροι χρήσης.", "Vorgeschlagene Koordinaten bleiben verborgen, bis Standort und Nutzungsbedingungen geprüft sind.", "Candidate coordinates stay hidden until the location and reuse terms are reviewed."],
    mapApproved: ["Η θέση εγκρίθηκε μετά τον τελευταίο έλεγχο.", "Standort nach der letzten Prüfung freigegeben.", "Location approved after the latest review."],
    coordinateSource: ["Πηγή συντεταγμένων", "Koordinatenquelle", "Coordinate source"],
    notOfficial: ["Το PERIX είναι ανεξάρτητος ενημερωτικός κατάλογος, όχι επίσημη κυβερνητική ιστοσελίδα. Επιβεβαίωσε τα δεσμευτικά στοιχεία στον αρμόδιο φορέα.", "PERIX ist ein unabhängiges Informationsverzeichnis, keine offizielle Behördenseite. Verbindliche Angaben bitte bei der zuständigen Stelle prüfen.", "PERIX is an independent information directory, not an official government website. Confirm binding details with the relevant authority."],
  }[key];
  return copy[language === "el" ? 0 : language === "de" ? 1 : 2];
}

export function PublicServiceCard({ service, full = false, showMap = true, onPress }: { service: PublicService; full?: boolean; showMap?: boolean; onPress?: () => void }) {
  const { t, i18n } = useTranslation("city");
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const description = language === "el" ? service.description_el || service.description_en || service.description_de
    : language === "de" ? service.description_de || service.description_en || service.description_el
      : service.description_en || service.description_de || service.description_el;
  const visitorNotice = language === "el" ? service.visitor_notice_el || service.visitor_notice_en || service.visitor_notice_de
    : language === "de" ? service.visitor_notice_de || service.visitor_notice_en || service.visitor_notice_el
      : service.visitor_notice_en || service.visitor_notice_de || service.visitor_notice_el;
  const supportedServices = language === "el" ? service.services_supported_el?.length ? service.services_supported_el : service.services_supported_en?.length ? service.services_supported_en : service.services_supported_de
    : language === "de" ? service.services_supported_de?.length ? service.services_supported_de : service.services_supported_en?.length ? service.services_supported_en : service.services_supported_el
      : service.services_supported_en?.length ? service.services_supported_en : service.services_supported_de?.length ? service.services_supported_de : service.services_supported_el;
  const categoryLabel = language === "el" ? service.subcategory_label_el || service.category_label_el
    : language === "de" ? service.subcategory_label_de || service.category_label_de
      : service.subcategory_label_en || service.category_label_en;
  const localImages = getPublicServiceImages(service.source_record_id, service.profile_image_asset, service.cover_image_asset);
  const coverImage = service.cover_image_url ? { uri: service.cover_image_url } : localImages?.cover;
  const profileImage = service.profile_image_url ? { uri: service.profile_image_url } : localImages?.profile;
  const marker = publicServiceMarkers([service]);
  const hasCoordinates = marker.length > 0;
  const mapRegion = hasCoordinates
    ? { latitude: service.latitude!, longitude: service.longitude!, latitudeDelta: 0.012, longitudeDelta: 0.012 }
    : { latitude: 52.14, longitude: 11.635, latitudeDelta: 0.16, longitudeDelta: 0.23 };
  const content = <>
    <View style={styles.cover}>
      {coverImage ? <Image source={coverImage} style={styles.coverImage} contentFit="cover" accessibilityLabel={service.name} />
        : <View style={styles.coverPlaceholder}><Ionicons name="business-outline" size={38} color={theme.navy} /><Text style={styles.kind}>{t("source.0")}</Text></View>}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          {profileImage ? <Image source={profileImage} style={styles.avatarImage} contentFit="cover" accessibilityLabel={service.name} />
            : <Ionicons name="business-outline" size={26} color={theme.navy} />}
        </View>
        <View style={styles.identityText}>
          <Text style={styles.title}>{service.name}</Text>
          {!!categoryLabel && <Text style={styles.category}>{categoryLabel}</Text>}
        </View>
      </View>
    </View>
    {service.visual_is_illustration && <Text style={styles.illustrationNote}>{language === "el" ? "Εικαστικό PERIX — όχι επαληθευμένη φωτογραφία της πρόσοψης" : language === "de" ? "PERIX-Illustration — keine verifizierte Gebäudefotografie" : "PERIX illustration — not a verified photo of the building"}</Text>}
    {!!service.address && <Text style={styles.address}>{service.address}</Text>}
    {service.latitude == null && !full && <Text style={styles.note}>{service.coordinate_review_status === "review_required" ? fieldLabel(language, "mapReview") : fieldLabel(language, "mapPending")}</Text>}
    {full && <>
      {description && <View style={styles.section}><Text style={styles.sectionTitle}>{sectionTitle(language, "about")}</Text><Text style={styles.body}>{description}</Text></View>}
      {!!supportedServices?.length && <View style={styles.section}><Text style={styles.sectionTitle}>{sectionTitle(language, "services")}</Text>
        {supportedServices.map((item, index) => <View key={`${index}:${item}`} style={styles.bullet}><Ionicons name="checkmark-circle-outline" size={17} color={theme.blue} /><Text style={styles.body}>{item}</Text></View>)}
      </View>}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle(language, "contact")}</Text>
        {service.phone && <ContactLink label={fieldLabel(language, "phone")} value={service.phone_display || service.phone} kind="tel" />}
        {service.phone_scope && <Text style={styles.note}>{service.phone_scope}</Text>}
        {(service.additional_phones || []).map((phone, index) => <ContactLink key={`${phone}:${index}`} label={fieldLabel(language, "phone")} value={phone} kind="tel" />)}
        {service.email && <ContactLink label={fieldLabel(language, "email")} value={service.email} kind="mailto" />}
        {service.email_scope && <Text style={styles.note}>{service.email_scope}</Text>}
        {(service.additional_emails || []).map((email, index) => <ContactLink key={`${email}:${index}`} label={fieldLabel(language, "email")} value={email} kind="mailto" />)}
        <WebLink label={fieldLabel(language, "website")} url={service.website} />
      </View>
      {(service.opening_hours || service.telephone_hours || service.opening_hours_scope) && <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle(language, "hours")}</Text>
        {service.opening_hours && <Text style={styles.body}>{service.opening_hours}</Text>}
        {service.opening_hours_scope && <Text style={styles.note}>{fieldLabel(language, "hoursScope")}: {service.opening_hours_scope}</Text>}
        {service.telephone_hours && <Text style={styles.body}>{fieldLabel(language, "telephoneHours")}: {service.telephone_hours}</Text>}
      </View>}
      {(visitorNotice || service.special_notice) && <View style={styles.notice}>
        <Text style={styles.sectionTitle}>{sectionTitle(language, "notices")}</Text>
        {visitorNotice && <Text style={styles.body}>{fieldLabel(language, "visitor")}: {visitorNotice}</Text>}
        {service.special_notice && <Text style={styles.body}>{service.special_notice}</Text>}
      </View>}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle(language, "location")}</Text>
        {service.address && <Text style={styles.body}>{service.address}</Text>}
        {!hasCoordinates && <Text style={styles.note}>{service.coordinate_review_status === "review_required" ? fieldLabel(language, "mapReview") : fieldLabel(language, "mapPending")}</Text>}
        {service.coordinate_review_status === "approved" && <Text style={styles.note}>{fieldLabel(language, "mapApproved")}</Text>}
        {hasCoordinates && <Text style={styles.note}>{service.latitude!.toFixed(6)}, {service.longitude!.toFixed(6)}</Text>}
        {service.geo_status && service.coordinate_review_status !== "approved" && <Text style={styles.note}>{service.geo_status}</Text>}
        {service.coordinate_match_type && <Text style={styles.note}>{service.coordinate_match_type}</Text>}
        {service.coordinate_osm_id && <Text style={styles.note}>{service.coordinate_osm_id}</Text>}
        {service.coordinate_manual_review_required && service.coordinate_review_status !== "approved" && <Text style={styles.note}>{service.coordinate_manual_review_required}</Text>}
        {service.coordinate_source_license && <Text style={styles.note}>{service.coordinate_source_license}</Text>}
        <WebLink label={fieldLabel(language, "coordinateSource")} url={service.coordinate_source_url} />
        {service.coordinate_source_license?.toLowerCase().includes("openstreetmap") &&
          <WebLink label="© OpenStreetMap contributors · ODbL" url="https://www.openstreetmap.org/copyright" />}
        {showMap && <View style={styles.map}>
          <BusinessMap initialRegion={mapRegion} markers={marker} height={260} horizontalInset={0} />
        </View>}
      </View>
      {!!Object.keys(service.additional_fields || {}).length && <View style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionTitle(language, "other")}</Text>
        {Object.entries(service.additional_fields || {}).map(([label, value]) => {
          const text = valueText(value);
          return text ? <Text key={label} style={styles.body}>{label.replace(/[_-]+/g, " ")}: {text}</Text> : null;
        })}
      </View>}
      <View style={styles.provenance}>
        <Text style={styles.sectionTitle}>{sectionTitle(language, "sources")}</Text>
        <Text style={styles.note}>{t("source.4")}</Text>
        {service.source_provider && <Text style={styles.body}>{t("source.5")}: {service.source_provider}</Text>}
        {service.source_verification_date && <Text style={styles.note}>{fieldLabel(language, "verified")}: {service.source_verification_date}</Text>}
        {(service.sources || []).map((source, index) => <View key={`${source.source_dataset_url}:${index}`} style={styles.source}>
          <Text style={styles.body}>{t("source.5")}: {source.source_provider}</Text>
          {source.source_reference_period && <Text style={styles.note}>{t("source.6")}: {source.source_reference_period}</Text>}
          {source.source_published_at && <Text style={styles.note}>{t("source.7")}: {source.source_published_at}</Text>}
          {source.source_last_updated_at && <Text style={styles.note}>{t("source.8")}: {source.source_last_updated_at}</Text>}
          {source.data_collected_at && <Text style={styles.note}>{t("source.9")}: {source.data_collected_at}</Text>}
          <WebLink label={source.source_provider} url={source.source_provider_url} />
          <WebLink label={fieldLabel(language, "sourceRecord")} url={source.source_record_url || source.source_dataset_url} />
          {service.official_source_urls?.filter(url => url !== source.source_record_url && url !== source.source_dataset_url).map((url, sourceIndex) =>
            <WebLink key={`${url}:${sourceIndex}`} label={`${fieldLabel(language, "sourceRecord")} ${sourceIndex + 2}`} url={url} />)}
          <WebLink label={fieldLabel(language, "rights")} url={service.source_rights_url || source.source_credits_url} />
          <WebLink label={t("source.11")} url={source.source_credits_url} />
          <WebLink label={t("source.12")} url={source.source_license_url} />
          {source.source_license_id && <Text style={styles.note}>{language === "el" ? "Καθεστώς όρων επαναχρησιμοποίησης" : language === "de" ? "Status der Nutzungsbedingungen" : "Reuse terms status"}: {source.source_license_id}</Text>}
          <Text style={styles.note}>{source.attribution}</Text>
          <Text style={styles.note}>{source.modifications}</Text>
          {source.source_locator && <Text style={styles.note}>{source.source_locator}</Text>}
        </View>)}
        {service.licensing_note && <Text style={styles.note}>{service.licensing_note}</Text>}
        {service.independent_directory_disclaimer_el || service.independent_directory_disclaimer_de || service.independent_directory_disclaimer_en
          ? <Text style={styles.note}>{language === "el" ? service.independent_directory_disclaimer_el || service.independent_directory_disclaimer_en
            : language === "de" ? service.independent_directory_disclaimer_de || service.independent_directory_disclaimer_en
              : service.independent_directory_disclaimer_en || service.independent_directory_disclaimer_de}</Text>
          : <Text style={styles.note}>{fieldLabel(language, "notOfficial")}</Text>}
      </View>
    </>}
  </>;

  return onPress && !full ? <Pressable accessibilityRole="button" accessibilityLabel={`${t("source.13")} ${service.name}`} onPress={onPress} style={styles.card}>{content}</Pressable>
    : <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: { padding: SPACING.std, borderRadius: BORDER_RADIUS.card, borderWidth: 1.5, borderColor: COLORS.pinHotel, backgroundColor: "#fff", gap: SPACING.small, marginBottom: SPACING.small },
  cover: { gap: SPACING.small }, coverImage: { width: "100%", height: 150, borderRadius: BORDER_RADIUS.button },
  coverPlaceholder: { height: 112, borderRadius: BORDER_RADIUS.button, backgroundColor: theme.ivory, alignItems: "center", justifyContent: "center", gap: 8 },
  illustrationNote: { color: "#59616A", fontSize: FONT_SIZES.micro, lineHeight: 18 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 }, identityText: { flex: 1, gap: 4 },
  avatar: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E4E0D7", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: "100%", height: "100%" }, kind: { fontSize: FONT_SIZES.micro, color: theme.navy },
  title: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: theme.navy }, category: { color: theme.blue, fontSize: FONT_SIZES.bodySmall, fontWeight: "600" },
  address: { color: COLORS.textPrimary, lineHeight: 22 }, body: { lineHeight: 23, color: COLORS.textPrimary }, note: { color: "#59616A", fontSize: FONT_SIZES.bodySmall, lineHeight: 21 },
  section: { gap: 7, marginTop: SPACING.std }, sectionTitle: { fontSize: FONT_SIZES.body, fontWeight: "700", color: theme.navy },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: 8 }, notice: { gap: 7, marginTop: SPACING.std, padding: SPACING.std, borderRadius: BORDER_RADIUS.button, backgroundColor: "#FFF9EB", borderWidth: 1, borderColor: "#F0E2BF" },
  map: { overflow: "hidden", borderRadius: BORDER_RADIUS.button, borderWidth: 1, borderColor: COLORS.divider, marginTop: 4 },
  link: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 8 }, linkText: { color: theme.blue, textDecorationLine: "underline", flexShrink: 1 },
  provenance: { marginTop: SPACING.large, borderTopWidth: 1, borderTopColor: "#E7EAF0", paddingTop: SPACING.std, gap: SPACING.small },
  source: { gap: SPACING.small, marginBottom: SPACING.std },
});
