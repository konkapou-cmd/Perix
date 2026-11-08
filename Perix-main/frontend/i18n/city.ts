import i18n from "./index";
import copy from "./city.json";
import googleDirections from "./googleDirections.json";

const install = () => {
  Object.entries(copy).forEach(([language, resource]) => i18n.addResourceBundle(language, "city", {
    ...resource, googleDirections: googleDirections[language as keyof typeof googleDirections],
  }, true, true));
};
const onInitialized = () => { i18n.off("initialized", onInitialized); install(); };
if (i18n.isInitialized) install();
else i18n.on("initialized", onInitialized);

export const CITY_ROOT_IDS = ["public-services", "mobility", "events", "activities", "businesses", "hotels", "services", "jobs", "rentals", "products", "homes-nearby", "posts", "sos", "login"] as const;
export const CITY_GROUP_IDS = ["ps:new-in-city", "ps:family", "ps:work-benefits", "ps:health", "ps:business-professionals", "ps:city-daily", "ps:sos"] as const;
