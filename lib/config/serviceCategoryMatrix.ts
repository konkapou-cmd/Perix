import { Ionicons } from "@expo/vector-icons";
import { ServiceCtaType } from "./serviceModules";

type ServiceQuestionImportance = "required" | "recommended" | "optional";

export type ServiceQuestionConfig = {
  field: string;
  importance: ServiceQuestionImportance;
  labelKey: string;
  fallbackLabel: string;
  helpTextKey?: string;
  fallbackHelpText?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  showOnCard?: boolean;
  showOnDetail?: boolean;
  searchable?: boolean;
  filterable?: boolean;
};

export type ServiceCategoryAttachment = {
  rootCategory: string;
  subcategory?: string;
  allowedModules: string[];
  defaultModule: string;
  recommendedCtaType: ServiceCtaType;
  icon: keyof typeof Ionicons.glyphMap;
  questions: ServiceQuestionConfig[];
  detailSections: string[];
  cardSummaryFields: string[];
  notes?: string;
};

export const SERVICE_CATEGORY_MATRIX: Record<string, ServiceCategoryAttachment> = {
  // ═══════════════════════════════════════════════════════════════════
  // 1. sports-fitness-wellness
  // ═══════════════════════════════════════════════════════════════════

  "sports-fitness-wellness": {
    rootCategory: "sports-fitness-wellness",
    allowedModules: ["gym_class", "gym_session", "gym_membership", "gym_pass", "gym_recovery"],
    defaultModule: "gym_class",
    recommendedCtaType: "booking",
    icon: "fitness",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "instructor", importance: "recommended", labelKey: "services.instructor", fallbackLabel: "Trainer", icon: "person", showOnCard: true, showOnDetail: true },
      { field: "difficulty_level", importance: "optional", labelKey: "services.difficultyLevel", fallbackLabel: "Schwierigkeitsgrad", icon: "speedometer", showOnCard: true, filterable: true },
      { field: "session_type", importance: "optional", labelKey: "services.sessionType", fallbackLabel: "Session-Typ", icon: "videocam", showOnCard: true, filterable: true },
      { field: "treatment_type", importance: "optional", labelKey: "services.treatmentType", fallbackLabel: "Behandlungsart", icon: "medkit", showOnCard: true, filterable: true },
      { field: "specialist_name", importance: "optional", labelKey: "services.specialistName", fallbackLabel: "Spezialist", icon: "person", showOnCard: true },
      { field: "capacity", importance: "optional", labelKey: "services.capacity", fallbackLabel: "Plätze", icon: "people", showOnCard: true },
      { field: "facilities", importance: "optional", labelKey: "services.facilities", fallbackLabel: "Ausstattung", icon: "list", showOnCard: true, showOnDetail: true },
    ],
    detailSections: ["overview", "pricing", "schedule", "instructor", "location"],
    cardSummaryFields: ["type", "price", "duration_minutes", "instructor", "difficulty_level"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 2. beauty-care
  // ═══════════════════════════════════════════════════════════════════

  "beauty-care": {
    rootCategory: "beauty-care",
    allowedModules: ["salon_appointment", "salon_package", "salon_course"],
    defaultModule: "salon_appointment",
    recommendedCtaType: "booking",
    icon: "rose",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer (min)", icon: "time", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "specialist_name", importance: "recommended", labelKey: "services.specialistName", fallbackLabel: "Spezialist", icon: "person", showOnCard: true, showOnDetail: true },
      { field: "service_category", importance: "recommended", labelKey: "services.serviceCategory", fallbackLabel: "Kategorie", icon: "pricetags", showOnCard: true, filterable: true },
      { field: "included_services", importance: "optional", labelKey: "services.includedServices", fallbackLabel: "Enthaltene Leistungen", icon: "list", showOnDetail: true },
      { field: "sessions_count", importance: "optional", labelKey: "services.sessionsCount", fallbackLabel: "Anzahl Sitzungen", icon: "repeat", showOnCard: true },
      { field: "duration_per_session", importance: "optional", labelKey: "services.durationPerSession", fallbackLabel: "Dauer pro Sitzung", icon: "time", showOnCard: true },
    ],
    detailSections: ["overview", "pricing", "specialist", "schedule", "location"],
    cardSummaryFields: ["type", "price", "duration_minutes", "specialist_name", "service_category"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 3. professional-services
  // ═══════════════════════════════════════════════════════════════════

  "professional-services": {
    rootCategory: "professional-services",
    allowedModules: ["pro_consultation", "pro_package", "pro_retainer"],
    defaultModule: "pro_consultation",
    recommendedCtaType: "booking",
    icon: "briefcase",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Dienst", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "recommended", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "required", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "consultation_type", importance: "recommended", labelKey: "services.consultationType", fallbackLabel: "Beratungstyp", icon: "chatbubbles", showOnCard: true, filterable: true },
      { field: "meeting_type", importance: "recommended", labelKey: "services.meetingType", fallbackLabel: "Meeting-Art", icon: "videocam", showOnCard: true, filterable: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true, showOnDetail: true },
      { field: "includes", importance: "optional", labelKey: "services.includes", fallbackLabel: "Enthalten", icon: "list", showOnDetail: true },
      { field: "duration_days", importance: "optional", labelKey: "services.durationDays", fallbackLabel: "Laufzeit (Tage)", icon: "calendar", showOnCard: true },
      { field: "duration_months", importance: "optional", labelKey: "services.durationMonths", fallbackLabel: "Laufzeit (Monate)", icon: "calendar", showOnCard: true },
    ],
    detailSections: ["overview", "pricing", "schedule", "contact"],
    cardSummaryFields: ["type", "price", "consultation_type", "meeting_type", "duration_minutes"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 4. education-creativity
  // ═══════════════════════════════════════════════════════════════════

  "education-creativity": {
    rootCategory: "education-creativity",
    allowedModules: ["edu_class", "edu_lesson", "edu_workshop", "edu_course"],
    defaultModule: "edu_class",
    recommendedCtaType: "booking",
    icon: "school",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "instructor", importance: "recommended", labelKey: "services.instructor", fallbackLabel: "Lehrkraft", icon: "person", showOnCard: true, showOnDetail: true },
      { field: "difficulty_level", importance: "optional", labelKey: "services.difficultyLevel", fallbackLabel: "Schwierigkeitsgrad", icon: "speedometer", showOnCard: true, filterable: true },
      { field: "session_type", importance: "optional", labelKey: "services.sessionType", fallbackLabel: "Session-Typ", icon: "videocam", showOnCard: true, filterable: true },
      { field: "capacity", importance: "optional", labelKey: "services.capacity", fallbackLabel: "Plätze", icon: "people", showOnCard: true },
      { field: "duration_days", importance: "optional", labelKey: "services.durationDays", fallbackLabel: "Laufzeit (Tage)", icon: "calendar", showOnCard: true },
      { field: "sessions_count", importance: "optional", labelKey: "services.sessionsCount", fallbackLabel: "Anzahl Sitzungen", icon: "repeat", showOnCard: true },
    ],
    detailSections: ["overview", "pricing", "schedule", "instructor", "location"],
    cardSummaryFields: ["type", "price", "duration_minutes", "instructor", "difficulty_level"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 5. food-dining
  // ═══════════════════════════════════════════════════════════════════

  "food-dining": {
    rootCategory: "food-dining",
    allowedModules: ["menu_item", "table_reservation"],
    defaultModule: "menu_item",
    recommendedCtaType: "browse_only",
    icon: "restaurant",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "menu_category", importance: "recommended", labelKey: "services.menuCategory", fallbackLabel: "Menükategorie", icon: "restaurant", showOnCard: true, filterable: true },
      { field: "dietary_tags", importance: "recommended", labelKey: "services.dietaryTags", fallbackLabel: "Ernährungsmerkmale", icon: "leaf", showOnCard: true, filterable: true },
      { field: "allergens", importance: "recommended", labelKey: "services.allergens", fallbackLabel: "Allergene", icon: "warning", showOnCard: true, showOnDetail: true },
      { field: "calories", importance: "optional", labelKey: "services.calories", fallbackLabel: "Kalorien", icon: "flame", showOnCard: true },
      { field: "spice_level", importance: "optional", labelKey: "services.spiceLevel", fallbackLabel: "Schärfegrad", icon: "flame", showOnCard: true, filterable: true },
      { field: "capacity", importance: "optional", labelKey: "services.capacity", fallbackLabel: "Plätze", icon: "people", showOnCard: true },
      { field: "special_requests", importance: "optional", labelKey: "services.specialRequests", fallbackLabel: "Sonderwünsche", icon: "create", showOnDetail: true },
    ],
    detailSections: ["overview", "menu", "allergens", "location", "reservations"],
    cardSummaryFields: ["type", "price", "menu_category", "dietary_tags", "calories"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 6. rentals
  // ═══════════════════════════════════════════════════════════════════

  rentals: {
    rootCategory: "rentals",
    allowedModules: ["rental_property"],
    defaultModule: "rental_property",
    recommendedCtaType: "reservation",
    icon: "home",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Titel", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "address", importance: "required", labelKey: "services.address", fallbackLabel: "Adresse", icon: "location", showOnCard: true, showOnDetail: true },
      { field: "bedrooms", importance: "recommended", labelKey: "services.bedrooms", fallbackLabel: "Schlafzimmer", icon: "bed", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "bathrooms", importance: "recommended", labelKey: "services.bathrooms", fallbackLabel: "Badezimmer", icon: "water", showOnCard: true, showOnDetail: true },
      { field: "size_sqm", importance: "recommended", labelKey: "services.sizeSqm", fallbackLabel: "Größe (m²)", icon: "resize", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "floor", importance: "optional", labelKey: "services.floor", fallbackLabel: "Stockwerk", icon: "layers", showOnCard: true },
      { field: "furnished", importance: "recommended", labelKey: "services.furnished", fallbackLabel: "Möbliert", icon: "checkbox", showOnCard: true, filterable: true },
      { field: "available_from", importance: "recommended", labelKey: "services.availableFrom", fallbackLabel: "Verfügbar ab", icon: "calendar", showOnCard: true, showOnDetail: true },
      { field: "lease_duration", importance: "recommended", labelKey: "services.leaseDuration", fallbackLabel: "Mietdauer", icon: "time", showOnCard: true, filterable: true },
      { field: "max_guests", importance: "optional", labelKey: "services.maxGuests", fallbackLabel: "Max. Gäste", icon: "people", showOnCard: true, showOnDetail: true },
      { field: "facilities", importance: "optional", labelKey: "services.facilities", fallbackLabel: "Ausstattung", icon: "list", showOnCard: true, showOnDetail: true },
    ],
    detailSections: ["overview", "details", "pricing", "location", "availability"],
    cardSummaryFields: ["type", "price", "bedrooms", "bathrooms", "size_sqm", "address"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 7. rental-real-estate  (alias to rentals)
  // ═══════════════════════════════════════════════════════════════════

  "rental-real-estate": {
    rootCategory: "rental-real-estate",
    allowedModules: ["rental_property"],
    defaultModule: "rental_property",
    recommendedCtaType: "reservation",
    icon: "business",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Titel", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "address", importance: "required", labelKey: "services.address", fallbackLabel: "Adresse", icon: "location", showOnCard: true, showOnDetail: true },
      { field: "size_sqm", importance: "recommended", labelKey: "services.sizeSqm", fallbackLabel: "Größe (m²)", icon: "resize", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "floor", importance: "optional", labelKey: "services.floor", fallbackLabel: "Stockwerk", icon: "layers", showOnCard: true },
      { field: "furnished", importance: "recommended", labelKey: "services.furnished", fallbackLabel: "Möbliert", icon: "checkbox", showOnCard: true, filterable: true },
      { field: "available_from", importance: "recommended", labelKey: "services.availableFrom", fallbackLabel: "Verfügbar ab", icon: "calendar", showOnCard: true, showOnDetail: true },
      { field: "lease_duration", importance: "recommended", labelKey: "services.leaseDuration", fallbackLabel: "Mietdauer", icon: "time", showOnCard: true, filterable: true },
      { field: "max_guests", importance: "optional", labelKey: "services.maxGuests", fallbackLabel: "Max. Gäste", icon: "people", showOnCard: true },
      { field: "facilities", importance: "optional", labelKey: "services.facilities", fallbackLabel: "Ausstattung", icon: "list", showOnCard: true, showOnDetail: true },
    ],
    detailSections: ["overview", "details", "pricing", "location", "availability"],
    cardSummaryFields: ["type", "price", "size_sqm", "furnished", "address"],
    notes: "Alias to rentals. Shares rental_property module. Commercial real estate differs by icon and questions (no bedrooms/bathrooms).",
  },

  // ═══════════════════════════════════════════════════════════════════
  // 8. nightlife-social
  // ═══════════════════════════════════════════════════════════════════

  "nightlife-social": {
    rootCategory: "nightlife-social",
    allowedModules: ["table_reservation", "vip_package"],
    defaultModule: "table_reservation",
    recommendedCtaType: "booking",
    icon: "wine",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "recommended", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "max_guests", importance: "recommended", labelKey: "services.maxGuests", fallbackLabel: "Max. Gäste", icon: "people", showOnCard: true, showOnDetail: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer (min)", icon: "time", showOnCard: true, showOnDetail: true },
      { field: "includes", importance: "optional", labelKey: "services.includes", fallbackLabel: "Enthalten", icon: "list", showOnDetail: true },
      { field: "special_requests", importance: "optional", labelKey: "services.specialRequests", fallbackLabel: "Sonderwünsche", icon: "create", showOnDetail: true },
      { field: "capacity", importance: "optional", labelKey: "services.capacity", fallbackLabel: "Kapazität", icon: "people", showOnCard: true },
    ],
    detailSections: ["overview", "pricing", "details", "location", "reservations"],
    cardSummaryFields: ["type", "price", "max_guests", "duration_minutes", "capacity"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 9. entertainment-events
  // ═══════════════════════════════════════════════════════════════════

  "entertainment-events": {
    rootCategory: "entertainment-events",
    allowedModules: ["ent_booking", "ent_performance"],
    defaultModule: "ent_booking",
    recommendedCtaType: "booking",
    icon: "ticket",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer (min)", icon: "time", showOnCard: true, showOnDetail: true },
      { field: "capacity", importance: "recommended", labelKey: "services.capacity", fallbackLabel: "Kapazität", icon: "people", showOnCard: true, showOnDetail: true },
      { field: "instructor", importance: "optional", labelKey: "services.instructor", fallbackLabel: "Künstler", icon: "person", showOnCard: true, showOnDetail: true },
      { field: "facilities", importance: "optional", labelKey: "services.facilities", fallbackLabel: "Ausstattung", icon: "list", showOnCard: true, showOnDetail: true },
    ],
    detailSections: ["overview", "pricing", "schedule", "capacity", "location"],
    cardSummaryFields: ["type", "price", "duration_minutes", "capacity", "instructor"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 10. shopping-retail
  // ═══════════════════════════════════════════════════════════════════

  "shopping-retail": {
    rootCategory: "shopping-retail",
    allowedModules: ["retail_product", "retail_custom"],
    defaultModule: "retail_product",
    recommendedCtaType: "browse_only",
    icon: "cart",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Produkt", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "brand", importance: "recommended", labelKey: "services.brand", fallbackLabel: "Marke", icon: "bookmark", showOnCard: true, showOnDetail: true },
      { field: "stock_status", importance: "recommended", labelKey: "services.stockStatus", fallbackLabel: "Verfügbarkeit", icon: "checkbox", showOnCard: true, filterable: true },
      { field: "condition", importance: "recommended", labelKey: "services.condition", fallbackLabel: "Zustand", icon: "ribbon", showOnCard: true, filterable: true },
    ],
    detailSections: ["overview", "pricing", "details", "contact"],
    cardSummaryFields: ["type", "price", "brand", "stock_status", "condition"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 11. fashion-accessories
  // ═══════════════════════════════════════════════════════════════════

  "fashion-accessories": {
    rootCategory: "fashion-accessories",
    allowedModules: ["retail_product", "tailoring_alteration", "custom_order"],
    defaultModule: "retail_product",
    recommendedCtaType: "browse_only",
    icon: "shirt",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Produkt", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "brand", importance: "recommended", labelKey: "services.brand", fallbackLabel: "Marke", icon: "bookmark", showOnCard: true, showOnDetail: true },
      { field: "stock_status", importance: "recommended", labelKey: "services.stockStatus", fallbackLabel: "Verfügbarkeit", icon: "checkbox", showOnCard: true, filterable: true },
      { field: "condition", importance: "recommended", labelKey: "services.condition", fallbackLabel: "Zustand", icon: "ribbon", showOnCard: true, filterable: true },
      { field: "duration_minutes", importance: "optional", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true },
    ],
    detailSections: ["overview", "pricing", "details", "contact"],
    cardSummaryFields: ["type", "price", "brand", "stock_status", "condition"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 12. automotive
  // ═══════════════════════════════════════════════════════════════════

  automotive: {
    rootCategory: "automotive",
    allowedModules: ["auto_vehicle", "auto_rental", "auto_repair", "auto_wash"],
    defaultModule: "auto_vehicle",
    recommendedCtaType: "reservation",
    icon: "car",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "make", importance: "recommended", labelKey: "services.make", fallbackLabel: "Marke", icon: "bookmark", showOnCard: true, showOnDetail: true },
      { field: "model", importance: "recommended", labelKey: "services.model", fallbackLabel: "Modell", icon: "car", showOnCard: true, showOnDetail: true },
      { field: "year", importance: "recommended", labelKey: "services.year", fallbackLabel: "Baujahr", icon: "calendar", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "mileage_km", importance: "recommended", labelKey: "services.mileageKm", fallbackLabel: "Kilometerstand", icon: "speedometer", showOnCard: true, showOnDetail: true, filterable: true },
      { field: "fuel_type", importance: "recommended", labelKey: "services.fuelType", fallbackLabel: "Kraftstoff", icon: "flash", showOnCard: true, filterable: true },
      { field: "transmission", importance: "recommended", labelKey: "services.transmission", fallbackLabel: "Getriebe", icon: "options", showOnCard: true, filterable: true },
      { field: "duration_minutes", importance: "optional", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true, showOnDetail: true },
      { field: "pickup_location", importance: "optional", labelKey: "services.pickupLocation", fallbackLabel: "Abholort", icon: "location", showOnDetail: true },
      { field: "dropoff_location", importance: "optional", labelKey: "services.dropoffLocation", fallbackLabel: "Rückgabeort", icon: "location", showOnDetail: true },
    ],
    detailSections: ["overview", "specs", "pricing", "availability", "location"],
    cardSummaryFields: ["type", "price", "make", "model", "year", "fuel_type", "transmission"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 13. healthcare
  // ═══════════════════════════════════════════════════════════════════

  healthcare: {
    rootCategory: "healthcare",
    allowedModules: ["health_appointment", "health_procedure", "health_test"],
    defaultModule: "health_appointment",
    recommendedCtaType: "booking",
    icon: "medkit",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Termin", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "recommended", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "specialist_name", importance: "recommended", labelKey: "services.specialistName", fallbackLabel: "Facharzt", icon: "person", showOnCard: true, showOnDetail: true },
      { field: "duration_minutes", importance: "recommended", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true, showOnDetail: true },
      { field: "reason_for_visit", importance: "recommended", labelKey: "services.reasonForVisit", fallbackLabel: "Besuchsgrund", icon: "clipboard", showOnDetail: true },
      { field: "insurance_info", importance: "optional", labelKey: "services.insuranceInfo", fallbackLabel: "Versicherung", icon: "shield-checkmark", showOnDetail: true },
    ],
    detailSections: ["overview", "pricing", "specialist", "schedule", "location"],
    cardSummaryFields: ["type", "price", "specialist_name", "duration_minutes"],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 14. pets
  // ═══════════════════════════════════════════════════════════════════

  pets: {
    rootCategory: "pets",
    allowedModules: ["pet_appointment", "pet_product"],
    defaultModule: "pet_appointment",
    recommendedCtaType: "booking",
    icon: "paw",
    questions: [
      { field: "name", importance: "required", labelKey: "services.name", fallbackLabel: "Name", icon: "text", showOnCard: true, showOnDetail: true },
      { field: "type", importance: "required", labelKey: "services.serviceType", fallbackLabel: "Art", icon: "options", showOnCard: true, showOnDetail: true },
      { field: "price", importance: "required", labelKey: "services.price", fallbackLabel: "Preis", icon: "pricetag", showOnCard: true, showOnDetail: true },
      { field: "description", importance: "recommended", labelKey: "services.description", fallbackLabel: "Beschreibung", icon: "document-text", showOnDetail: true },
      { field: "pet_name", importance: "recommended", labelKey: "services.petName", fallbackLabel: "Tiername", icon: "paw", showOnCard: true, showOnDetail: true },
      { field: "pet_type", importance: "recommended", labelKey: "services.petType", fallbackLabel: "Tierart", icon: "paw", showOnCard: true, filterable: true },
      { field: "duration_minutes", importance: "optional", labelKey: "services.duration", fallbackLabel: "Dauer", icon: "time", showOnCard: true, showOnDetail: true },
      { field: "brand", importance: "optional", labelKey: "services.brand", fallbackLabel: "Marke", icon: "bookmark", showOnCard: true },
      { field: "stock_status", importance: "optional", labelKey: "services.stockStatus", fallbackLabel: "Verfügbarkeit", icon: "checkbox", showOnCard: true, filterable: true },
    ],
    detailSections: ["overview", "pricing", "details", "schedule", "location"],
    cardSummaryFields: ["type", "price", "pet_name", "pet_type", "duration_minutes"],
  },
};

// ─── Helpers ───

import { ServiceModuleConfig, SERVICE_MODULES } from "./serviceModules";

export function getCategoryAttachment(rootCategory: string): ServiceCategoryAttachment | undefined {
  return SERVICE_CATEGORY_MATRIX[rootCategory];
}

export function getAllowedModules(rootCategory: string): string[] {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.allowedModules ?? [];
}

export function getDefaultModule(rootCategory: string): string {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.defaultModule ?? "";
}

export function getCategoryQuestions(rootCategory: string): ServiceQuestionConfig[] {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.questions ?? [];
}

export function getCategoryCardFields(rootCategory: string): string[] {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.cardSummaryFields ?? [];
}

export function getCategoryDetailSections(rootCategory: string): string[] {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.detailSections ?? [];
}

export function getCategoryIcon(rootCategory: string): keyof typeof Ionicons.glyphMap {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.icon ?? "help-circle-outline";
}

export function getCategoryCtaType(rootCategory: string): ServiceCtaType {
  return SERVICE_CATEGORY_MATRIX[rootCategory]?.recommendedCtaType ?? "get_in_touch";
}

export function hasServiceModules(rootCategory: string): boolean {
  return (SERVICE_CATEGORY_MATRIX[rootCategory]?.allowedModules?.length ?? 0) > 0;
}
