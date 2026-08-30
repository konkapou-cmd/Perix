import { TFunction } from "i18next";

/**
 * Translates a category or subcategory slug to the localized name.
 * Falls back to formatted slug if translation not found.
 */
export const translateCategory = (slug: string | undefined, t: TFunction): string => {
  if (!slug) return "";
  
  // Try to get translation from categories namespace
  const translationKey = `categories.${slug}`;
  const translated = t(translationKey);
  
  // If translation exists and is not the key itself, return it
  if (translated && translated !== translationKey) {
    return translated;
  }
  
  // Fallback: format the slug nicely (replace hyphens, capitalize words)
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Translates a category object (with name and slug) to localized name.
 */
export const translateCategoryObject = (
  category: { name: string; slug: string } | undefined,
  t: TFunction
): string => {
  if (!category) return "";
  return translateCategory(category.slug, t);
};

const toCamelCase = (value: string): string =>
  value
    .split("_")
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");

/**
 * Translates a service type (e.g. "salon_appointment") via the services.type* keys.
 * Falls back to the raw value when no translation exists.
 */
export const translateServiceType = (type: string | null | undefined, t: TFunction): string => {
  if (!type) return "";
  const camel = toCamelCase(type);
  const suffix = camel === "tailoringAlteration" ? "Tailoring" : camel.charAt(0).toUpperCase() + camel.slice(1);
  const key = `services.type${suffix}`;
  const translated = t(key);
  return translated && translated !== key ? translated : type;
};

/**
 * Translates a job type value (stored as German words: "Vollzeit", "Teilzeit", ...).
 */
export const translateJobType = (jobType: string | null | undefined, t: TFunction): string => {
  if (!jobType) return "";
  const key = `jobs.types.${jobType.toLowerCase()}`;
  const translated = t(key);
  return translated && translated !== key ? translated : jobType;
};

const JOB_TYPE_ICONS: Record<string, string> = {
  vollzeit: "briefcase",
  teilzeit: "briefcase-outline",
  vertrag: "document-text-outline",
  praktikum: "school-outline",
  remote: "laptop-outline",
};

export const jobTypeIcon = (jobType?: string | null): string =>
  JOB_TYPE_ICONS[(jobType || "").toLowerCase()] || "briefcase-outline";

/**
 * Translates a service option value (e.g. "hair", "makeup", "in_stock") via
 * the services.option.* keys. Falls back to a prettified version of the value.
 */
export const optionLabel = (option: string | null | undefined, t: TFunction): string => {
  if (!option) return "";
  const pretty = option.charAt(0).toUpperCase() + option.slice(1).replace(/_/g, " ");
  const key = `services.option.${option}`;
  const translated = t(key);
  return translated && translated !== key ? translated : pretty;
};
