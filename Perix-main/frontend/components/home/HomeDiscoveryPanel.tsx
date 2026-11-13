import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { getCategoryTree, ACTIVITY_TYPES, EVENT_THEMES, type CategoryGroup } from "../../lib/api";
import { SERVICE_MODULES } from "../../lib/config/serviceModules";
import { MARKETPLACE_CATEGORIES } from "../../lib/marketplace/marketplaceTaxonomy";
import { businessChildren, DISCOVERY_SECTIONS, type DiscoveryFilter, type DiscoveryResult, type DiscoverySection } from "../../lib/home/discovery";
import { COLORS } from "../../lib/designTokens";
import { LOCATOR_FONT_FAMILY } from "../../lib/designTokens";
import { translateCategory } from "../../lib/categoryTranslation";
import { entityRoutes, getRentalNavigationId, pushEntityRoute, showInvalidEntityAlert } from "../../lib/navigation/entityRoutes";
import { illustratedIconSource } from "../icons/IllustratedIcon";
import ProgressivePicker from "../navigation/ProgressivePicker";
import DatePickerModal from "../shared/DatePickerModal";
import LocatorCard from "../locator/LocatorCard";

type Props = {
  token: string | null; section: DiscoverySection; filter: DiscoveryFilter; results: DiscoveryResult[];
  loading: boolean; error: boolean; onRetry: () => void;
  onSection: (section: DiscoverySection) => void; onFilter: (filter: DiscoveryFilter) => void;
};
const LABELS = ["Businesses", "Events", "Activities", "Jobs", "Services", "Products", "Rentals", "Hotels"];

export default function HomeDiscoveryPanel({ token, section, filter, results, loading, error, onRetry, onSection, onFilter }: Props) {
  const { t } = useTranslation(), router = useRouter();
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [categoryError, setCategoryError] = useState(false), [taxonomyRetry, setTaxonomyRetry] = useState(0);
  const [dates, setDates] = useState(false), [limit, setLimit] = useState(12);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setCategories([]); setCategoryError(false);
    getCategoryTree(token).then(value => { if (active) setCategories(value); }).catch(() => { if (active) setCategoryError(true); });
    return () => { active = false; };
  }, [token, taxonomyRetry]);
  useEffect(() => { setLimit(12); setDates(false); }, [section, filter]);
  const all = { key: "", label: t("common.all", "All") };
  const categoryOptions = useMemo(() => {
    if (section === "events") return Object.entries(EVENT_THEMES).map(([key, value]) => ({ key, label: t(`events.themes.${key}`, value.label) }));
    if (section === "activities") return [...new Set(Object.values(ACTIVITY_TYPES).map(value => value.category))].map(key => ({ key, label: t(`activities.categories.${key}`, key.replace(/_/g, " ")) }));
    if (section === "services") return Object.values(SERVICE_MODULES).map(value => ({ key: value.key, label: t(value.labelKey, value.fallbackLabel), iconSource: illustratedIconSource("service-module", value.key) }));
    if (section === "products") return MARKETPLACE_CATEGORIES.map(value => ({ key: value.key, label: t(value.labelKey, value.fallback), iconSource: illustratedIconSource("marketplace-parent", value.key) }));
    if (section === "rentals") return ["apartment", "house", "studio", "room", "commercial"].map(key => ({ key, label: translateCategory(key, t), iconSource: illustratedIconSource("property-type", key) }));
    if (section === "hotels") return businessChildren(categories, "local-hotels").map(value => ({ key: value.slug, label: translateCategory(value.slug, t), iconSource: illustratedIconSource("business-subcategory", value.slug) }));
    return categories.map(value => ({ key: value.slug, label: translateCategory(value.slug, t), iconSource: illustratedIconSource("business-root", value.slug) }));
  }, [section, categories, t]);
  const children = section === "businesses" ? businessChildren(categories, filter.category).map(value => ({ key: value.slug, label: translateCategory(value.slug, t), iconSource: illustratedIconSource("business-subcategory", value.slug) })) : [];
  const open = (result: DiscoveryResult) => {
    switch (result.kind) {
      case "businesses": case "hotels": router.push(`/business/${encodeURIComponent(result.id)}` as never); break;
      case "events": router.push(`/event/${encodeURIComponent(result.id)}` as never); break;
      case "activities": router.push(`/activity/${encodeURIComponent(result.id)}` as never); break;
      case "jobs": pushEntityRoute(router, entityRoutes.job(result.id), () => showInvalidEntityAlert(t)); break;
      case "services": pushEntityRoute(router, entityRoutes.service(result.id), () => showInvalidEntityAlert(t)); break;
      case "products": case "ownerHomes": pushEntityRoute(router, entityRoutes.listing(result.id), () => showInvalidEntityAlert(t)); break;
      case "rentals": pushEntityRoute(router, (result.data as { source_type?: string }).source_type === "owner"
        ? entityRoutes.listing(getRentalNavigationId(result.data)) : entityRoutes.rental(getRentalNavigationId(result.data)), () => showInvalidEntityAlert(t)); break;
    }
  };
  return <View style={styles.panel} testID="home-discovery-panel">
    <ProgressivePicker label={t("common.section", "Section")} value={section} primaryColor="#59ABE3"
      options={DISCOVERY_SECTIONS.map((key, index) => ({ key, label: t(`home.${key}`, LABELS[index]), iconSource: illustratedIconSource("home", key) }))}
      onChange={onSection} />
    <TextInput testID="home-discovery-search" accessibilityLabel={t("common.search", "Search")} placeholder={t("common.search", "Search")}
      value={filter.query} onChangeText={query => onFilter({ ...filter, query })} style={styles.search} />
    <ProgressivePicker label={section === "businesses" ? t("common.category", "Category") : t("common.filter", "Filter")}
      value={section === "hotels" ? filter.subcategory : filter.category} options={[all, ...categoryOptions]} primaryColor="#59ABE3"
      onChange={category => onFilter(section === "hotels" ? { ...filter, subcategory: category } : { ...filter, category, subcategory: "" })} />
    {section === "businesses" && !!filter.category && children.length > 0 && <ProgressivePicker
      label={t("common.subcategory", "Subcategory")} value={filter.subcategory} options={[all, ...children]} primaryColor="#59ABE3"
      onChange={subcategory => onFilter({ ...filter, subcategory })} />}
    {categoryError && ["businesses", "jobs", "hotels"].includes(section) && <Pressable onPress={() => setTaxonomyRetry(value => value + 1)}>
      <Text style={styles.message}>{t("common.retry", "Retry")} — {t("common.category", "Category")}</Text>
    </Pressable>}
    {(section === "events" || section === "activities") && <>
      <Pressable style={styles.date} onPress={() => setDates(true)} accessibilityRole="button">
        <Text style={styles.text}>{filter.startDate || filter.endDate
          ? `${filter.startDate || "…"} – ${filter.endDate || "…"}`
          : section === "events" ? t("locator.next7Days", "Next 7 days") : t("common.date", "Date")}</Text>
      </Pressable>
      <DatePickerModal visible={dates} mode="range" value={filter} onClose={() => setDates(false)}
        onApply={value => { onFilter({ ...filter, ...value }); setDates(false); }}
        onReset={() => { onFilter({ ...filter, startDate: null, endDate: null }); setDates(false); }} />
    </>}
    {loading ? <ActivityIndicator accessibilityLabel={t("common.loading", "Loading")} /> : error ? <Pressable onPress={onRetry} accessibilityRole="button">
      <Text style={styles.message}>{t("common.error", "Error")} · {t("common.retry", "Retry")}</Text>
    </Pressable> : <>
      <Text style={styles.message}>{results.length ? `${results.length} ${t("common.results", "results")}` : t("common.noResults", "No results found")}</Text>
      <ScrollView style={styles.results} nestedScrollEnabled>
        {results.slice(0, limit).map(result => {
          const onPress = () => open(result);
          if (result.kind === "businesses" || result.kind === "hotels") return <LocatorCard key={result.key} type="business" data={result.data} distance={null} isOpen={null} onPress={onPress} />;
          if (result.kind === "events") return <LocatorCard key={result.key} type="event" data={result.data} distance={null} onPress={onPress} />;
          if (result.kind === "activities") return <LocatorCard key={result.key} type="activity" data={result.data} distance={null} onPress={onPress} />;
          const row = result.data as unknown as Record<string, any>;
          const photo = row.cover_image_url || row.cover_image || row.image_urls?.[0] || row.gallery_images?.[0];
          return <Pressable key={result.key} style={styles.card} onPress={onPress} accessibilityRole="button">
            {photo && <Image source={{ uri: photo }} style={styles.photo} />}
            <View style={{ flex: 1 }}><Text style={styles.title}>{row.title || row.name}</Text>
              {!!(row.address || row.public_location_label) && <Text style={styles.text} numberOfLines={2}>{row.address || row.public_location_label}</Text>}
              {!!(row.price || row.rent_price || row.salary) && <Text style={styles.text}>{row.price || row.rent_price || row.salary}</Text>}
            </View>
          </Pressable>;
        })}
        {results.length > limit && <Pressable style={styles.date} onPress={() => setLimit(value => value + 12)}><Text style={styles.text}>{t("common.showMore", "Show more")}</Text></Pressable>}
      </ScrollView>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginBottom: 20 },
  search: { marginVertical: 8, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, color: COLORS.textPrimary, backgroundColor: COLORS.background, fontFamily: LOCATOR_FONT_FAMILY.regular },
  date: { padding: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginVertical: 8 },
  message: { color: COLORS.textSecondary, paddingVertical: 10, fontFamily: LOCATOR_FONT_FAMILY.regular },
  results: { maxHeight: 420 },
  card: { flexDirection: "row", gap: 12, padding: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  photo: { width: 72, height: 72, borderRadius: 8 }, title: { fontWeight: "700", color: COLORS.textPrimary, fontSize: 15, fontFamily: LOCATOR_FONT_FAMILY.semibold },
  text: { color: COLORS.textPrimary, fontSize: 13, fontFamily: LOCATOR_FONT_FAMILY.regular },
});
