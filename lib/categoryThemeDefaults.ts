export const CATEGORY_THEME_DEFAULTS: Record<string, string> = {
  'sports-fitness-wellness': 'Emerald Green',
  'fashion-accessories': 'Rose Pink',
  'beauty-care': 'Rose Pink',
  'entertainment-events': 'Vibrant Violet',
  'nightlife-social': 'Royal Purple',
  'professional-services': 'Teal & Navy',
  'education-creativity': 'Ocean Blue',
  'food-dining': 'Sunset Orange',
  'rentals': 'Teal & Navy',
  'rental-real-estate': 'Teal & Navy',
  'shopping-retail': 'Lavender',
  'healthcare': 'Ice Blue',
  'pets': 'Earthy Brown',
  'travel-accommodation': 'Ocean Blue',
  'automotive': 'Deep Red',
};

export const COLOR_PRESETS_MAP: Record<string, Record<string, string>> = {
  'Royal Purple':     { background: '#F3E8FF', primary: '#6A11CB', secondary: '#8E2DE2', text: '#1A0033', accent: '#C77DFF', gradient: 'linear(135deg, #6A11CB, #8E2DE2)' },
  'Gold & Black':     { background: '#111111', primary: '#D4AF37', secondary: '#FFD700', text: '#FFF3CC', accent: '#333333', gradient: 'linear(135deg, #D4AF37, #FFD700)' },
  'Ocean Blue':       { background: '#CAF0F8', primary: '#0077B6', secondary: '#00B4D8', text: '#023047', accent: '#90E0EF', gradient: 'linear(135deg, #0077B6, #00B4D8)' },
  'Emerald Green':    { background: '#D1FAE5', primary: '#2ECC71', secondary: '#27AE60', text: '#14532D', accent: '#A8E6CF', gradient: 'linear(135deg, #2ECC71, #27AE60)' },
  'Sunset Orange':    { background: '#FFF5E1', primary: '#FF6B35', secondary: '#FFD166', text: '#7A2E00', accent: '#FEE9A6', gradient: 'linear(135deg, #FF6B35, #FFD166)' },
  'Rose Pink':        { background: '#FCE4EC', primary: '#E91E63', secondary: '#F06292', text: '#880E4F', accent: '#F8BBD0', gradient: 'linear(135deg, #E91E63, #F06292)' },
  'Teal & Navy':      { background: '#E0FBFC', primary: '#008080', secondary: '#0A9396', text: '#001219', accent: '#94D2BD', gradient: 'linear(135deg, #008080, #0A9396)' },
  'Vibrant Violet':   { background: '#E6CCFF', primary: '#7B2CBF', secondary: '#9D4EDD', text: '#240046', accent: '#C77DFF', gradient: 'linear(135deg, #7B2CBF, #9D4EDD)' },
  'Earthy Brown':     { background: '#F5EFE6', primary: '#8B5E3C', secondary: '#A47148', text: '#3E2C1C', accent: '#D7B999', gradient: 'linear(135deg, #8B5E3C, #A47148)' },
  'Ice Blue':         { background: '#F0FBFC', primary: '#00C4CC', secondary: '#90E0EF', text: '#023047', accent: '#CAF0F8', gradient: 'linear(135deg, #00C4CC, #90E0EF)' },
  'Deep Red':         { background: '#FFF5F5', primary: '#C1121F', secondary: '#780000', text: '#2B0000', accent: '#FDF0D5', gradient: 'linear(135deg, #C1121F, #780000)' },
  'Lavender':         { background: '#F8F4FF', primary: '#9381FF', secondary: '#CDB4DB', text: '#3C096C', accent: '#EADBF8', gradient: 'linear(135deg, #9381FF, #CDB4DB)' },
};

export function getDefaultThemeForCategory(rootCategory?: string): string | null {
  if (!rootCategory) return null;
  return CATEGORY_THEME_DEFAULTS[rootCategory] ?? null;
}

export function getThemeColorsForCategory(rootCategory?: string): Record<string, string> | null {
  const presetName = getDefaultThemeForCategory(rootCategory);
  if (!presetName) return null;
  return COLOR_PRESETS_MAP[presetName] ?? null;
}
