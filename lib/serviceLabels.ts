import { getDefaultModule } from "./config/serviceCategoryMatrix";
import { getServiceModuleLabel } from "./config/serviceModules";

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
    const defaultModule = getDefaultModule(rootCategory);
    if (defaultModule) {
      return getServiceModuleLabel(defaultModule, (k: string, fb?: string) => t(k, fb ?? label));
    }
  }
  return label || "Service";
}
