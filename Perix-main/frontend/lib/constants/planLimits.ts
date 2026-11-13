// Indicative UI copy of the server-side plan limits (policy v18).
// The backend entitlement snapshot (GET /api/account/entitlements) is the
// only authority; these constants are for display and pre-flight UX only.
export const PLAN_LIMITS = {
  freeUser: {
    messagesPerMonth: 30,
    posts: 3,
    galleryPhotos: 3,
    galleryVideos: 0,
    classifiedAds: 3,
    personalProducts: 0,
    personalHomes: 0,
  },
  premiumUser: {
    messagesPerMonth: 200,
    posts: 12,
    galleryPhotos: 12,
    galleryVideos: 6,
    classifiedAds: 3,
    personalProducts: 10,
    personalHomes: 1,
  },
  business: {
    messagesPerMonth: null, // unlimited
    posts: 24,
    galleryPhotos: 30,
    galleryVideos: 12,
    products: 50,
    services: 10,
    menuEntries: 100,
    properties: 20,
    hotelRoomTypes: 10,
    hotelPhysicalUnits: 100,
    vehiclesForSale: 50,
    events: 4,
  },
} as const;

export type PlanId = "freeUser" | "premiumUser" | "business";
