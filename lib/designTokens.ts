// Design System Tokens
// Version 6.0 — Spec-aligned palette: blue #096BFF, orange #FF7A1A, purple #7B3FF2

export const COLORS = {
  // Brand — Blue
  primary: "#096BFF",
  primaryHover: "#2B8CFF",
  primaryDark: "#02169E",
  primaryLight: "#EAF5FF",
  secondary: "#2B8CFF",

  // Accent — Gold (for badges, bookmarks)
  accent: "#FFC400",
  accentSoft: "#FFF1B8",
  accentDark: "#9A6A00",

  // Text
  textPrimary: "#070A2E",
  textSecondary: "#6B7280",
  textMuted: "#6B7280",
  textDisabled: "#C8C2D4",
  textDark: "#374151",
  textGray: "#6B7280",
  textPlaceholder: "#9ca3af",
  textLight: "#FFFFFF",

  // Backgrounds
  background: "#FFFFFF",
  backgroundPage: "#F6F8FC",
  surfaceSoft: "#F6F8FC",
  surfaceMuted: "#f0f0f0",
  surfaceGray: "#f3f4f6",
  surfaceDark: "#1f2937",

  // Borders
  border: "#E7EAF0",
  borderGray: "#e5e7eb",
  borderLight: "#d1d5db",
  divider: "#E7EAF0",

  // Primary tints (for avatar fallback, chip backgrounds)
  primaryTint: "#EAF5FF",
  primaryTintDark: "#EAF5FF",
  indigoText: "#3730a3",

  // Semantic
  danger: "#DA4024",
  dangerLight: "#fee2e2",
  error: "#DA4024",
  errorLight: "#fecaca",
  errorBg: "#FDEBE8",
  errorText: "#DA4024",
  errorTitle: "#991B1B",
  errorDark: "#B91C1C",
  errorBorder: "#FDEBE8",
  warning: "#FFC400",
  warningLight: "#FFF1B8",
  info: "#096BFF",
  success: "#22C55E",

  // Header icon specific
  filterIcon: "#22C55E",
  filterIconBg: "#E6FCE9",

  // Status — badges
  online: "#35D05A",
  offline: "#C8C2D4",
  statusOpenBg: "#dcfce7",
  statusOpenText: "#166534",
  statusOpenDot: "#22c55e",
  statusClosedBg: "#fee2e2",
  statusClosedText: "#991b1b",

  // Entity accents — generic
  eventAccent: "#FF7A1A",
  activityAccent: "#FF7A1A",
  gold: "#FFC400",

  // Per-category accent colors
  eventsAccent: "#FF7A1A",
  activitiesAccent: "#FF7A1A",
  businessesAccent: "#096BFF",
  servicesAccent: "#7B3FF2",
  rentalsAccent: "#02A28E",
  jobsAccent: "#096BFF",
  postsAccent: "#096BFF",

  // Per-category background tints
  eventsBg: "#FFF5ED",
  activitiesBg: "#FFF5ED",
  businessesBg: "#F0F8FE",
  servicesBg: "#F5F0FE",
  rentalsBg: "#EEFDFB",
  jobsBg: "#F0F6FF",
  postsBg: "#F1F8FE",

  // Map pins
  pinBusiness: "#096BFF",
  pinEvent: "#FF7A1A",
  pinActivity: "#FF7A1A",
  pinJob: "#096BFF",
  pinRental: "#02A28E",
  pinClosed: "#000000",

  // Detail page — checklist green
  detailSuccess: "#22C55E",

  // Content / post accents
  mentionBlue: "#1d9bf0",
  textOnlyBg: "#f8f9fb",
  textOnlyBorder: "#e5e7eb",
  soundcloudOrange: "#FF5500",

  // Photo placeholders
  accentCoral: "#FF6B6B",
  accentViolet: "#7c3aed",
  liveGreenBorder: "#86efac",

  // Dark mode
  dark: {
    bgBase: "#02022A",
    bgSurface: "#0A0A2E",
    bgElevated: "#12123A",
    textPrimary: "#f9fafb",
    textSecondary: "#cbd5e1",
    textTertiary: "#94a3b8",
    border: "#1E1E4A",
    divider: "#0A0A2E",
  },
} as const;

export const SPACING = {
  tiny: 4,
  small: 8,
  gap: 10,
  compact: 12,
  std: 16,
  section: 20,
  page: 24,
  large: 32,
  major: 40,
} as const;

export const ICON_SIZES = {
  inline: 14,
  row: 18,
  interactive: 22,
  hero: 48,
} as const;

export const FONT_SIZES = {
  h1: 28,
  h2: 26,
  h3: 22,
  h4: 18,
  bodyLarge: 18,
  body: 17,
  bodySmall: 15,
  caption: 14,
  small: 13,
  micro: 12,
} as const;

export const FONT_WEIGHTS = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
};

export const BORDER_RADIUS = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
  card: 20,
  button: 16,
} as const;

export const SHADOWS = {
  subtle: {
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  medium: {
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 6,
  },
  strong: {
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },
  card: {
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  cardLight: {
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  overlay: {
    shadowColor: "#0A143C",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
} as const;

export interface CategoryServiceType {
  type: string;
  label: string;
  publicTabLabel: string;
  icon: string;
  requiresBooking: boolean;
  requiresSlots: boolean;
  requiresCoverPhoto: true;
  fields: string[];
}

export const CATEGORY_SERVICE_TYPES: Record<string, CategoryServiceType[]> = {
  "sports-fitness-wellness": [
    { type: "gym_class", label: "Class", publicTabLabel: "Classes", icon: "fitness", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["instructor", "difficulty_level", "session_type"] },
    { type: "gym_session", label: "Session", publicTabLabel: "Sessions", icon: "person", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["instructor", "session_type"] },
    { type: "gym_membership", label: "Membership", publicTabLabel: "Memberships", icon: "card", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["duration_days", "includes"] },
    { type: "gym_pass", label: "Pass", publicTabLabel: "Passes", icon: "ticket", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["visits_included", "valid_days"] },
    { type: "gym_recovery", label: "Recovery", publicTabLabel: "Recovery", icon: "medkit", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["treatment_type", "specialist_name"] },
  ],
  "beauty-care": [
    { type: "salon_appointment", label: "Appointment", publicTabLabel: "Appointments", icon: "calendar", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["specialist_name", "service_category"] },
    { type: "salon_package", label: "Package", publicTabLabel: "Packages", icon: "gift", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["included_services"] },
    { type: "salon_course", label: "Course", publicTabLabel: "Courses", icon: "layers", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["sessions_count", "duration_per_session"] },
  ],
  "professional-services": [
    { type: "pro_consultation", label: "Consultation", publicTabLabel: "Consultations", icon: "briefcase", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["consultation_type", "meeting_type", "duration_minutes"] },
    { type: "pro_package", label: "Package", publicTabLabel: "Packages", icon: "gift", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["duration_days", "includes"] },
    { type: "pro_retainer", label: "Retainer", publicTabLabel: "Retainers", icon: "refresh", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["duration_months", "includes"] },
  ],
  "education-creativity": [
    { type: "edu_class", label: "Class", publicTabLabel: "Classes", icon: "school", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["instructor", "difficulty_level", "session_type"] },
    { type: "edu_lesson", label: "Lesson", publicTabLabel: "Lessons", icon: "book", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["instructor", "difficulty_level", "session_type"] },
    { type: "edu_workshop", label: "Workshop", publicTabLabel: "Workshops", icon: "people", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["instructor", "difficulty_level", "capacity"] },
    { type: "edu_course", label: "Course", publicTabLabel: "Courses", icon: "layers", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["instructor", "difficulty_level", "duration_days", "sessions_count"] },
  ],
  "food-dining": [
    { type: "menu_item", label: "Menu Item", publicTabLabel: "Menu", icon: "restaurant", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["menu_category", "dietary_tags", "calories", "allergens", "spice_level"] },
    { type: "table_reservation", label: "Table", publicTabLabel: "Table Reservations", icon: "calendar", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["duration_minutes", "capacity"] },
  ],
  "rentals": [
    { type: "rental_property", label: "Property", publicTabLabel: "Rental Properties", icon: "home", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["bedrooms", "bathrooms", "size_sqm", "floor", "furnished", "available_from", "lease_duration", "max_guests", "address"] },
  ],
  "rental-real-estate": [
    { type: "rental_property", label: "Property", publicTabLabel: "Rental Properties", icon: "home", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["bedrooms", "bathrooms", "size_sqm", "floor", "furnished", "available_from", "lease_duration", "max_guests", "address"] },
  ],
  "nightlife-social": [
    { type: "table_reservation", label: "Table", publicTabLabel: "Table Reservations", icon: "calendar", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["max_guests", "special_requests"] },
    { type: "vip_package", label: "VIP", publicTabLabel: "VIP Packages", icon: "star", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["max_guests", "includes"] },
  ],
  "entertainment-events": [
    { type: "ent_booking", label: "Booking", publicTabLabel: "Bookings", icon: "calendar", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["capacity", "duration_minutes"] },
    { type: "ent_performance", label: "Performance", publicTabLabel: "Performances", icon: "mic", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["capacity", "duration_minutes", "instructor"] },
  ],
  "shopping-retail": [
    { type: "retail_product", label: "Product", publicTabLabel: "Products", icon: "pricetag", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["brand", "stock_status", "condition"] },
    { type: "retail_custom", label: "Custom Order", publicTabLabel: "Custom Orders", icon: "create", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["brand", "condition"] },
  ],
  "fashion-accessories": [
    { type: "retail_product", label: "Product", publicTabLabel: "Products", icon: "shirt", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["brand", "stock_status", "condition"] },
    { type: "tailoring_alteration", label: "Tailoring", publicTabLabel: "Tailoring", icon: "cut", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["duration_minutes"] },
    { type: "custom_order", label: "Custom", publicTabLabel: "Custom Orders", icon: "create", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["brand", "condition"] },
  ],
  "automotive": [
    { type: "auto_vehicle", label: "Vehicle", publicTabLabel: "Vehicles", icon: "car", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["make", "model", "year", "mileage_km", "fuel_type", "transmission"] },
    { type: "auto_rental", label: "Rental", publicTabLabel: "Rentals", icon: "calendar", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["make", "model", "year", "fuel_type", "transmission", "pickup_location", "dropoff_location"] },
    { type: "auto_repair", label: "Repair", publicTabLabel: "Repairs", icon: "wrench", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["make", "model", "year", "mileage_km"] },
    { type: "auto_wash", label: "Wash", publicTabLabel: "Wash", icon: "water", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["duration_minutes"] },
  ],
  "healthcare": [
    { type: "health_appointment", label: "Appointment", publicTabLabel: "Appointments", icon: "calendar", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["specialist_name", "reason_for_visit", "insurance_info"] },
    { type: "health_procedure", label: "Procedure", publicTabLabel: "Procedures", icon: "medkit", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["specialist_name", "duration_minutes"] },
    { type: "health_test", label: "Test", publicTabLabel: "Tests", icon: "flask", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["duration_minutes", "reason_for_visit"] },
  ],
  "pets": [
    { type: "pet_appointment", label: "Appointment", publicTabLabel: "Appointments", icon: "paw", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["pet_name", "pet_type"] },
    { type: "pet_product", label: "Product", publicTabLabel: "Products", icon: "cart", requiresBooking: false, requiresSlots: false, requiresCoverPhoto: true, fields: ["brand", "stock_status"] },
  ],
};

export const CATEGORY_ALIASES: Record<string, string> = {
  "rental-real-estate": "rentals",
};

export function resolveCategory(key: string): string {
  return CATEGORY_ALIASES[key] ?? key;
}

export type BookingMode = "booking_slots" | "booking_request" | "browse_only";

export function getBookingMode(config: CategoryServiceType): BookingMode {
  if (config.requiresBooking && config.requiresSlots) return "booking_slots";
  if (config.requiresBooking && !config.requiresSlots) return "booking_request";
  return "browse_only";
}

export function getServiceTypeConfig(
  categoryKey: string,
  serviceType: string
): CategoryServiceType | undefined {
  const resolved = resolveCategory(categoryKey);
  return (CATEGORY_SERVICE_TYPES[resolved] || []).find(t => t.type === serviceType);
}
