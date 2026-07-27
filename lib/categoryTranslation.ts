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
