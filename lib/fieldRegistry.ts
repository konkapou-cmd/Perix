import { COLORS } from "./designTokens";

export type FieldComponent = "text" | "textarea" | "number" | "chips" | "chips-multi" | "toggle" | "date" | "location";

export interface FieldConfig {
  component: FieldComponent;
  labelKey: string;
  placeholderKey?: string;
  showOnCard: boolean;
  options?: string[];
  min?: number;
  max?: number;
  displayFormat?: "duration" | "price" | "default";
}

export interface FieldRegistry {
  [fieldName: string]: FieldConfig;
}

export const DIETARY_LABELS: Record<string, string> = {
  vegan: "V",
  vegetarian: "VG",
  "gluten-free": "GF",
  "dairy-free": "DF",
  halal: "H",
  spicy: "\u{1F336}",
};

export const LEASE_DURATION_LABELS: Record<string, string> = {
  "1_month": "1 Monat",
  "3_months": "3 Monate",
  "6_months": "6 Monate",
  "1_year": "1 Jahr",
  "2_years": "2 Jahre",
  "3_years": "3 Jahre",
  "indefinite": "Unbefristet",
};

export const FIELD_REGISTRY: FieldRegistry = {
  duration_minutes: {
    component: "number",
    labelKey: "services.duration",
    placeholderKey: "services.durationPlaceholder",
    showOnCard: true,
    min: 5,
    max: 1440,
    displayFormat: "duration",
  },
  capacity: {
    component: "number",
    labelKey: "services.capacity",
    placeholderKey: "services.capacityPlaceholder",
    showOnCard: true,
    min: 1,
    max: 100000,
  },
  instructor: {
    component: "text",
    labelKey: "services.instructor",
    placeholderKey: "services.instructorPlaceholder",
    showOnCard: true,
  },
  difficulty_level: {
    component: "chips",
    labelKey: "services.difficultyLevel",
    showOnCard: true,
    options: ["beginner", "intermediate", "advanced"],
  },
  session_type: {
    component: "chips",
    labelKey: "services.sessionType",
    showOnCard: true,
    options: ["in-person", "online", "both"],
  },
  treatment_type: {
    component: "chips",
    labelKey: "services.treatmentType",
    showOnCard: true,
    options: ["massage", "physiotherapy", "chiropractic", "acupuncture", "cryotherapy", "sauna", "stretching", "rehabilitation"],
  },
  specialist_name: {
    component: "text",
    labelKey: "services.specialistName",
    placeholderKey: "services.specialistPlaceholder",
    showOnCard: true,
  },
  service_category: {
    component: "chips",
    labelKey: "services.serviceCategory",
    showOnCard: true,
    options: ["hair", "nails", "skin", "massage", "makeup"],
  },
  consultation_type: {
    component: "chips",
    labelKey: "services.consultationType",
    showOnCard: true,
    options: ["initial", "followup", "specialist"],
  },
  meeting_type: {
    component: "chips",
    labelKey: "services.meetingType",
    showOnCard: true,
    options: ["in-person", "video", "phone"],
  },
  menu_category: {
    component: "chips",
    labelKey: "services.menuCategory",
    showOnCard: true,
    options: ["starter", "main", "dessert", "drink", "side"],
  },
  dietary_tags: {
    component: "chips-multi",
    labelKey: "services.dietaryTags",
    showOnCard: true,
    options: ["vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "spicy"],
  },
  calories: {
    component: "number",
    labelKey: "services.calories",
    placeholderKey: "services.caloriesPlaceholder",
    showOnCard: true,
    min: 0,
    max: 10000,
  },
  allergens: {
    component: "chips-multi",
    labelKey: "services.allergens",
    showOnCard: true,
    options: ["nuts", "dairy", "eggs", "soy", "wheat", "shellfish", "fish", "sesame"],
  },
  spice_level: {
    component: "number",
    labelKey: "services.spiceLevel",
    placeholderKey: "services.spicePlaceholder",
    showOnCard: true,
    min: 1,
    max: 5,
  },
  bedrooms: {
    component: "number",
    labelKey: "services.bedrooms",
    placeholderKey: "services.bedroomsPlaceholder",
    showOnCard: true,
    min: 0,
    max: 100,
  },
  bathrooms: {
    component: "number",
    labelKey: "services.bathrooms",
    placeholderKey: "services.bathroomsPlaceholder",
    showOnCard: true,
    min: 0,
    max: 100,
  },
  size_sqm: {
    component: "number",
    labelKey: "services.sizeSqm",
    placeholderKey: "services.sizeSqmPlaceholder",
    showOnCard: true,
    min: 1,
    max: 100000,
  },
  floor: {
    component: "number",
    labelKey: "services.floor",
    placeholderKey: "services.floorPlaceholder",
    showOnCard: true,
    min: -5,
    max: 200,
  },
  furnished: {
    component: "toggle",
    labelKey: "services.furnished",
    showOnCard: true,
  },
  available_from: {
    component: "date",
    labelKey: "services.availableFrom",
    showOnCard: true,
  },
  lease_duration: {
    component: "chips",
    labelKey: "services.leaseDuration",
    showOnCard: true,
    options: ["1_month", "3_months", "6_months", "1_year", "2_years", "3_years", "indefinite"],
  },
  max_guests: {
    component: "number",
    labelKey: "services.maxGuests",
    placeholderKey: "services.maxGuestsPlaceholder",
    showOnCard: true,
    min: 1,
    max: 1000,
  },
  property_type: {
    component: "chips",
    labelKey: "rentals.propertyType",
    showOnCard: true,
    options: ["apartment", "house", "studio", "room", "commercial"],
  },
  deposit: {
    component: "number",
    labelKey: "rentals.deposit",
    placeholderKey: "rentals.depositPlaceholder",
    showOnCard: true,
  },
  address: {
    component: "location",
    labelKey: "rentals.address",
    placeholderKey: "services.addressPlaceholder",
    showOnCard: false,
  },
  make: {
    component: "text",
    labelKey: "services.make",
    placeholderKey: "services.makePlaceholder",
    showOnCard: true,
  },
  model: {
    component: "text",
    labelKey: "services.model",
    placeholderKey: "services.modelPlaceholder",
    showOnCard: true,
  },
  year: {
    component: "number",
    labelKey: "services.year",
    placeholderKey: "services.yearPlaceholder",
    showOnCard: true,
    min: 1900,
    max: 2030,
  },
  mileage_km: {
    component: "number",
    labelKey: "services.mileageKm",
    placeholderKey: "services.mileagePlaceholder",
    showOnCard: true,
    min: 0,
    max: 1000000,
  },
  fuel_type: {
    component: "chips",
    labelKey: "services.fuelType",
    showOnCard: true,
    options: ["petrol", "diesel", "electric", "hybrid"],
  },
  transmission: {
    component: "chips",
    labelKey: "services.transmission",
    showOnCard: true,
    options: ["manual", "automatic"],
  },
  stock_status: {
    component: "chips",
    labelKey: "services.stockStatus",
    showOnCard: true,
    options: ["in_stock", "limited", "out_of_stock"],
  },
  brand: {
    component: "text",
    labelKey: "services.brand",
    placeholderKey: "services.brandPlaceholder",
    showOnCard: true,
  },
  condition: {
    component: "chips",
    labelKey: "services.condition",
    showOnCard: true,
    options: ["new", "used", "refurbished"],
  },
  duration_days: {
    component: "number",
    labelKey: "services.durationDays",
    placeholderKey: "services.durationDaysPlaceholder",
    showOnCard: true,
    min: 1,
    max: 365,
  },
  duration_months: {
    component: "number",
    labelKey: "services.durationMonths",
    placeholderKey: "services.durationMonthsPlaceholder",
    showOnCard: true,
    min: 1,
    max: 120,
  },
  includes: {
    component: "textarea",
    labelKey: "services.includes",
    placeholderKey: "services.includesPlaceholder",
    showOnCard: false,
  },
  visits_included: {
    component: "number",
    labelKey: "services.visitsIncluded",
    placeholderKey: "services.visitsPlaceholder",
    showOnCard: true,
    min: 1,
    max: 100,
  },
  valid_days: {
    component: "number",
    labelKey: "services.validDays",
    placeholderKey: "services.validDaysPlaceholder",
    showOnCard: true,
    min: 1,
    max: 365,
  },
  included_services: {
    component: "chips-multi",
    labelKey: "services.includedServices",
    showOnCard: true,
    options: ["haircut", "color", "styling", "manicure", "pedicure", "facial", "massage", "makeup", "waxing"],
  },
  sessions_count: {
    component: "number",
    labelKey: "services.sessionsCount",
    placeholderKey: "services.sessionsCountPlaceholder",
    showOnCard: true,
    min: 1,
    max: 100,
  },
  duration_per_session: {
    component: "number",
    labelKey: "services.durationPerSession",
    placeholderKey: "services.durationPerSessionPlaceholder",
    showOnCard: true,
    min: 5,
    max: 480,
  },
  special_requests: {
    component: "textarea",
    labelKey: "services.specialRequests",
    placeholderKey: "services.specialRequestsPlaceholder",
    showOnCard: false,
  },
  pickup_location: {
    component: "text",
    labelKey: "services.pickupLocation",
    placeholderKey: "services.pickupPlaceholder",
    showOnCard: false,
  },
  dropoff_location: {
    component: "text",
    labelKey: "services.dropoffLocation",
    placeholderKey: "services.dropoffPlaceholder",
    showOnCard: false,
  },
  reason_for_visit: {
    component: "text",
    labelKey: "services.reasonForVisit",
    placeholderKey: "services.reasonPlaceholder",
    showOnCard: false,
  },
  insurance_info: {
    component: "text",
    labelKey: "services.insuranceInfo",
    placeholderKey: "services.insurancePlaceholder",
    showOnCard: false,
  },
  pet_name: {
    component: "text",
    labelKey: "services.petName",
    placeholderKey: "services.petNamePlaceholder",
    showOnCard: true,
  },
  pet_type: {
    component: "chips",
    labelKey: "services.petType",
    showOnCard: true,
    options: ["dog", "cat", "bird", "fish", "reptile", "other"],
  },
  facilities: {
    component: "chips-multi",
    labelKey: "services.facilities",
    showOnCard: true,
    options: ["wifi", "ac", "tv", "pool", "parking", "breakfast", "balcony", "minibar", "safe", "desk", "pet-friendly", "elevator", "gym"],
  },
};
