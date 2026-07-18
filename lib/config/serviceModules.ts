import { Ionicons } from "@expo/vector-icons";

export type ServiceCtaType =
  | "booking"
  | "reservation"
  | "get_in_touch"
  | "buy"
  | "request_quote"
  | "browse_only";

export type ServiceModuleConfig = {
  key: string;
  labelKey: string;
  fallbackLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  ctaType: ServiceCtaType;
  bookingEnabled: boolean;
  requiresSlots?: boolean;
  fields: string[];
  requiredFields: string[];
  mediaRequiredForPublish?: boolean;
  allowedRootCategories?: string[];
  allowedSubcategories?: string[];
  notes?: string;
};

export const SERVICE_MODULES: Record<string, ServiceModuleConfig> = {
  // ─── Group: Booking (time-slot appointment) ───

  gym_class: {
    key: "gym_class",
    labelKey: "services.typeGymClass",
    fallbackLabel: "Klasse",
    icon: "fitness",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["instructor", "difficulty_level", "session_type", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["sports-fitness-wellness"],
  },

  gym_session: {
    key: "gym_session",
    labelKey: "services.typeGymSession",
    fallbackLabel: "Session",
    icon: "fitness",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["instructor", "session_type", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["sports-fitness-wellness"],
  },

  gym_recovery: {
    key: "gym_recovery",
    labelKey: "services.typeGymRecovery",
    fallbackLabel: "Recovery",
    icon: "medkit",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["treatment_type", "specialist_name", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["sports-fitness-wellness"],
  },

  salon_appointment: {
    key: "salon_appointment",
    labelKey: "services.typeSalonAppointment",
    fallbackLabel: "Termin",
    icon: "calendar",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["specialist_name", "service_category", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["beauty-care"],
  },

  salon_package: {
    key: "salon_package",
    labelKey: "services.typeSalonPackage",
    fallbackLabel: "Paket",
    icon: "gift",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["included_services", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["beauty-care"],
  },

  pro_consultation: {
    key: "pro_consultation",
    labelKey: "services.typeProConsultation",
    fallbackLabel: "Beratung",
    icon: "briefcase",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["consultation_type", "meeting_type", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["professional-services"],
  },

  edu_class: {
    key: "edu_class",
    labelKey: "services.typeEduClass",
    fallbackLabel: "Klasse",
    icon: "school",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["instructor", "difficulty_level", "session_type", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["education-creativity"],
  },

  edu_lesson: {
    key: "edu_lesson",
    labelKey: "services.typeEduLesson",
    fallbackLabel: "Unterricht",
    icon: "book",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["instructor", "difficulty_level", "session_type", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["education-creativity"],
  },

  edu_workshop: {
    key: "edu_workshop",
    labelKey: "services.typeEduWorkshop",
    fallbackLabel: "Workshop",
    icon: "people",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["instructor", "difficulty_level", "capacity", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["education-creativity"],
  },

  table_reservation: {
    key: "table_reservation",
    labelKey: "services.typeTableReservation",
    fallbackLabel: "Tischreservierung",
    icon: "calendar",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["duration_minutes", "capacity", "max_guests", "special_requests"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["food-dining", "nightlife-social"],
  },

  ent_booking: {
    key: "ent_booking",
    labelKey: "services.typeEntBooking",
    fallbackLabel: "Buchung",
    icon: "calendar",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["capacity", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["entertainment-events"],
  },

  ent_performance: {
    key: "ent_performance",
    labelKey: "services.typeEntPerformance",
    fallbackLabel: "Auftritt",
    icon: "musical-notes",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["capacity", "duration_minutes", "instructor"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["entertainment-events"],
  },

  auto_rental: {
    key: "auto_rental",
    labelKey: "services.typeAutoRental",
    fallbackLabel: "Vermietung",
    icon: "calendar",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["make", "model", "year", "fuel_type", "transmission", "pickup_location", "dropoff_location"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["automotive"],
  },

  auto_repair: {
    key: "auto_repair",
    labelKey: "services.typeAutoRepair",
    fallbackLabel: "Reparatur",
    icon: "construct",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["make", "model", "year", "mileage_km", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["automotive"],
  },

  auto_wash: {
    key: "auto_wash",
    labelKey: "services.typeAutoWash",
    fallbackLabel: "Wäsche",
    icon: "water",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["automotive"],
  },

  health_appointment: {
    key: "health_appointment",
    labelKey: "services.typeHealthAppointment",
    fallbackLabel: "Termin",
    icon: "calendar",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["specialist_name", "reason_for_visit", "insurance_info"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["healthcare"],
  },

  health_procedure: {
    key: "health_procedure",
    labelKey: "services.typeHealthProcedure",
    fallbackLabel: "Behandlung",
    icon: "medkit",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["specialist_name", "duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["healthcare"],
  },

  health_test: {
    key: "health_test",
    labelKey: "services.typeHealthTest",
    fallbackLabel: "Test",
    icon: "flask",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["duration_minutes", "reason_for_visit"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["healthcare"],
  },

  pet_appointment: {
    key: "pet_appointment",
    labelKey: "services.typePetAppointment",
    fallbackLabel: "Termin",
    icon: "paw",
    ctaType: "booking",
    bookingEnabled: true,
    requiresSlots: true,
    fields: ["pet_name", "pet_type"],
    requiredFields: [],
    mediaRequiredForPublish: true,
    allowedRootCategories: ["pets"],
  },

  // ─── Group: Request / Reservation (booking-enabled, no slots) ───

  salon_course: {
    key: "salon_course",
    labelKey: "services.typeSalonCourse",
    fallbackLabel: "Kurs",
    icon: "layers",
    ctaType: "request_quote",
    bookingEnabled: true,
    requiresSlots: false,
    fields: ["sessions_count", "duration_per_session"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["beauty-care"],
  },

  rental_property: {
    key: "rental_property",
    labelKey: "services.typeRentalProperty",
    fallbackLabel: "Immobilie",
    icon: "home",
    ctaType: "reservation",
    bookingEnabled: true,
    requiresSlots: false,
    fields: [
      "bedrooms", "bathrooms", "size_sqm", "floor", "furnished",
      "available_from", "lease_duration", "max_guests", "address",
    ],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["rentals", "rental-real-estate"],
  },

  vip_package: {
    key: "vip_package",
    labelKey: "services.typeVipPackage",
    fallbackLabel: "VIP-Paket",
    icon: "star",
    ctaType: "request_quote",
    bookingEnabled: true,
    requiresSlots: false,
    fields: ["max_guests", "includes", "special_requests"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["nightlife-social"],
  },

  tailoring_alteration: {
    key: "tailoring_alteration",
    labelKey: "services.typeTailoring",
    fallbackLabel: "Änderung",
    icon: "cut",
    ctaType: "request_quote",
    bookingEnabled: true,
    requiresSlots: false,
    fields: ["duration_minutes"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["fashion-accessories"],
  },

  // ─── Group: Non-slot (bookingEnabled: false) ───

  gym_membership: {
    key: "gym_membership",
    labelKey: "services.typeGymMembership",
    fallbackLabel: "Mitgliedschaft",
    icon: "card",
    ctaType: "request_quote",
    bookingEnabled: false,
    fields: ["duration_days", "includes"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["sports-fitness-wellness"],
  },

  gym_pass: {
    key: "gym_pass",
    labelKey: "services.typeGymPass",
    fallbackLabel: "Pass",
    icon: "ticket",
    ctaType: "browse_only",
    bookingEnabled: false,
    fields: ["visits_included", "valid_days"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["sports-fitness-wellness"],
  },

  pro_package: {
    key: "pro_package",
    labelKey: "services.typeProPackage",
    fallbackLabel: "Paket",
    icon: "gift",
    ctaType: "request_quote",
    bookingEnabled: false,
    fields: ["duration_days", "includes"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["professional-services"],
  },

  pro_retainer: {
    key: "pro_retainer",
    labelKey: "services.typeProRetainer",
    fallbackLabel: "Retainer",
    icon: "refresh",
    ctaType: "request_quote",
    bookingEnabled: false,
    fields: ["duration_months", "includes"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["professional-services"],
  },

  edu_course: {
    key: "edu_course",
    labelKey: "services.typeEduCourse",
    fallbackLabel: "Kurs",
    icon: "layers",
    ctaType: "request_quote",
    bookingEnabled: false,
    fields: ["instructor", "difficulty_level", "duration_days", "sessions_count"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["education-creativity"],
  },

  menu_item: {
    key: "menu_item",
    labelKey: "services.typeMenuItem",
    fallbackLabel: "Menüpunkt",
    icon: "restaurant",
    ctaType: "browse_only",
    bookingEnabled: false,
    fields: ["menu_category", "dietary_tags", "calories", "allergens", "spice_level"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["food-dining"],
  },

  retail_product: {
    key: "retail_product",
    labelKey: "services.typeRetailProduct",
    fallbackLabel: "Produkt",
    icon: "pricetag",
    ctaType: "browse_only",
    bookingEnabled: false,
    fields: ["brand", "stock_status", "condition"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["shopping-retail", "fashion-accessories"],
    notes: "Canonical icon is pricetag. The fashion-accessories category previously used shirt — category-level icon overrides can be handled in Phase 3 if needed.",
  },

  retail_custom: {
    key: "retail_custom",
    labelKey: "services.typeRetailCustom",
    fallbackLabel: "Sonderanfertigung",
    icon: "create",
    ctaType: "request_quote",
    bookingEnabled: false,
    fields: ["brand", "condition"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["shopping-retail"],
  },

  custom_order: {
    key: "custom_order",
    labelKey: "services.typeCustomOrder",
    fallbackLabel: "Maßanfertigung",
    icon: "create",
    ctaType: "request_quote",
    bookingEnabled: false,
    fields: ["brand", "condition"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["fashion-accessories"],
  },

  auto_vehicle: {
    key: "auto_vehicle",
    labelKey: "services.typeAutoVehicle",
    fallbackLabel: "Fahrzeug",
    icon: "car",
    ctaType: "reservation",
    bookingEnabled: false,
    fields: ["make", "model", "year", "mileage_km", "fuel_type", "transmission"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["automotive"],
  },

  pet_product: {
    key: "pet_product",
    labelKey: "services.typePetProduct",
    fallbackLabel: "Produkt",
    icon: "cart",
    ctaType: "get_in_touch",
    bookingEnabled: false,
    fields: ["brand", "stock_status"],
    requiredFields: [],
    mediaRequiredForPublish: false,
    allowedRootCategories: ["pets"],
  },
};

// ─── Helpers ───

export function getServiceModuleConfig(type: string): ServiceModuleConfig | undefined {
  return SERVICE_MODULES[type];
}

export function getServiceModuleLabel(type: string, t: (key: string, fallback?: string) => string): string {
  const cfg = SERVICE_MODULES[type];
  if (!cfg) return type;
  return t(cfg.labelKey, cfg.fallbackLabel);
}

export function getServiceModuleIcon(type: string): keyof typeof Ionicons.glyphMap {
  return SERVICE_MODULES[type]?.icon ?? "help-circle-outline";
}

export function getServiceCtaType(type: string): ServiceCtaType {
  return SERVICE_MODULES[type]?.ctaType ?? "get_in_touch";
}

export function isServiceBookable(type: string): boolean {
  return SERVICE_MODULES[type]?.bookingEnabled ?? false;
}

export function requiresServiceSlots(type: string): boolean {
  return SERVICE_MODULES[type]?.requiresSlots ?? false;
}

export function getServiceFields(type: string): string[] {
  return SERVICE_MODULES[type]?.fields ?? [];
}

export function getRequiredServiceFields(type: string): string[] {
  return SERVICE_MODULES[type]?.requiredFields ?? [];
}
