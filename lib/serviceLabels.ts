import { CATEGORY_SERVICE_TYPES } from "./designTokens";

const SINGULAR_LABELS: Record<string, string> = {
  "sports-fitness-wellness": "Class",
  "beauty-care": "Appointment",
  "professional-services": "Service",
  "education-creativity": "Class",
  "food-dining": "Menu Item",
  rentals: "Property",
  "rental-real-estate": "Property",
  "nightlife-social": "Table",
  "entertainment-events": "Event",
  "shopping-retail": "Product",
  "fashion-accessories": "Product",
  automotive: "Vehicle",
  healthcare: "Appointment",
  pets: "Service",
};

export function getServiceSingular(rootCategory: string, t?: any): string {
  const label = rootCategory ? SINGULAR_LABELS[rootCategory] : undefined;
  if (t && label) {
    const types = CATEGORY_SERVICE_TYPES[rootCategory];
    if (types && types.length > 0) {
      const firstType = types[0];
      const labelKey = `services.type${firstType.type.charAt(0).toUpperCase() + firstType.type.slice(1).replace(/_./g, (c) => c[1]?.toUpperCase() || "")}`;
      return t(labelKey, { defaultValue: label });
    }
  }
  return label || "Service";
}
