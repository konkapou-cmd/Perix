import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

export const CATEGORY_ICONS: Record<string, IconName> = {
  // Root categories
  food: "restaurant",
  drinks: "wine",
  music: "musical-notes",
  nightlife: "moon",
  sports: "fitness",
  beauty: "rose",
  health: "medkit",
  education: "school",
  shopping: "bag",
  technology: "hardware-chip",
  automotive: "car",
  realestate: "home",
  "rental-real-estate": "home",
  professional: "briefcase",
  pets: "paw",
  travel: "airplane",
  rentals: "home",
  // Subcategory-level slugs
  "sports-fitness-wellness": "fitness",
  "fashion-accessories": "shirt",
  "beauty-care": "rose",
  "entertainment-events": "ticket",
  "nightlife-social": "wine",
  "food-dining": "restaurant",
  "education-creativity": "school",
  "professional-services": "briefcase",
  "shopping-retail": "bag",
  healthcare: "medkit",
  arts: "color-palette",
  community: "people",
  entertainment: "ticket",
  fashion: "shirt",
  home: "home",
  other: "grid",
};

export const categoryIcon = (slug: string): IconName =>
  CATEGORY_ICONS[slug] || "grid";

const SUBICON_RULES: [RegExp, IconName][] = [
  [/gym|crossfit|functional|personal-train|pilates|yoga|group-fitness|fitness/, "barbell"],
  [/team-sport|racket|swim|martial|climb|cycling|run|water-sport|winter-sport|extreme|sports|sport/, "football"],
  [/physio|rehab|massage|recovery|wellness|meditation/, "leaf"],
  [/hotel|guesthouse|hostel/, "bed"],
  [/apartment|houses|studios|rooms|real-estate|property/, "home"],
  [/casual-wear|formal-wear|sportswear|children|vintage|thrift|clothing|wear|tailoring/, "shirt"],
  [/sneaker|shoes|footwear/, "footsteps"],
  [/jewel|watch|sunglass|bag|leather|luxury|accessories/, "diamond"],
  [/cinema|theatre|stand-up|comedy|cultural|exhibit|escape|vr-|arcade|bowling|billiard|playground|family-activ|venue|concert/, "ticket"],
  [/dj|band|singer|comedian|magician|dancer|actor|mc|host|cultural-group|artist/, "mic"],
  [/cocktail|wine-bar|beer|sports-bar|rock-bar|jazz|folk|live-music|dj-club|dance-club|after-hours|bar|club/, "wine"],
  [/law|account|tax|insur|consult|marketing|translation|it-service|software|web-design|legal|financial|tech/, "briefcase"],
  [/hair|barber|nail|derma|laser|facial|spa|makeup|tanning|salon|skin/, "rose"],
  [/tutor|language-school|music-school|dance-school|art-workshop|school|academic|creative/, "school"],
  [/dining|buffet|food-court|italian|asian|greek|balkan|german|african|american|arabic|japanese|chinese|korean|thai|mexican|indian|mediterranean|seafood|steak|vegan|vegetarian|brunch|pizza|burger|cafe|coffee|bakery|cuisine|restaurant|food/, "restaurant"],
  [/electronics|home-goods|furniture|books|stationery|florist|gift|souvenir|shopping|retail|store/, "bag"],
  [/car|auto|repair|wash|vehicle/, "car"],
  [/doctor|dentist|clinic|pharma|mental-health|health/, "medkit"],
  [/veterinar|pet/, "paw"],
  [/rental/, "key"],
];

export const subcategoryIcon = (slug: string): IconName => {
  if (!slug) return "ellipsis-horizontal";
  const existing = CATEGORY_ICONS[slug];
  if (existing) return existing;
  for (const [re, icon] of SUBICON_RULES) {
    if (re.test(slug)) return icon;
  }
  return "pricetag";
};
