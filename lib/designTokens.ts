// Design System Tokens
// Version 3.0 — Purple/Yellow palette per Perix brand spec

export const COLORS = {
  // Brand — Purple
  primary: "#5B16C9",
  primaryHover: "#8B35E8",
  primaryDark: "#2B075F",
  primaryLight: "#EEE6FF",
  secondary: "#8B35E8",

  // Brand — Yellow accent
  accent: "#FFC400",
  accentSoft: "#FFF1B8",
  accentDark: "#9A6A00",

  // Text
  textPrimary: "#120A35",
  textSecondary: "#5D5575",
  textMuted: "#6E6688",
  textDisabled: "#C8C2D4",
  textLight: "#FFFFFF",

  // Backgrounds
  background: "#FFFFFF",
  backgroundPage: "#FBF8FF",
  surfaceSoft: "#F5EEFF",

  // Borders
  border: "#E7DFF2",
  divider: "#E7DFF2",

  // Semantic
  danger: "#ef4444",
  dangerLight: "#fee2e2",
  error: "#ef4444",
  errorLight: "#fecaca",
  warning: "#FFC400",
  warningLight: "#FFF1B8",
  info: "#5B16C9",
  success: "#10b981",

  // Status
  online: "#35D05A",
  offline: "#C8C2D4",

  // Entity accents
  eventAccent: "#8B35E8",
  activityAccent: "#5B16C9",
  gold: "#FFC400",

  // Dark mode
  dark: {
    bgBase: "#0f0a1a",
    bgSurface: "#1a1030",
    bgElevated: "#2d1f40",
    textPrimary: "#f9fafb",
    textSecondary: "#cbd5e1",
    textTertiary: "#94a3b8",
    border: "#2d1f40",
    divider: "#1a1030",
  },
} as const;

export const SPACING = {
  xs: 4,
  sm: 6,
  md: 8,
  mdLg: 10,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  huge: 32,
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
} as const;

export const SHADOWS = {
  subtle: {
    shadowColor: "#2B075F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  medium: {
    shadowColor: "#2B075F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 6,
  },
  strong: {
    shadowColor: "#2B075F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
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
    { type: "rental_property", label: "Property", publicTabLabel: "Rental Properties", icon: "home", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["bedrooms", "bathrooms", "size_sqm", "floor", "furnished", "available_from", "lease_duration", "max_guests"] },
  ],
  "rental-real-estate": [
    { type: "rental_property", label: "Property", publicTabLabel: "Rental Properties", icon: "home", requiresBooking: true, requiresSlots: false, requiresCoverPhoto: true, fields: ["bedrooms", "bathrooms", "size_sqm", "floor", "furnished", "available_from", "lease_duration", "max_guests"] },
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
    { type: "tailoring_alteration", label: "Tailoring", publicTabLabel: "Tailoring", icon: "cut", requiresBooking: true, requiresSlots: true, requiresCoverPhoto: true, fields: ["duration_minutes"] },
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
